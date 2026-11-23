import { describe, expect, it } from "vitest";
import { readFixtureJson } from "./testing/fixtures";
import type { EsiOrder } from "./esi-types";
import { prepareOrderBook } from "./order-book";

const orders = readFixtureJson<EsiOrder[]>("orders-forge-tritanium");
const now = Date.parse("2026-11-22T00:00:00Z");

describe("prepareOrderBook", () => {
  it("keeps individual orders and sorts both sides by ascending price", () => {
    const book = prepareOrderBook(orders, {}, now);
    expect(book.buy).toHaveLength(orders.filter((order) => order.is_buy_order).length);
    expect(book.sell).toHaveLength(orders.filter((order) => !order.is_buy_order).length);
    expect(book.buy[0]?.price).toBe(Math.min(...book.buy.map((order) => order.price)));
    expect(book.sell[0]?.price).toBe(Math.min(...book.sell.map((order) => order.price)));
    expect(book.buy.map((order) => order.orderId).sort((a, b) => a - b)).toEqual(
      orders
        .filter((order) => order.is_buy_order)
        .map((order) => order.order_id)
        .sort((a, b) => a - b),
    );
    expect(new Set(book.sell.map((order) => order.orderId)).size).toBe(book.sell.length);
    for (const rows of [book.buy, book.sell]) {
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1];
        const current = rows[index];
        if (previous === undefined || current === undefined) {
          throw new Error("Expected an order row at this index.");
        }
        if (previous.price === current.price) {
          expect(previous.issuedAt).toBeLessThanOrEqual(current.issuedAt);
        } else {
          expect(previous.price).toBeLessThan(current.price);
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

  it("increments cumulative totals and depth for each same-price buy order", () => {
    const book = prepareOrderBook(orders, {}, now);
    const price = 3.7;
    const levelOrders = orders.filter(
      (order) => order.is_buy_order && order.price === price,
    );
    const rows = book.buy.filter((order) => order.price === price);
    expect(rows).toHaveLength(levelOrders.length);
    for (let index = 0; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const row = rows[index];
      if (row === undefined) throw new Error("Expected an order row.");
      const position = book.buy.indexOf(row);
      const expectedCumulative = book.buy
        .slice(0, position + 1)
        .reduce((sum, order) => sum + order.volumeRemain, 0);
      expect(row.cumulativeQuantity).toBe(expectedCumulative);
      expect(row.depthFraction).toBe(expectedCumulative / book.buyTotal);
      if (previous !== undefined) {
        expect(row.cumulativeQuantity).toBe(
          previous.cumulativeQuantity + row.volumeRemain,
        );
      }
    }
  });

  it("increments cumulative totals for each same-price sell order", () => {
    const book = prepareOrderBook(orders, {}, now);
    const price = 4.3;
    const rows = book.sell.filter((order) => order.price === price);
    expect(rows.length).toBeGreaterThan(1);
    for (let index = 0; index < rows.length; index += 1) {
      const previous = rows[index - 1];
      const row = rows[index];
      if (row === undefined) throw new Error("Expected an order row.");
      const position = book.sell.indexOf(row);
      const expectedCumulative = book.sell
        .slice(0, position + 1)
        .reduce((sum, order) => sum + order.volumeRemain, 0);
      expect(row.cumulativeQuantity).toBe(expectedCumulative);
      if (previous !== undefined) {
        expect(row.cumulativeQuantity).toBe(
          previous.cumulativeQuantity + row.volumeRemain,
        );
      }
    }
  });
});
