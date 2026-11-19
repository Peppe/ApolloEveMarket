import {
  aggregateBook,
  aggregateGlobalBook,
  emptyBook,
  type HubBook,
} from "./aggregate";
import type { EsiOrder } from "./esi-types";
import { HUBS, type Hub, type HubKey } from "./hubs";
import { normalizeName, type ResolveResult } from "./resolve";
import { parseInventory, type RejectedLine } from "./parse";

export interface AppraiseDeps {
  readonly getOrders: (
    regionId: number,
    typeId: number,
  ) => Promise<readonly EsiOrder[]>;
  readonly resolveNames: (names: readonly string[]) => Promise<ResolveResult>;
  readonly hubs?: readonly Hub[];
  /** Parallel upstream requests. ESI is rate limited; stay modest. */
  readonly concurrency?: number;
}

export interface ItemPrice {
  readonly typeId: number;
  readonly name: string;
  readonly quantity: number;
  readonly hubs: Readonly<Record<HubKey, HubBook>>;
}

export interface UnresolvedItem {
  readonly name: string;
  readonly quantity: number;
}

export interface HubTotal {
  /** Sum of quantity * best buy, over items that have a bid. */
  readonly buy: number;
  /** Sum of quantity * best sell, over items that have an ask. */
  readonly sell: number;
  /** Items with no bid / no ask in this hub. */
  readonly missingBuy: number;
  readonly missingSell: number;
}

/**
 * Which orders count as "the hub's price".
 *
 * station - only the hub's primary station (default; what the market at Jita
 *           4-4 looks like).
 * system  - the whole solar system, including structures and other stations.
 */
export type PriceMode = "station" | "system";

export interface AppraiseOptions {
  readonly priceMode?: PriceMode;
}

export interface AppraiseResult {
  readonly items: readonly ItemPrice[];
  readonly rejected: readonly RejectedLine[];
  readonly unresolved: readonly UnresolvedItem[];
  readonly totals: Readonly<Record<HubKey, HubTotal>>;
  readonly priceMode: PriceMode;
}

const DEFAULT_CONCURRENCY = 6;
const PLEX_TYPE_ID = 44992;
const GLOBAL_PLEX_REGION_ID = 19000001;

async function mapLimit<T>(
  values: readonly T[],
  limit: number,
  run: (value: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workerCount = Math.min(Math.max(1, limit), values.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      const value = values[index];
      if (value !== undefined) await run(value);
    }
  });

  await Promise.all(workers);
}

function emptyBooks(hubs: readonly Hub[]): Record<HubKey, HubBook> {
  return Object.fromEntries(hubs.map((hub) => [hub.key, emptyBook()])) as Record<
    HubKey,
    HubBook
  >;
}

interface MutableTotal {
  buy: number;
  sell: number;
  missingBuy: number;
  missingSell: number;
}

function emptyTotals(hubs: readonly Hub[]): Record<HubKey, MutableTotal> {
  return Object.fromEntries(
    hubs.map((hub) => [hub.key, { buy: 0, sell: 0, missingBuy: 0, missingSell: 0 }]),
  ) as Record<HubKey, MutableTotal>;
}

/**
 * Parse pasted text, resolve it, price every item in every hub, and total the
 * paste per hub.
 *
 * Items keep their input order; rejected lines and unresolved names are
 * returned alongside the prices so the caller can show them instead of
 * pretending the whole paste succeeded.
 */
export async function appraise(
  text: string,
  deps: AppraiseDeps,
  options: AppraiseOptions = {},
): Promise<AppraiseResult> {
  const hubs = deps.hubs ?? HUBS;
  const priceMode = options.priceMode ?? "station";
  const parsed = parseInventory(text);

  const resolved = await deps.resolveNames(parsed.items.map((item) => item.name));

  const priced: { parsedIndex: number; typeId: number; typeName: string }[] = [];
  const unresolved: UnresolvedItem[] = [];

  parsed.items.forEach((item, parsedIndex) => {
    const hit = resolved.types.get(normalizeName(item.name));
    if (hit === undefined) {
      unresolved.push({ name: item.name, quantity: item.quantity });
      return;
    }
    priced.push({ parsedIndex, typeId: hit.typeId, typeName: hit.name });
  });

  const results = new Map<number, Record<HubKey, HubBook>>();
  for (const entry of priced) results.set(entry.parsedIndex, emptyBooks(hubs));

  const tasks = priced.flatMap((entry) =>
    hubs.map((hub) => ({ entry, hub })),
  );

  await mapLimit(tasks, deps.concurrency ?? DEFAULT_CONCURRENCY, async ({ entry, hub }) => {
    const isGlobalPlex = entry.typeId === PLEX_TYPE_ID;
    const orders = await deps.getOrders(
      isGlobalPlex ? GLOBAL_PLEX_REGION_ID : hub.regionId,
      entry.typeId,
    );
    const book = isGlobalPlex
      ? aggregateGlobalBook(orders)
      : aggregateBook(
          orders,
          hub.systemId,
          priceMode === "station" ? hub.stationId : undefined,
        );
    const books = results.get(entry.parsedIndex);
    if (books !== undefined) books[hub.key] = book;
  });

  const items: ItemPrice[] = priced.map((entry) => ({
    typeId: entry.typeId,
    name: entry.typeName,
    quantity: parsed.items[entry.parsedIndex]?.quantity ?? 1,
    hubs: results.get(entry.parsedIndex) ?? emptyBooks(hubs),
  }));

  const totals: Record<HubKey, MutableTotal> = emptyTotals(hubs);
  for (const item of items) {
    for (const hub of hubs) {
      const book = item.hubs[hub.key];
      const total = totals[hub.key];
      if (total === undefined) continue;
      if (book.bestBuy === null) total.missingBuy += 1;
      else total.buy += book.bestBuy.price * item.quantity;
      if (book.bestSell === null) total.missingSell += 1;
      else total.sell += book.bestSell.price * item.quantity;
    }
  }

  return { items, rejected: parsed.rejected, unresolved, totals, priceMode };
}
