import { describe, expect, it } from "vitest";
import type { EsiIdsResponse } from "./esi-types";
import { createCachedIdsFetcher, createIdsFetcher, resolveNames } from "./resolve";
import {
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  type HttpResponse,
  type TransportRequest,
} from "./transport";
import { readFixtureJson } from "./testing/fixtures";

const idsFixture = readFixtureJson<EsiIdsResponse>("universe-ids-names");

describe("resolveNames", () => {
  it("resolves inventory types and ignores the character bucket", async () => {
    const result = await resolveNames(
      ["Tritanium", "Hobgoblin I", "Vespa I", "Scourge Heavy Missile", "Ishtar"],
      async () => idsFixture,
    );

    expect(result.types.get("tritanium")).toEqual({
      typeId: 34,
      name: "Tritanium",
    });
    // The same capture also matches a character named "Tritanium".
    expect(result.types.get("tritanium")?.typeId).not.toBe(243070982);
    expect(result.types.size).toBe(5);
    expect(result.unresolved).toEqual([]);
  });

  it("reports unknown names instead of throwing", async () => {
    const result = await resolveNames(
      ["Tritanium", "Definitely Not An Item"],
      async (names) => ({
        inventory_types: (idsFixture.inventory_types ?? []).filter((entry) =>
          names.some((name) => name.toLowerCase() === entry.name.toLowerCase()),
        ),
      }),
    );

    expect(result.unresolved).toEqual(["definitely not an item"]);
    expect(result.types.size).toBe(1);
  });

  it("does not resolve names that only match non-inventory buckets", async () => {
    const charactersOnly: EsiIdsResponse = {
      characters: [{ id: 42, name: "Some Pilot" }],
    };
    const result = await resolveNames(["Some Pilot"], async () => charactersOnly);
    expect(result.types.size).toBe(0);
    expect(result.unresolved).toEqual(["some pilot"]);
  });

  it("sends a bare JSON array in one batch per 100 names", async () => {
    const requests: TransportRequest[] = [];
    const transport = async (
      _url: string,
      request: TransportRequest,
    ): Promise<HttpResponse> => {
      requests.push(request);
      return { status: 200, headers: {}, body: JSON.stringify(idsFixture) };
    };

    const names = Array.from({ length: 150 }, (_, index) => `Item ${index}`);
    await resolveNames(names, createIdsFetcher(transport, "https://example.test"));

    expect(requests).toHaveLength(2);
    const firstBody = requests[0]?.body ?? "";
    const parsed = JSON.parse(firstBody) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers["Content-Type"]).toBe("application/json");
    expect(requests[0]?.headers["User-Agent"]).toBe(ESI_USER_AGENT);
    expect(ESI_USER_AGENT).toContain("ApolloEveMarket/0.3.0");
    expect(ESI_USER_AGENT).toContain("(+https://github.com/Peppe/ApolloEveMarket)");
    expect(requests[0]?.headers["X-Compatibility-Date"]).toBe(
      ESI_COMPATIBILITY_DATE,
    );
  });
});

describe("createCachedIdsFetcher", () => {
  it("asks once and merges cached hits into later responses", async () => {
    const batches: string[][] = [];
    const fetcher = createCachedIdsFetcher(async (names) => {
      batches.push([...names]);
      return {
        inventory_types: (idsFixture.inventory_types ?? []).filter((entry) =>
          names.some((name) => name.toLowerCase() === entry.name.toLowerCase()),
        ),
      };
    });

    const first = await resolveNames(["Tritanium"], fetcher);
    const second = await resolveNames(["tritanium", "Ishtar"], fetcher);

    expect(batches).toEqual([["Tritanium"], ["Ishtar"]]);
    expect(first.types.size).toBe(1);
    expect(second.types.get("tritanium")).toEqual({ typeId: 34, name: "Tritanium" });
    expect(second.types.get("ishtar")?.typeId).toBe(12005);
    expect(second.unresolved).toEqual([]);
  });

  it("re-queries names that did not resolve", async () => {
    const batches: string[][] = [];
    const fetcher = createCachedIdsFetcher(async (names) => {
      batches.push([...names]);
      return {
        inventory_types: names
          .filter((name) => name === "Tritanium")
          .map((name) => ({ id: 34, name })),
      };
    });

    await resolveNames(["Tritanium", "Typo"], fetcher);
    const again = await resolveNames(["Tritanium", "Typo"], fetcher);

    expect(batches).toEqual([
      ["Tritanium", "Typo"],
      ["Typo"],
    ]);
    expect(again.unresolved).toEqual(["typo"]);
  });

  it("does not ask at all when everything is cached", async () => {
    let calls = 0;
    const fetcher = createCachedIdsFetcher(async () => {
      calls += 1;
      return idsFixture;
    });

    await resolveNames(["Tritanium", "Ishtar"], fetcher);
    const again = await resolveNames(["Tritanium", "Ishtar"], fetcher);

    expect(calls).toBe(1);
    expect(again.types.size).toBe(2);
  });

  it("evicts the oldest remembered name past its bound", async () => {
    let calls = 0;
    const fetcher = createCachedIdsFetcher(
      async (names) => {
        calls += 1;
        return { inventory_types: names.map((name) => ({ id: 1, name })) };
      },
      { maxEntries: 1 },
    );

    await resolveNames(["First"], fetcher);
    await resolveNames(["Second"], fetcher);
    await resolveNames(["First"], fetcher);

    expect(calls).toBe(3);
  });
});
