import { describe, expect, it } from "vitest";
import type { EsiIdsResponse, EsiOrder } from "./esi-types";
import { EsiBudgetError } from "./http-guards";
import { createLiveMarket } from "./live";
import { readFixtureJson } from "./testing/fixtures";
import type { HttpResponse, Transport } from "./transport";

const idsFixture = readFixtureJson<EsiIdsResponse>("universe-ids-names");

function order(): EsiOrder {
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
  };
}

/**
 * These tests exercise the wiring, not the numbers: a fake transport proves
 * that orders and name resolution really share one gate and one budget.
 */
describe("createLiveMarket wiring", () => {
  it("sends name resolution and order fetching through the same gate", async () => {
    let active = 0;
    let peak = 0;

    const transport: Transport = async (url): Promise<HttpResponse> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
      active -= 1;

      if (url.includes("/universe/ids/")) {
        return { status: 200, headers: {}, body: JSON.stringify(idsFixture) };
      }
      return { status: 200, headers: {}, body: JSON.stringify([order()]) };
    };

    const market = createLiveMarket({ transport, maxConcurrentRequests: 1 });

    await Promise.all([
      market.resolveNames(["Tritanium"]),
      market.getOrders(10000002, 34),
      market.getOrders(10000002, 35),
    ]);

    expect(peak).toBe(1);
  });

  it("bubbles the budget guard up as one typed error", async () => {
    const transport: Transport = async (url): Promise<HttpResponse> => {
      if (url.includes("/universe/ids/")) {
        return { status: 200, headers: {}, body: JSON.stringify(idsFixture) };
      }
      return {
        status: 200,
        headers: { "x-esi-error-limit-remain": "0", "x-esi-error-limit-reset": "20" },
        body: JSON.stringify([order()]),
      };
    };

    const market = createLiveMarket({ transport });
    await market.getOrders(10000002, 34);

    const error = await market.getOrders(10000002, 35).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EsiBudgetError);
    expect((error as EsiBudgetError).retryAfterMs).toBe(20_000);
    expect(market.stats().budget.errorRemain).toBe(0);
  });

  it("resolves a repeated paste without another ids request", async () => {
    let idsCalls = 0;
    const transport: Transport = async (): Promise<HttpResponse> => {
      idsCalls += 1;
      return { status: 200, headers: {}, body: JSON.stringify(idsFixture) };
    };

    const market = createLiveMarket({ transport });
    await market.resolveNames(["Tritanium", "Ishtar"]);
    await market.resolveNames(["Tritanium", "Ishtar"]);

    expect(idsCalls).toBe(1);
  });
});
