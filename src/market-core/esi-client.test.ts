import { describe, expect, it } from "vitest";
import { EsiError, createEsiClient } from "./esi-client";
import type { EsiOrder } from "./esi-types";
import type { HttpResponse, Transport, TransportRequest } from "./transport";

interface RecordedCall {
  url: string;
  request: TransportRequest;
}

function fakeTransport(
  handler: (url: string, request: TransportRequest) => HttpResponse | Promise<HttpResponse>,
): { transport: Transport; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const transport: Transport = async (url, request) => {
    calls.push({ url, request });
    return handler(url, request);
  };
  return { transport, calls };
}

function order(partial: Partial<EsiOrder> = {}): EsiOrder {
  return {
    duration: 90,
    is_buy_order: false,
    issued: "2026-11-19T18:26:03Z",
    location_id: 60003760,
    min_volume: 1,
    order_id: 1,
    price: 4.1,
    range: "station",
    system_id: 30000142,
    type_id: 34,
    volume_remain: 100,
    volume_total: 100,
    ...partial,
  };
}

const clockAt = (ms: number) => ({ now: () => ms });

describe("createEsiClient paging", () => {
  it("walks every page reported by X-Pages and stops there", async () => {
    const { transport, calls } = fakeTransport((url): HttpResponse => {
      const page = new URL(url).searchParams.get("page");
      if (page === null) {
        return {
          status: 200,
          headers: { "x-pages": "3", etag: '"p1"' },
          body: JSON.stringify([order({ order_id: 1 })]),
        };
      }
      return {
        status: 200,
        headers: {},
        body: JSON.stringify([order({ order_id: Number(page) })]),
      };
    });

    const client = createEsiClient({ transport, ...clockAt(0) });
    const orders = await client.getOrders(10000002, 34);

    expect(orders.map((entry) => entry.order_id)).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(3);
    expect(calls.some((call) => call.url.includes("page=4"))).toBe(false);
  });

  it("keeps collected pages when a later page answers 404", async () => {
    const { transport, calls } = fakeTransport((url): HttpResponse => {
      const page = new URL(url).searchParams.get("page");
      if (page === null) {
        return {
          status: 200,
          headers: { "x-pages": "3" },
          body: JSON.stringify([order({ order_id: 1 })]),
        };
      }
      return { status: 404, headers: {}, body: '{"error":"Not found"}' };
    });

    const client = createEsiClient({ transport, ...clockAt(0) });
    const orders = await client.getOrders(10000002, 34);

    expect(orders).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("refuses a runaway X-Pages instead of hammering the API", async () => {
    const { transport } = fakeTransport(() => ({
      status: 200,
      headers: { "x-pages": "999" },
      body: "[]",
    }));

    const client = createEsiClient({ transport, maxPages: 50, ...clockAt(0) });
    await expect(client.getOrders(10000002, 34)).rejects.toBeInstanceOf(EsiError);
  });
});

describe("createEsiClient caching", () => {
  it("serves a fresh response from cache without a second request", async () => {
    const { transport, calls } = fakeTransport(() => ({
      status: 200,
      headers: { expires: new Date(1_000_000).toUTCString() },
      body: JSON.stringify([order()]),
    }));

    const client = createEsiClient({ transport, ...clockAt(0) });
    await client.getOrders(10000002, 34);
    await client.getOrders(10000002, 34);

    expect(calls).toHaveLength(1);
  });

  it("revalidates with If-None-Match and reuses the body on 304", async () => {
    const base = Date.parse("2026-11-19T18:00:00Z");
    const state = { clock: base };
    const { transport, calls } = fakeTransport((url, request) => {
      const expires = new Date(state.clock + 300_000).toUTCString();
      if (request.headers["If-None-Match"] === '"v1"') {
        return { status: 304, headers: { etag: '"v2"', expires }, body: "" };
      }
      return {
        status: 200,
        headers: { etag: '"v1"', expires },
        body: JSON.stringify([order()]),
      };
    });

    const client = createEsiClient({ transport, now: () => state.clock });
    const first = await client.getOrders(10000002, 34);

    state.clock = base + 400_000; // past Expires
    const second = await client.getOrders(10000002, 34);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.request.headers["If-None-Match"]).toBe('"v1"');
    expect(second).toEqual(first);

    // The 304 carries a fresh Expires, so the next call is a cache hit.
    const third = await client.getOrders(10000002, 34);
    expect(calls).toHaveLength(2);
    expect(third).toBe(second);
  });

  it("deduplicates concurrent requests for the same key", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const { transport, calls } = fakeTransport(async () => {
      await gate;
      return { status: 200, headers: {}, body: JSON.stringify([order()]) };
    });

    const client = createEsiClient({ transport, ...clockAt(0) });
    const first = client.getOrders(10000002, 34);
    const second = client.getOrders(10000002, 34);

    release();
    const [a, b] = await Promise.all([first, second]);

    expect(calls).toHaveLength(1);
    expect(a).toBe(b);
  });

  it("surfaces upstream failures as EsiError", async () => {
    const { transport } = fakeTransport(() => ({
      status: 503,
      headers: {},
      body: '{"error":"service unavailable"}',
    }));

    const client = createEsiClient({ transport, ...clockAt(0) });
    await expect(client.getOrders(10000002, 34)).rejects.toThrow(/503/);
  });

  it("evicts the least recently used book when the cache is full", async () => {
    const { transport, calls } = fakeTransport(() => ({
      status: 200,
      headers: {},
      body: JSON.stringify([order()]),
    }));

    const client = createEsiClient({
      transport,
      maxCacheEntries: 2,
      ...clockAt(0),
    });

    await client.getOrders(10000002, 1);
    await client.getOrders(10000002, 2);
    // Reading 1 makes it the most recent, so 3 must evict 2 instead.
    await client.getOrders(10000002, 1);
    await client.getOrders(10000002, 3);

    expect(client.cacheSize()).toBe(2);
    expect(calls).toHaveLength(3);

    await client.getOrders(10000002, 1);
    expect(calls).toHaveLength(3);

    await client.getOrders(10000002, 2);
    expect(calls).toHaveLength(4);
  });
});
