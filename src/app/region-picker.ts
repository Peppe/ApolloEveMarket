import type { MarketRegion } from "@/market-core";

export function filterMarketRegions(
  regions: readonly MarketRegion[],
  query: string,
): readonly MarketRegion[] {
  const search = query.trim().toLowerCase();
  return search === ""
    ? regions
    : regions.filter((region) => region.name.toLowerCase().includes(search));
}

export function regionForEnter(
  regions: readonly MarketRegion[],
  activeIndex: number,
): MarketRegion | undefined {
  return regions.length === 1 ? regions[0] : regions[activeIndex];
}
