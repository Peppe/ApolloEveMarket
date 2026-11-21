import { HUBS, type MarketRegion } from "../market-core";

const PLEX_TYPE_ID = 44992;
const GLOBAL_PLEX_REGION_ID = 19000001;

export interface HistoryScope {
  readonly regionId: number;
  readonly label: string;
}

export function historyScopeFor(
  typeId: number,
  hubKey: string,
  customRegion?: MarketRegion,
): HistoryScope | null {
  if (!Number.isSafeInteger(typeId) || typeId < 1) return null;
  const hub = HUBS.find((entry) => entry.key === hubKey);
  const isCustomRegion =
    hubKey === "custom" &&
    customRegion !== undefined &&
    Number.isSafeInteger(customRegion.id) &&
    customRegion.id > 0 &&
    customRegion.name.trim() !== "";
  if (hub === undefined && !isCustomRegion) return null;

  if (typeId === PLEX_TYPE_ID) {
    return { regionId: GLOBAL_PLEX_REGION_ID, label: "Global market (PLEX)" };
  }
  if (hub !== undefined) {
    return { regionId: hub.regionId, label: `${hub.label} region` };
  }
  if (hubKey === "custom" && isCustomRegion && customRegion !== undefined) {
    return { regionId: customRegion.id, label: `${customRegion.name} region` };
  }
  return null;
}
