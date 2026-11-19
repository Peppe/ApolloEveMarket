import type { EsiOrder } from "./esi-types";
import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  type Transport,
} from "./transport";

export class EsiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "EsiError";
  }
}

export interface EsiClientOptions {
  readonly transport: Transport;
  readonly now?: () => number;
  readonly baseUrl?: string;
  readonly userAgent?: string;
  readonly compatibilityDate?: string;
  /** Used when a response carries no usable `Expires`. */
  readonly defaultTtlMs?: number;
  /** Safety valve: refuse to walk a runaway `X-Pages`. */
  readonly maxPages?: number;
  /**
   * Upper bound on cached order books, evicted least-recently-used. An entry
   * is one region's orders for one type, normally a single page.
   */
  readonly maxCacheEntries?: number;
}

export interface EsiClient {
  /**
   * All orders for one type in one region, all pages, from cache when fresh.
   * An empty array is a normal answer, not an error.
   */
  getOrders(regionId: number, typeId: number): Promise<readonly EsiOrder[]>;
  cacheSize(): number;
}

interface CacheEntry {
  readonly orders: readonly EsiOrder[];
  readonly etag?: string;
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_MAX_CACHE_ENTRIES = 500;

export function createEsiClient(options: EsiClientOptions): EsiClient {
  const { transport } = options;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
  const baseUrl = options.baseUrl ?? ESI_BASE_URL;
  const maxPages = options.maxPages ?? 200;
  const maxCacheEntries = Math.max(
    1,
    options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES,
  );

  const baseHeaders: Record<string, string> = {
    "User-Agent": options.userAgent ?? ESI_USER_AGENT,
    "X-Compatibility-Date": options.compatibilityDate ?? ESI_COMPATIBILITY_DATE,
  };

  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<readonly EsiOrder[]>>();

  function ordersUrl(regionId: number, typeId: number, page: number): string {
    const params = new URLSearchParams({
      order_type: "all",
      type_id: String(typeId),
      datasource: "tranquility",
    });
    if (page > 1) params.set("page", String(page));
    return `${baseUrl}/markets/${regionId}/orders/?${params.toString()}`;
  }

  function parseOrders(body: string, url: string): EsiOrder[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new EsiError("market orders response was not JSON", 0, url);
    }
    if (!Array.isArray(parsed)) {
      throw new EsiError("market orders response was not an array", 0, url);
    }
    return parsed as EsiOrder[];
  }

  function readPages(value: string | undefined, url: string): number {
    if (value === undefined) return 1;
    const pages = Number(value);
    if (!Number.isInteger(pages) || pages < 1) return 1;
    if (pages > maxPages) {
      throw new EsiError(
        `response claims ${pages} pages, above the ${maxPages}-page safety limit`,
        0,
        url,
      );
    }
    return pages;
  }

  function expiry(headers: Readonly<Record<string, string>>, at: number): number {
    const value = headers["expires"];
    if (value === undefined) return at + ttlMs;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : at + ttlMs;
  }

  /**
   * A `Map` iterates in insertion order, so re-inserting on read makes the
   * oldest entry the least recently used one.
   */
  function cacheGet(key: string): CacheEntry | undefined {
    const entry = cache.get(key);
    if (entry === undefined) return undefined;
    cache.delete(key);
    cache.set(key, entry);
    return entry;
  }

  function cacheSet(key: string, entry: CacheEntry): void {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > maxCacheEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  function describe(response: { status: number; body: string }): string {
    const detail = response.body.trim().slice(0, 200);
    return detail ? `ESI responded ${response.status}: ${detail}` : `ESI responded ${response.status}`;
  }

  async function fetchAll(
    regionId: number,
    typeId: number,
    cached: CacheEntry | undefined,
  ): Promise<CacheEntry> {
    const firstUrl = ordersUrl(regionId, typeId, 1);
    const headers: Record<string, string> = { ...baseHeaders };
    if (cached?.etag !== undefined) headers["If-None-Match"] = cached.etag;

    const first = await transport(firstUrl, { headers });

    if (first.status === 304) {
      if (cached === undefined) {
        throw new EsiError("304 Not Modified without a cached body", 304, firstUrl);
      }
      return {
        orders: cached.orders,
        etag: first.headers["etag"] ?? cached.etag,
        expiresAt: expiry(first.headers, now()),
      };
    }

    if (first.status !== 200) {
      throw new EsiError(describe(first), first.status, firstUrl);
    }

    const orders = parseOrders(first.body, firstUrl);
    const pages = readPages(first.headers["x-pages"], firstUrl);

    for (let page = 2; page <= pages; page += 1) {
      const url = ordersUrl(regionId, typeId, page);
      const response = await transport(url, { headers: baseHeaders });
      // A page past the end answers 404. Keep what we collected rather than
      // failing the whole item; the next refresh will re-read X-Pages.
      if (response.status === 404) break;
      if (response.status !== 200) {
        throw new EsiError(describe(response), response.status, url);
      }
      orders.push(...parseOrders(response.body, url));
    }

    return {
      orders,
      etag: first.headers["etag"],
      expiresAt: expiry(first.headers, now()),
    };
  }

  return {
    async getOrders(regionId, typeId) {
      const key = `${regionId}:${typeId}`;

      const cached = cacheGet(key);
      if (cached !== undefined && now() < cached.expiresAt) {
        return cached.orders;
      }

      const pending = inFlight.get(key);
      if (pending !== undefined) return pending;

      const request = fetchAll(regionId, typeId, cached)
        .then((entry) => {
          cacheSet(key, entry);
          return entry.orders;
        })
        .finally(() => {
          inFlight.delete(key);
        });

      inFlight.set(key, request);
      return request;
    },

    cacheSize() {
      return cache.size;
    },
  };
}
