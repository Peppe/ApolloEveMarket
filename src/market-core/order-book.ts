import type { EsiOrder } from "./esi-types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderBookFilter {
  readonly systemId?: number;
  readonly stationId?: number;
}

export interface OrderBookRow {
  readonly orderId: number;
  readonly locationId: number;
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

  const buy = prepareSide(buyOrders, now);
  const sell = prepareSide(sellOrders, now);
  return {
    buy: buy.rows,
    sell: sell.rows,
    buyTotal: buy.total,
    sellTotal: sell.total,
  };
}

function prepareSide(
  orders: readonly EsiOrder[],
  now: number,
): { readonly rows: readonly OrderBookRow[]; readonly total: number } {
  const sorted = [...orders].sort((a, b) => {
    const priceOrder = a.price - b.price;
    if (priceOrder !== 0) return priceOrder;
    const issuedOrder = Date.parse(a.issued) - Date.parse(b.issued);
    return issuedOrder !== 0 ? issuedOrder : a.order_id - b.order_id;
  });
  const total = sorted.reduce((sum, order) => sum + order.volume_remain, 0);
  const rows: OrderBookRow[] = [];
  let cumulativeQuantity = 0;

  for (const order of sorted) {
    cumulativeQuantity += order.volume_remain;
    const depthFraction = total === 0 ? 0 : cumulativeQuantity / total;
    const issuedAt = Date.parse(order.issued);
    if (!Number.isFinite(issuedAt) || !Number.isSafeInteger(order.duration)) {
      throw new Error(`Order ${order.order_id} has invalid time data.`);
    }
    const expiresAt = issuedAt + order.duration * DAY_MS;
    rows.push({
      orderId: order.order_id,
      locationId: order.location_id,
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

  return { rows, total };
}
