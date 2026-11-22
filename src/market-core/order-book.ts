import type { EsiOrder } from "./esi-types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderBookFilter {
  readonly systemId?: number;
  readonly stationId?: number;
}

export interface OrderBookRow {
  readonly orderId: number;
  readonly price: number;
  readonly volumeRemain: number;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly ageMs: number;
  readonly remainingMs: number;
  readonly cumulativeQuantity: number;
  readonly depthFraction: number;
}

export interface OrderBook {
  readonly buy: readonly OrderBookRow[];
  readonly sell: readonly OrderBookRow[];
  readonly buyTotal: number;
  readonly sellTotal: number;
}

export function prepareOrderBook(
  orders: readonly EsiOrder[],
  filter: OrderBookFilter = {},
  now = Date.now(),
): OrderBook {
  const buyOrders: EsiOrder[] = [];
  const sellOrders: EsiOrder[] = [];

  for (const order of orders) {
    if (
      filter.systemId !== undefined &&
      order.system_id !== filter.systemId
    ) {
      continue;
    }
    if (
      filter.stationId !== undefined &&
      order.location_id !== filter.stationId
    ) {
      continue;
    }
    (order.is_buy_order ? buyOrders : sellOrders).push(order);
  }

  const buy = prepareSide(buyOrders, true, now);
  const sell = prepareSide(sellOrders, false, now);
  return {
    buy: buy.rows,
    sell: sell.rows,
    buyTotal: buy.total,
    sellTotal: sell.total,
  };
}

function prepareSide(
  orders: readonly EsiOrder[],
  isBuy: boolean,
  now: number,
): { readonly rows: readonly OrderBookRow[]; readonly total: number } {
  const sorted = [...orders].sort((a, b) => {
    const priceOrder = isBuy ? b.price - a.price : a.price - b.price;
    if (priceOrder !== 0) return priceOrder;
    const issuedOrder = Date.parse(a.issued) - Date.parse(b.issued);
    return issuedOrder !== 0 ? issuedOrder : a.order_id - b.order_id;
  });
  const total = sorted.reduce((sum, order) => sum + order.volume_remain, 0);
  const rows: OrderBookRow[] = [];
  let cumulativeQuantity = 0;

  for (let start = 0; start < sorted.length; ) {
    const price = sorted[start]?.price;
    if (price === undefined) break;

    let end = start + 1;
    let levelQuantity = sorted[start]?.volume_remain ?? 0;
    while (end < sorted.length && sorted[end]?.price === price) {
      levelQuantity += sorted[end]?.volume_remain ?? 0;
      end += 1;
    }
    cumulativeQuantity += levelQuantity;
    const depthFraction = total === 0 ? 0 : cumulativeQuantity / total;

    for (let index = start; index < end; index += 1) {
      const order = sorted[index];
      if (order === undefined) continue;
      const issuedAt = Date.parse(order.issued);
      if (!Number.isFinite(issuedAt) || !Number.isSafeInteger(order.duration)) {
        throw new Error(`Order ${order.order_id} has invalid time data.`);
      }
      const expiresAt = issuedAt + order.duration * DAY_MS;
      rows.push({
        orderId: order.order_id,
        price: order.price,
        volumeRemain: order.volume_remain,
        issuedAt,
        expiresAt,
        ageMs: Math.max(0, now - issuedAt),
        remainingMs: expiresAt - now,
        cumulativeQuantity,
        depthFraction,
      });
    }
    start = end;
  }

  return { rows, total };
}
