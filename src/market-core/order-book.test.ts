import { describe, expect, it } from "vitest";
import { readFixtureJson } from "./testing/fixtures";
import type { EsiOrder } from "./esi-types";
import { prepareOrderBook } from "./order-book";

const orders = readFixtureJson<EsiOrder[]>("orders-forge-tritanium");
const now = Date.parse("2026-11-22T00:00:00Z");

describe("prepareOrderBook", () => {
  it("keeps individual orders and sorts both sides best-price-first", () => {
    const book = prepareOrderBook(orders, {}, now);
    expect(book.buy).toHaveLength(orders.filter((order) => order.is_buy_order).length);
    expect(book.sell).toHaveLength(orders.filter((order) => !order.is_buy_order).length);
    expect(book.buy[0]?.price).toBe(Math.max(...book.buy.map((order) => order.price)));
    expect(book.sell[0]?.price).toBe(Math.min(...book.sell.map((order) => order.price)));
    expect(book.buy.map((order) => order.orderId).sort((a, b) => a - b)).toEqual(
      orders
        .filter((order) => order.is_buy_order)
        .map((order) => order.order_id)
        .sort((a, b) => a - b),
    );
    expect(new Set(book.sell.map((order) => order.orderId)).size).toBe(book.sell.length);
    for (const [rows, isBuy] of [[book.buy, true], [book.sell, false]] as const) {
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1];
        const current = rows[index];
        if (previous === undefined || current === undefined) {
          throw new Error("Expected an order row at this index.");
        }
        if (previous?.price === current?.price) {
          expect(previous.issuedAt).toBeLessThanOrEqual(current.issuedAt);
        } else if (isBuy) {
          expect(previous?.price).toBeGreaterThan(current?.price ?? 0);
        } else {
          expect(previous?.price).toBeLessThan(current?.price ?? Infinity);
        }
      }
    }
  });

  it("uses the fixture's station and system fields to filter orders", () => {
    const jita = prepareOrderBook(
      orders,
      { systemId: 30000142, stationId: 60003760 },
      now,
    );
    expect([...jita.buy, ...jita.sell].length).toBeLessThan(orders.length);
    for (const order of [...jita.buy, ...jita.sell]) {
      const fixtureOrder = orders.find((candidate) => candidate.order_id === order.orderId);
      expect(fixtureOrder?.system_id).toBe(30000142);
      expect(fixtureOrder?.location_id).toBe(60003760);
    }
  });

  it("derives issue age and expiry from the fixture's order duration", () => {
    const orderId = 7473598611;
    const order = orders.find((candidate) => candidate.order_id === orderId);
    const book = prepareOrderBook(orders, {}, now);
    const row = book.sell.find((candidate) => candidate.orderId === orderId);

    expect(order).toBeDefined();
    expect(row?.issuedAt).toBe(Date.parse(order?.issued ?? ""));
    expect(row?.expiresAt).toBe(
      Date.parse(order?.issued ?? "") + (order?.duration ?? 0) * 24 * 60 * 60 * 1000,
    );
    expect(row?.ageMs).toBe(now - (row?.issuedAt ?? now));
    expect(row?.remainingMs).toBe((row?.expiresAt ?? now) - now);
  });

  it("shares cumulative totals and depth across same-price orders", () => {
    const book = prepareOrderBook(orders, {}, now);
    const price = 3.7;
    const levelOrders = orders.filter(
      (order) => order.is_buy_order && order.price === price,
    );
    const rows = book.buy.filter((order) => order.price === price);
    const expectedCumulative = orders
      .filter((order) => order.is_buy_order && order.price >= price)
      .reduce((sum, order) => sum + order.volume_remain, 0);

    expect(rows).toHaveLength(levelOrders.length);
    expect(rows.map((row) => row.cumulativeQuantity)).toEqual(
      Array(levelOrders.length).fill(expectedCumulative),
    );
    expect(rows.every((row) => row.depthFraction === expectedCumulative / book.buyTotal)).toBe(true);
  });

  it("counts sell depth from the lowest price outward", () => {
    const book = prepareOrderBook(orders, {}, now);
    const price = 4.3;
    const rows = book.sell.filter((order) => order.price === price);
    const expectedCumulative = orders
      .filter((order) => !order.is_buy_order && order.price <= price)
      .reduce((sum, order) => sum + order.volume_remain, 0);

    expect(rows.length).toBeGreaterThan(1);
    expect(rows.every((row) => row.cumulativeQuantity === expectedCumulative)).toBe(true);
  });
});
