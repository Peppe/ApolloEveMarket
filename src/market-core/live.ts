import type { AppraiseDeps } from "./appraise";
import { createEsiClient } from "./esi-client";
import { createIdsFetcher, resolveNames } from "./resolve";
import { createFetchTransport, type Transport } from "./transport";

export interface LiveMarketOptions {
  /** Swap in a fake for tests; defaults to the platform fetch. */
  readonly transport?: Transport;
  readonly now?: () => number;
}

export interface LiveMarket extends AppraiseDeps {
  cacheSize(): number;
}

/**
 * Wires the real ESI client.
 *
 * The returned object holds the order cache, so create it ONCE per server
 * process - a new instance per request would defeat the whole cache and burn
 * the shared rate budget.
 */
export function createLiveMarket(options: LiveMarketOptions = {}): LiveMarket {
  const transport = options.transport ?? createFetchTransport();
  const client = createEsiClient({ transport, now: options.now });
  const ids = createIdsFetcher(transport);

  return {
    getOrders: (regionId, typeId) => client.getOrders(regionId, typeId),
    resolveNames: (names) => resolveNames(names, ids),
    cacheSize: () => client.cacheSize(),
  };
}
