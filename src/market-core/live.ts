import type { AppraiseDeps } from "./appraise";
import { createEsiClient } from "./esi-client";
import { createEsiHistoryClient } from "./history-client";
import type { EsiMarketHistory } from "./esi-types";
import {
  createEsiBudget,
  withBudgetGuard,
  withConcurrencyLimit,
  type BudgetSnapshot,
} from "./http-guards";
import { createCachedIdsFetcher, createIdsFetcher, resolveNames } from "./resolve";
import { createFetchTransport, type Transport } from "./transport";

export interface LiveMarketOptions {
  /** Swap in a fake for tests; defaults to the platform fetch. */
  readonly transport?: Transport;
  readonly now?: () => number;
  /** Upstream ESI requests in flight at once, for the whole process. */
  readonly maxConcurrentRequests?: number;
  /** Cached order books, least-recently-used evicted first. */
  readonly maxCacheEntries?: number;
  /** Refuse new requests at or below this many remaining ESI errors. */
  readonly minErrorBudget?: number;
  /** Refuse new requests at or below this many remaining ESI requests. */
  readonly minRequestBudget?: number;
  /** Remembered name -> type id lookups. */
  readonly maxCachedNames?: number;
}

export interface LiveMarketStats {
  readonly cacheEntries: number;
  readonly budget: BudgetSnapshot;
}

export interface LiveMarket extends AppraiseDeps {
  getHistory(
    regionId: number,
    typeId: number,
  ): Promise<readonly EsiMarketHistory[]>;
  cacheSize(): number;
  stats(): LiveMarketStats;
}

const DEFAULT_MAX_CONCURRENT_REQUESTS = 8;

/**
 * Wires the real ESI client.
 *
 * The returned object holds the order cache, so create it ONCE per server
 * process - a new instance per request would defeat the whole cache and burn
 * the shared rate budget.
 *
 * Every ESI call, orders and name resolution alike, passes through the same
 * budget guard and concurrency gate, so the process has one spending policy
 * rather than one per feature.
 */
export function createLiveMarket(options: LiveMarketOptions = {}): LiveMarket {
  const budget = createEsiBudget({
    minErrorBudget: options.minErrorBudget,
    minRequestBudget: options.minRequestBudget,
  });

  const transport = withConcurrencyLimit(
    withBudgetGuard(options.transport ?? createFetchTransport(), budget, options.now),
    options.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
  );

  const client = createEsiClient({
    transport,
    now: options.now,
    maxCacheEntries: options.maxCacheEntries,
  });
  const historyClient = createEsiHistoryClient({
    transport,
    now: options.now,
  });

  const ids = createCachedIdsFetcher(createIdsFetcher(transport), {
    maxEntries: options.maxCachedNames,
  });

  return {
    getOrders: (regionId, typeId) => client.getOrders(regionId, typeId),
    resolveNames: (names) => resolveNames(names, ids),
    getHistory: (regionId, typeId) => historyClient.getHistory(regionId, typeId),
    cacheSize: () => client.cacheSize() + historyClient.cacheSize(),
    stats: () => ({
      cacheEntries: client.cacheSize() + historyClient.cacheSize(),
      budget: budget.snapshot(),
    }),
  };
}
