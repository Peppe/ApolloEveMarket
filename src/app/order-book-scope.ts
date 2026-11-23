import {
  HUBS,
  type MarketRegion,
  type PriceMode,
} from "../market-core";

const PLEX_TYPE_ID = 44992;
const GLOBAL_PLEX_REGION_ID = 19000001;

export interface OrderBookScope {
  readonly regionId: number;
  readonly label: string;
  readonly systemId?: number;
  readonly stationId?: number;
}

export function orderBookScopeFor(
  typeId: number,
  hubKey: string,
  mode: PriceMode,
  customRegion?: MarketRegion,
): OrderBookScope | null {
  if (!Number.isSafeInteger(typeId) || typeId < 1) return null;

  if (typeId === PLEX_TYPE_ID) {
    return { regionId: GLOBAL_PLEX_REGION_ID, label: "Global market (PLEX)" };
  }

  if (hubKey === "custom") {
    if (
      customRegion === undefined ||
      !Number.isSafeInteger(customRegion.id) ||
      customRegion.id < 1 ||
      customRegion.name.trim() === ""
    ) {
      return null;
    }
    return {
      regionId: customRegion.id,
      label: `${customRegion.name} region`,
    };
  }

  const hub = HUBS.find((entry) => entry.key === hubKey);
  if (hub === undefined) return null;
  if (mode === "station") {
    return {
      regionId: hub.regionId,
      label: hub.stationName,
      systemId: hub.systemId,
      stationId: hub.stationId,
    };
  }
  if (mode === "system") {
    return {
      regionId: hub.regionId,
      label: `${hub.label} solar system`,
      systemId: hub.systemId,
    };
  }
  return { regionId: hub.regionId, label: `${hub.label} region` };
}
