import { describe, expect, it } from "vitest";
import { appraise, type AppraiseDeps } from "./appraise";
import type { EsiOrder } from "./esi-types";
import type { ResolveResult } from "./resolve";
import { readFixtureJson } from "./testing/fixtures";

const orders = readFixtureJson<EsiOrder[]>("orders-forge-tritanium");
const globalPlexOrders = [
  ...readFixtureJson<EsiOrder[]>("orders-global-plex"),
  ...readFixtureJson<EsiOrder[]>("orders-global-plex-page2"),
];

function deps(): AppraiseDeps {
  return {
    getOrders: async (regionId, typeId) =>
      regionId === 19000001 && typeId === 44992
        ? globalPlexOrders
        : regionId === 10000002 && typeId === 34
          ? orders
          : [],
    resolveNames: async (names): Promise<ResolveResult> => {
      const types = new Map<string, { typeId: number; name: string }>();
      const unresolved: string[] = [];
      for (const name of names) {
        const key = name.trim().toLowerCase();
        if (key === "tritanium") types.set(key, { typeId: 34, name: "Tritanium" });
        else if (key === "plex") types.set(key, { typeId: 44992, name: "PLEX" });
        else unresolved.push(key);
      }
      return { types, unresolved };
    },
  };
}

describe("appraise", () => {
  it("prices each item in four fixed hubs plus the custom region", async () => {
    const result = await appraise("Tritanium\t2\nTritanium 3\n", deps(), {
      priceMode: "station",
    });

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item?.quantity).toBe(5);
    expect(item?.hubs.jita.bestSell?.price).toBe(4.15);
    expect(item?.hubs.jita.bestBuy?.price).toBe(3.94);

    // Only The Forge has orders in this fake, so the other hubs are empty
    // rather than missing keys.
    expect(item?.hubs.dodixie.bestBuy).toBeNull();
    expect(Object.keys(item?.hubs ?? {})).toEqual([
      "jita",
      "dodixie",
      "amarr",
      "hek",
    ]);

    expect(result.totals.jita.buy).toBeCloseTo(3.94 * 5);
    expect(result.totals.jita.sell).toBeCloseTo(4.15 * 5);
    expect(result.totals.jita.missingBuy).toBe(0);
    expect(result.customTotal.missingBuy).toBe(1);
    expect(result.customTotal.buy).toBe(0);
  });

  it("keeps the custom column region-wide when fixed hubs use another scope", async () => {
    const result = await appraise("Tritanium", deps(), {
      priceMode: "station",
      customRegion: { id: 10000002, name: "The Forge" },
    });

    expect(result.items[0]?.hubs.jita.orderCount).toBe(110);
    expect(result.items[0]?.custom.orderCount).toBe(168);
    expect(result.customTotal.buy).toBe(3.95);
    expect(result.customTotal.sell).toBe(3.01);
  });

  it("defaults to region scope and supports station and system scopes", async () => {
    const region = await appraise("Tritanium", deps());
    expect(region.priceMode).toBe("region");
    expect(region.items[0]?.hubs.jita.orderCount).toBe(168);
    expect(region.items[0]?.hubs.jita.bestSell?.price).toBe(3.01);
    expect(region.items[0]?.hubs.jita.bestBuy?.price).toBe(3.95);

    const stationScoped = await appraise("Tritanium", deps(), {
      priceMode: "station",
    });
    expect(stationScoped.priceMode).toBe("station");
    expect(stationScoped.items[0]?.hubs.jita.orderCount).toBe(110);

    const system = await appraise("Tritanium", deps(), { priceMode: "system" });
    expect(system.priceMode).toBe("system");
    expect(system.items[0]?.hubs.jita.orderCount).toBe(113);

    expect(region.items[0]?.hubs.jita.orderCount).not.toBe(
      stationScoped.items[0]?.hubs.jita.orderCount,
    );
  });

  it("uses the global PLEX book for every hub without station or system filtering", async () => {
    const result = await appraise("PLEX", deps());
    const item = result.items[0];

    expect(item?.hubs.jita.bestBuy?.price).toBe(4_910_000);
    expect(item?.hubs.jita.bestSell?.price).toBe(5_083_000);
    expect(item?.hubs.jita.orderCount).toBe(1043);
    expect(item?.custom).toEqual(item?.hubs.jita);
    for (const hub of ["jita", "dodixie", "amarr", "hek"] as const) {
      expect(item?.hubs[hub]).toEqual(item?.hubs.jita);
    }

    const system = await appraise("PLEX", deps(), { priceMode: "system" });
    expect(system.items[0]?.hubs).toEqual(item?.hubs);
  });

  it("returns unresolved names and rejected lines alongside prices", async () => {
    const result = await appraise(
      "Tritanium 1\nNot An Item 1\nbad quantity 1.5\n",
      deps(),
    );

    expect(result.items).toHaveLength(1);
    expect(result.unresolved).toEqual([{ name: "Not An Item", quantity: 1 }]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.reason).toContain("ambiguous decimal");
  });

  it("keeps input order and prices nothing when the paste resolves to nothing", async () => {
    const result = await appraise("Not An Item 1", deps());
    expect(result.items).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
    expect(result.totals.jita).toEqual({
      buy: 0,
      sell: 0,
      missingBuy: 0,
      missingSell: 0,
    });
  });
});
