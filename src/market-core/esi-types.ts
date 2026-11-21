/**
 * The subset of ESI payload shapes this project consumes.
 *
 * Shapes are taken from recorded responses in docs/spec/fixtures/, not from
 * memory. Fields we do not use are still typed, because ignoring a field is a
 * decision and should be visible.
 */

/** One order from `GET /markets/{region_id}/orders/`. */
export interface EsiOrder {
  readonly duration: number;
  readonly is_buy_order: boolean;
  readonly issued: string;
  readonly location_id: number;
  readonly min_volume: number;
  readonly order_id: number;
  readonly price: number;
  readonly range: string;
  readonly system_id: number;
  readonly type_id: number;
  readonly volume_remain: number;
  readonly volume_total: number;
}

/** One daily row from `GET /markets/{region_id}/history/`. */
export interface EsiMarketHistory {
  readonly average: number;
  readonly date: string;
  readonly highest: number;
  readonly lowest: number;
  readonly order_count: number;
  readonly volume: number;
}

export interface EsiIdEntry {
  readonly id: number;
  readonly name: string;
}

/**
 * Response of `POST /universe/ids/`.
 *
 * The same name can appear in more than one bucket: "Tritanium" resolves to a
 * character AND to inventory type 34. Callers must read `inventory_types`
 * only.
 */
export interface EsiIdsResponse {
  readonly characters?: readonly EsiIdEntry[];
  readonly inventory_types?: readonly EsiIdEntry[];
  readonly systems?: readonly EsiIdEntry[];
  readonly stations?: readonly EsiIdEntry[];
  readonly factions?: readonly EsiIdEntry[];
  readonly corporations?: readonly EsiIdEntry[];
  readonly alliances?: readonly EsiIdEntry[];
  readonly agents?: readonly EsiIdEntry[];
  readonly constellations?: readonly EsiIdEntry[];
  readonly regions?: readonly EsiIdEntry[];
}

export interface EsiTypeInfo {
  readonly name: string;
  readonly group_id: number;
  readonly volume: number;
  readonly portion_size: number;
  readonly published: boolean;
}
