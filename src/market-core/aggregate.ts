import type { EsiOrder } from "./esi-types";

export interface BookSide {
  readonly price: number;
  readonly volumeRemain: number;
}

export interface HubBook {
  /** Highest bid: what instant-selling to buy orders yields. */
  readonly bestBuy: BookSide | null;
  /** Lowest ask: what instant-buying from sell orders costs. */
  readonly bestSell: BookSide | null;
  readonly orderCount: number;
  readonly buyOrderCount: number;
  readonly sellOrderCount: number;
}

/**
 * The best bid and ask for one item in one hub system.
 *
 * Orders are region-scoped upstream but must be filtered to the hub's system:
 * a region contains several markets, and mixing them produced a -42% spread on
 * real Tritanium data (docs/spec/intent.md).
 */
export function aggregateBook(
  orders: readonly EsiOrder[],
  systemId: number,
  stationId?: number,
): HubBook {
  let bestBuy: BookSide | null = null;
  let bestSell: BookSide | null = null;
  let buyOrderCount = 0;
  let sellOrderCount = 0;

  for (const order of orders) {
    if (order.system_id !== systemId) continue;
    if (stationId !== undefined && order.location_id !== stationId) continue;

    const side: BookSide = {
      price: order.price,
      volumeRemain: order.volume_remain,
    };

    if (order.is_buy_order) {
      buyOrderCount += 1;
      if (bestBuy === null || side.price > bestBuy.price) bestBuy = side;
    } else {
      sellOrderCount += 1;
      if (bestSell === null || side.price < bestSell.price) bestSell = side;
    }
  }

  return {
    bestBuy,
    bestSell,
    orderCount: buyOrderCount + sellOrderCount,
    buyOrderCount,
    sellOrderCount,
  };
}

export function emptyBook(): HubBook {
  return {
    bestBuy: null,
    bestSell: null,
    orderCount: 0,
    buyOrderCount: 0,
    sellOrderCount: 0,
  };
}
