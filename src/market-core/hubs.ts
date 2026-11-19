/**
 * The five hubs we price against.
 *
 * Three ids matter: orders are fetched per REGION (that is how the ESI
 * endpoint is scoped), filtered per SYSTEM, and optionally narrowed to the
 * hub's primary STATION. A region spans several markets and mixing them
 * produces negative spreads (see docs/spec/intent.md).
 *
 * Station ids were verified on 2026-11-19 from /universe/systems/{id}/ plus
 * /universe/names/. Jita has two "Caldari Navy Assembly Plant" stations; the
 * trade hub is the Moon 4 one (60003760), not Moon 5 (60003757).
 */

export type HubKey = "jita" | "dodixie" | "amarr" | "hek" | "rens";

export interface Hub {
  readonly key: HubKey;
  readonly label: string;
  readonly regionId: number;
  readonly systemId: number;
  readonly stationId: number;
  readonly stationName: string;
}

export const HUBS: readonly Hub[] = [
  {
    key: "jita",
    label: "Jita",
    regionId: 10000002,
    systemId: 30000142,
    stationId: 60003760,
    stationName: "Jita IV - Moon 4 - Caldari Navy Assembly Plant",
  },
  {
    key: "dodixie",
    label: "Dodixie",
    regionId: 10000032,
    systemId: 30002659,
    stationId: 60011866,
    stationName: "Dodixie IX - Moon 20 - Federation Navy Assembly Plant",
  },
  {
    key: "amarr",
    label: "Amarr",
    regionId: 10000043,
    systemId: 30002187,
    stationId: 60008494,
    stationName: "Amarr VIII (Oris) - Emperor Family Academy",
  },
  {
    key: "hek",
    label: "Hek",
    regionId: 10000042,
    systemId: 30002053,
    stationId: 60005686,
    stationName: "Hek VIII - Moon 12 - Boundless Creation Factory",
  },
  {
    key: "rens",
    label: "Rens",
    regionId: 10000030,
    systemId: 30002510,
    stationId: 60004588,
    stationName: "Rens VI - Moon 8 - Brutor Tribe Treasury",
  },
] as const;

export const HUB_KEYS: readonly HubKey[] = HUBS.map((hub) => hub.key);
