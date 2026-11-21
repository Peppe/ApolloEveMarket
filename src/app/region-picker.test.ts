import { describe, expect, it } from "vitest";
import type { MarketRegion } from "../market-core";
import { readFixtureJson } from "../market-core/testing/fixtures";
import {
  filterMarketRegions,
  regionForEnter,
} from "./region-picker";

const regions = readFixtureJson<
  { readonly category: string; readonly id: number; readonly name: string }[]
>("universe-region-names")
  .filter((entry) => entry.category === "region")
  .map(({ id, name }): MarketRegion => ({ id, name }));

describe("region picker", () => {
  it("can select the single search result with Enter without arrow navigation", () => {
    const matches = filterMarketRegions(regions, "syndi");

    expect(matches).toEqual([{ id: 10000041, name: "Syndicate" }]);
    expect(regionForEnter(matches, -1)).toEqual(matches[0]);
  });

  it("filters case-insensitively and clears to the full catalogue", () => {
    expect(filterMarketRegions(regions, "sYnDi")).toHaveLength(1);
    expect(filterMarketRegions(regions, "   ")).toHaveLength(regions.length);
  });

  it("uses the keyboard-active option when several regions match", () => {
    const matches = filterMarketRegions(regions, "the");

    expect(matches.length).toBeGreaterThan(1);
    expect(regionForEnter(matches, 1)).toEqual(matches[1]);
  });
});
