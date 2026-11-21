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
 * a region contains several markets, and mixing them can produce a spread
 * across orders that cannot trade with each other (docs/spec/intent.md).
 */
export function aggregateBook(
  orders: readonly EsiOrder[],
  systemId: number,
  stationId?: number,
): HubBook {
  return aggregateMatchingBook(
    orders,
    (order) =>
      order.system_id === systemId &&
      (stationId === undefined || order.location_id === stationId),
  );
}

/**
 * Aggregate a market whose orders are not tied to a hub system, such as PLEX.
 */
export function aggregateGlobalBook(orders: readonly EsiOrder[]): HubBook {
  return aggregateMatchingBook(orders, () => true);
}

/**
 * Aggregate every order in an upstream region-scoped market snapshot.
 *
 * This intentionally has no system or station filter. It is the in-game
 * regional market view, and is distinct from the aggregate per hub system
 * used by the station/system modes.
 */
export function aggregateRegionBook(orders: readonly EsiOrder[]): HubBook {
  return aggregateMatchingBook(orders, () => true);
}

function aggregateMatchingBook(
  orders: readonly EsiOrder[],
  matches: (order: EsiOrder) => boolean,
): HubBook {
  let bestBuy: BookSide | null = null;
  let bestSell: BookSide | null = null;
  let buyOrderCount = 0;
  let sellOrderCount = 0;

  for (const order of orders) {
    if (!matches(order)) continue;

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
