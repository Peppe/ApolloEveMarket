import { describe, expect, it } from "vitest";
import {
  EsiBudgetError,
  createEsiBudget,
  parseRetryAfter,
  withBudgetGuard,
  withConcurrencyLimit,
} from "./http-guards";
import type { HttpResponse, Transport, TransportRequest } from "./transport";

const request: TransportRequest = { headers: {} };

function ok(headers: Record<string, string> = {}): HttpResponse {
  return { status: 200, headers, body: "[]" };
}

function fail(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

describe("withConcurrencyLimit", () => {
  it("never runs more than the limit at once", async () => {
    let active = 0;
    let peak = 0;

    const inner: Transport = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return ok();
    };

    const transport = withConcurrencyLimit(inner, 3);
    const urls = Array.from({ length: 12 }, (_, index) => `https://example.test/${index}`);
    await Promise.all(urls.map((url) => transport(url, request)));

    expect(peak).toBe(3);
    expect(active).toBe(0);
  });

  it("releases the slot when a request throws", async () => {
    let calls = 0;
    const inner: Transport = async () => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return ok();
    };

    const transport = withConcurrencyLimit(inner, 1);
    await expect(transport("https://example.test/a", request)).rejects.toThrow("boom");
    await expect(transport("https://example.test/b", request)).resolves.toMatchObject({
      status: 200,
    });
  });
});

describe("createEsiBudget", () => {
  it("allows requests until a header says otherwise", async () => {
    const budget = createEsiBudget();
    const transport = withBudgetGuard(async () => ok(), budget);

    budget.check();
    await transport("https://example.test/a", request);

    expect(budget.snapshot()).toEqual({
      errorRemain: null,
      errorResetSeconds: null,
      requestRemain: null,
      requestLimit: null,
    });
  });

  it("refuses to start below the error floor and reports the reset", async () => {
    let calls = 0;
    const budget = createEsiBudget();
    budget.observe({
      "x-esi-error-limit-remain": "4",
      "x-esi-error-limit-reset": "12",
    });

    const transport = withBudgetGuard(async () => {
      calls += 1;
      return ok();
    }, budget);

    const error = fail(await transport("https://example.test/a", request).catch((e) => e));

    expect(error).toBeInstanceOf(EsiBudgetError);
    expect(error.message).toContain("down to 4");
    expect(error.message).toContain("12s");
    expect((error as EsiBudgetError).retryAfterMs).toBe(12_000);
    expect(calls).toBe(0);
  });

  it("refuses to start below the request floor", async () => {
    const budget = createEsiBudget();
    budget.observe({
      "x-ratelimit-limit": "12000/15m",
      "x-ratelimit-remaining": "99",
    });

    expect(() => budget.check()).toThrow(/down to 99 of 12000\/15m/);
  });

  it("keeps the last non-null value when a header is absent", () => {
    const budget = createEsiBudget();
    budget.observe({ "x-ratelimit-remaining": "5000" });
    budget.observe({ "x-esi-error-limit-remain": "100" });

    expect(budget.snapshot().requestRemain).toBe(5000);
    expect(budget.snapshot().errorRemain).toBe(100);
  });

  it("records every response so the next request sees the budget it left", async () => {
    const budget = createEsiBudget();
    const transport = withBudgetGuard(async () => ok({
      "x-ratelimit-group": "market-order",
      "x-ratelimit-limit": "12000/15m",
      "x-ratelimit-remaining": "11945",
    }), budget);

    await transport("https://example.test/a", request);

    expect(budget.snapshot()).toEqual({
      errorRemain: null,
      errorResetSeconds: null,
      requestRemain: 11945,
      requestLimit: "12000/15m",
    });
  });
});

describe("withBudgetGuard rate limits", () => {
  it("turns 429 with Retry-After seconds into one typed error", async () => {
    const transport = withBudgetGuard(
      async () => ({ status: 429, headers: { "retry-after": "30" }, body: "{}" }),
      createEsiBudget(),
      () => 0,
    );

    const error = fail(await transport("https://example.test/a", request).catch((e) => e));

    expect(error).toBeInstanceOf(EsiBudgetError);
    expect((error as EsiBudgetError).retryAfterMs).toBe(30_000);
    expect(error.message).toContain("30s");
  });

  it("treats 420 as a rate limit even without Retry-After", async () => {
    const transport = withBudgetGuard(
      async () => ({ status: 420, headers: {}, body: "{}" }),
      createEsiBudget(),
    );

    const error = fail(await transport("https://example.test/a", request).catch((e) => e));

    expect(error).toBeInstanceOf(EsiBudgetError);
    expect((error as EsiBudgetError).retryAfterMs).toBeUndefined();
    expect(error.message).toContain("rate limit");
  });

  it("lets other failures through unchanged", async () => {
    const transport = withBudgetGuard(
      async () => ({ status: 503, headers: {}, body: '{"error":"down"}' }),
      createEsiBudget(),
    );

    await expect(transport("https://example.test/a", request)).resolves.toMatchObject({
      status: 503,
    });
  });
});

describe("parseRetryAfter", () => {
  it("accepts delta-seconds", () => {
    expect(parseRetryAfter("30", 0)).toBe(30_000);
    expect(parseRetryAfter("0", 0)).toBe(0);
  });

  it("accepts an HTTP date", () => {
    const at = Date.parse("2026-11-19T19:00:00Z");
    expect(parseRetryAfter(new Date(at + 45_000).toUTCString(), at)).toBe(45_000);
  });

  it("rejects nonsense", () => {
    expect(parseRetryAfter(undefined, 0)).toBeUndefined();
    expect(parseRetryAfter("soon", 0)).toBeUndefined();
  });
});
