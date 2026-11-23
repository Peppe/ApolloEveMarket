import { describe, expect, it } from "vitest";
import type { EsiIdEntry, EsiIdsResponse, EsiOrder } from "./esi-types";
import {
  createCachedIdsFetcher,
  createCachedNamesFetcher,
  createIdsFetcher,
  createNamesFetcher,
  resolveNames,
  type NamesFetcher,
} from "./resolve";
import {
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  type HttpResponse,
  type TransportRequest,
} from "./transport";
import { readFixtureJson } from "./testing/fixtures";

const idsFixture = readFixtureJson<EsiIdsResponse>("universe-ids-names");
const orderLocationsFixture = readFixtureJson<EsiIdEntry[]>(
  "universe-order-locations",
);
const orderFixture = readFixtureJson<EsiOrder[]>("orders-forge-tritanium");

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
    expect(ESI_USER_AGENT).toContain("ApolloEveMarket/0.4.0");
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

describe("createNamesFetcher", () => {
  it("resolves station ids from recorded ESI names and skips structure ids", async () => {
    const requests: TransportRequest[] = [];
    const transport = async (
      url: string,
      request: TransportRequest,
    ): Promise<HttpResponse> => {
      requests.push(request);
      expect(url).toContain("/universe/names/");
      return {
        status: 200,
        headers: {},
        body: JSON.stringify(orderLocationsFixture),
      };
    };
    const locationIds = [...new Set(orderFixture.map((order) => order.location_id))];
    const structureIds = locationIds.filter((id) => id > 2_147_483_647);
    const names = await createNamesFetcher(transport, "https://example.test")(
      locationIds,
    );

    expect(names).toContainEqual(expect.objectContaining({
      id: 60003760,
      name: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
    }));
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]?.body ?? "[]")).not.toEqual(
      expect.arrayContaining(structureIds),
    );
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers["X-Compatibility-Date"]).toBe(
      ESI_COMPATIBILITY_DATE,
    );
  });

  it("batches large location lists within the ESI request limit", async () => {
    const requests: TransportRequest[] = [];
    const transport = async (
      _url: string,
      request: TransportRequest,
    ): Promise<HttpResponse> => {
      requests.push(request);
      return { status: 200, headers: {}, body: "[]" };
    };
    const ids = Array.from({ length: 101 }, (_, index) => 60000000 + index);

    await createNamesFetcher(transport, "https://example.test")(ids);

    expect(requests.map((request) => JSON.parse(request.body ?? "[]"))).toEqual([
      ids.slice(0, 100),
      ids.slice(100),
    ]);
  });

  it("caches resolved and unresolved location ids", async () => {
    let calls = 0;
    const inner: NamesFetcher = async (ids) => {
      calls += 1;
      return orderLocationsFixture.filter((entry) => ids.includes(entry.id));
    };
    const fetchNames = createCachedNamesFetcher(inner);
    const ids = [60003760, 60000001];

    const first = await fetchNames(ids);
    const second = await fetchNames(ids);

    expect(first).toEqual(second);
    expect(first).toContainEqual(
      orderLocationsFixture.find((entry) => entry.id === 60003760),
    );
    expect(calls).toBe(1);
  });
});
