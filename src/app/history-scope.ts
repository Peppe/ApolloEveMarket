import { HUBS } from "../market-core";

const PLEX_TYPE_ID = 44992;
const GLOBAL_PLEX_REGION_ID = 19000001;

export interface HistoryScope {
  readonly regionId: number;
  readonly label: string;
}

export function historyScopeFor(
  typeId: number,
  hubKey: string,
): HistoryScope | null {
  if (!Number.isSafeInteger(typeId) || typeId < 1) return null;
  const hub = HUBS.find((entry) => entry.key === hubKey);
  if (hub === undefined) return null;

  return typeId === PLEX_TYPE_ID
    ? { regionId: GLOBAL_PLEX_REGION_ID, label: "Global market (PLEX)" }
    : { regionId: hub.regionId, label: `${hub.label} region` };
}
