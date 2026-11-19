import { describe, expect, it } from "vitest";
import { appraise, type AppraiseDeps } from "./appraise";
import type { EsiOrder } from "./esi-types";
import type { ResolveResult } from "./resolve";
import { readFixtureJson } from "./testing/fixtures";

const orders = readFixtureJson<EsiOrder[]>("orders-forge-tritanium");

function deps(): AppraiseDeps {
  return {
    getOrders: async (regionId, typeId) =>
      regionId === 10000002 && typeId === 34 ? orders : [],
    resolveNames: async (names): Promise<ResolveResult> => {
      const types = new Map<string, { typeId: number; name: string }>();
      const unresolved: string[] = [];
      for (const name of names) {
        const key = name.trim().toLowerCase();
        if (key === "tritanium") types.set(key, { typeId: 34, name: "Tritanium" });
        else unresolved.push(key);
      }
      return { types, unresolved };
    },
  };
}

describe("appraise", () => {
  it("prices each item in all five hubs and totals the paste", async () => {
    const result = await appraise("Tritanium\t2\nTritanium 3\n", deps());

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    expect(item?.quantity).toBe(5);
    expect(item?.hubs.jita.bestSell?.price).toBe(4.1);
    expect(item?.hubs.jita.bestBuy?.price).toBe(3.96);

    // Only The Forge has orders in this fake, so the other hubs are empty
    // rather than missing keys.
    expect(item?.hubs.dodixie.bestBuy).toBeNull();
    expect(Object.keys(item?.hubs ?? {})).toEqual([
      "jita",
      "dodixie",
      "amarr",
      "hek",
      "rens",
    ]);

    expect(result.totals.jita.buy).toBeCloseTo(3.96 * 5);
    expect(result.totals.jita.sell).toBeCloseTo(4.1 * 5);
    expect(result.totals.jita.missingBuy).toBe(0);
    expect(result.totals.rens.missingBuy).toBe(1);
    expect(result.totals.rens.buy).toBe(0);
  });

  it("prices the hub station by default and the whole system on request", async () => {
    const station = await appraise("Tritanium", deps());
    expect(station.priceMode).toBe("station");
    expect(station.items[0]?.hubs.jita.orderCount).toBe(114);

    const system = await appraise("Tritanium", deps(), { priceMode: "system" });
    expect(system.priceMode).toBe("system");
    expect(system.items[0]?.hubs.jita.orderCount).toBe(117);

    // Both scopes land on the same best prices for this fixture: the extreme
    // orders happen to sit at Jita 4-4.
    expect(station.totals.jita.buy).toBeCloseTo(system.totals.jita.buy);
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
