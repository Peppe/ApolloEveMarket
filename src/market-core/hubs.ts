/**
 * The five hubs we price against.
 *
 * Both ids matter: orders are fetched per REGION (that is how the ESI endpoint
 * is scoped) but filtered per SYSTEM, because a region spans several markets
 * and mixing them produces negative spreads (see docs/spec/intent.md).
 */

export type HubKey = "jita" | "dodixie" | "amarr" | "hek" | "rens";

export interface Hub {
  readonly key: HubKey;
  readonly label: string;
  readonly regionId: number;
  readonly systemId: number;
}

export const HUBS: readonly Hub[] = [
  { key: "jita", label: "Jita", regionId: 10000002, systemId: 30000142 },
  { key: "dodixie", label: "Dodixie", regionId: 10000032, systemId: 30002659 },
  { key: "amarr", label: "Amarr", regionId: 10000043, systemId: 30002187 },
  { key: "hek", label: "Hek", regionId: 10000042, systemId: 30002053 },
  { key: "rens", label: "Rens", regionId: 10000030, systemId: 30002510 },
] as const;

export const HUB_KEYS: readonly HubKey[] = HUBS.map((hub) => hub.key);
