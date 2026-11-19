import { describe, expect, it } from "vitest";
import { priceRank } from "./price-rank";

describe("priceRank", () => {
  it("ranks five distinct hub prices from most to least expensive", () => {
    const prices = [10, 8, 6, 4, 2];
    expect(prices.map((price) => priceRank(price, prices))).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  it("gives tied prices the same rank", () => {
    const prices = [10, 10, 8, 6, 4];
    expect(prices.map((price) => priceRank(price, prices))).toEqual([
      2, 2, 3, 4, 5,
    ]);
    const equalPrices = [7, 7, 7, 7, 7];
    expect(
      equalPrices.map((price) => priceRank(price, equalPrices)),
    ).toEqual([3, 3, 3, 3, 3]);
  });

  it("uses the full color range when some hub prices are missing", () => {
    const prices = [10, null, 2];
    expect(priceRank(10, prices)).toBe(1);
    expect(priceRank(null, prices)).toBeNull();
    expect(priceRank(2, prices)).toBe(5);
  });
});
