import { describe, expect, it } from "vitest";
import { aggregateBook, emptyBook } from "./aggregate";
import type { EsiOrder } from "./esi-types";
import { readFixtureJson } from "./testing/fixtures";

const JITA_SYSTEM = 30000142;
const PERIMETER_SYSTEM = 30000144;

describe("aggregateBook", () => {
  const orders = readFixtureJson<EsiOrder[]>("orders-forge-tritanium");

  it("returns the fixture's Jita book, not the region-wide book", () => {
    const book = aggregateBook(orders, JITA_SYSTEM);

    expect(book.bestSell?.price).toBe(4.1);
    expect(book.bestBuy?.price).toBe(3.96);
    expect(book.orderCount).toBe(117);
    expect(book.sellOrderCount).toBe(70);
    expect(book.buyOrderCount).toBe(47);
  });

  it("would produce a nonsense spread if the whole region were used", () => {
    const regionWideSell = Math.min(
      ...orders.filter((order) => !order.is_buy_order).map((order) => order.price),
    );
    const regionWideBuy = Math.max(
      ...orders.filter((order) => order.is_buy_order).map((order) => order.price),
    );

    // The trap this rule exists for: cheap asks and high bids live in
    // different systems, so "region best" beats itself.
    expect(regionWideSell).toBe(2.36);
    expect(regionWideSell).toBeLessThan(regionWideBuy);
  });

  it("keeps other systems' books separate", () => {
    const perimeter = aggregateBook(orders, PERIMETER_SYSTEM);
    expect(perimeter.bestSell?.price).toBe(4.2);
    expect(perimeter.bestBuy?.price).toBe(3.95);
    expect(perimeter.orderCount).toBe(24);
  });

  it("narrows to the hub's station when asked", () => {
    const station = aggregateBook(orders, JITA_SYSTEM, 60003760);

    expect(station.orderCount).toBe(114);
    expect(station.sellOrderCount).toBe(67);
    expect(station.buyOrderCount).toBe(47);
    expect(station.bestSell?.price).toBe(4.1);
    expect(station.bestBuy?.price).toBe(3.96);

    // The system book also carries orders in two other Jita stations.
    expect(aggregateBook(orders, JITA_SYSTEM).orderCount).toBe(117);
    expect(aggregateBook(orders, JITA_SYSTEM, 60015260).orderCount).toBe(2);
    expect(aggregateBook(orders, JITA_SYSTEM, 60003469).orderCount).toBe(1);
  });

  it("treats an empty book as a normal answer", () => {
    const empty = readFixtureJson<EsiOrder[]>("orders-forge-plex-empty");
    expect(empty).toEqual([]);
    expect(aggregateBook(empty, JITA_SYSTEM)).toEqual(emptyBook());
  });

  it("ignores orders from other systems entirely", () => {
    const book = aggregateBook(orders, 12345678);
    expect(book).toEqual(emptyBook());
  });
});
