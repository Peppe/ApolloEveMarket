import { EsiError } from "./esi-client";
import type { EsiMarketHistory } from "./esi-types";
import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  type Transport,
} from "./transport";

export interface EsiHistoryClientOptions {
  readonly transport: Transport;
  readonly now?: () => number;
  readonly baseUrl?: string;
  readonly userAgent?: string;
  readonly compatibilityDate?: string;
  readonly defaultTtlMs?: number;
  readonly maxCacheEntries?: number;
}

export interface EsiHistoryClient {
  getHistory(
    regionId: number,
    typeId: number,
  ): Promise<readonly EsiMarketHistory[]>;
  cacheSize(): number;
}

interface CacheEntry {
  readonly history: readonly EsiMarketHistory[];
  readonly etag?: string;
  readonly expiresAt: number;
}

const DEFAULT_TTL_MS = 300_000;
const DEFAULT_MAX_CACHE_ENTRIES = 250;

function historyUrl(baseUrl: string, regionId: number, typeId: number): string {
  const params = new URLSearchParams({
    type_id: String(typeId),
    datasource: "tranquility",
  });
  return `${baseUrl}/markets/${regionId}/history/?${params.toString()}`;
}

function parseHistory(body: string, url: string): EsiMarketHistory[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new EsiError("market history response was not JSON", 0, url);
  }
  if (!Array.isArray(parsed)) {
    throw new EsiError("market history response was not an array", 0, url);
  }

  return parsed.map((value, index) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("date" in value) ||
      typeof value.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !Number.isFinite(Date.parse(`${value.date}T00:00:00Z`)) ||
      new Date(`${value.date}T00:00:00Z`).toISOString().slice(0, 10) !==
        value.date ||
      !("average" in value) ||
      typeof value.average !== "number" ||
      !Number.isFinite(value.average) ||
      !("highest" in value) ||
      typeof value.highest !== "number" ||
      !Number.isFinite(value.highest) ||
      !("lowest" in value) ||
      typeof value.lowest !== "number" ||
      !Number.isFinite(value.lowest) ||
      !("order_count" in value) ||
      typeof value.order_count !== "number" ||
      !Number.isInteger(value.order_count) ||
      !("volume" in value) ||
      typeof value.volume !== "number" ||
      !Number.isFinite(value.volume)
    ) {
      throw new EsiError(
        `market history response contains an invalid row at index ${index}`,
        0,
        url,
      );
    }
    return {
      date: value.date,
      average: value.average,
      highest: value.highest,
      lowest: value.lowest,
      order_count: value.order_count,
      volume: value.volume,
    };
  });
}

export function createEsiHistoryClient(
  options: EsiHistoryClientOptions,
): EsiHistoryClient {
  const now = options.now ?? (() => Date.now());
  const baseUrl = options.baseUrl ?? ESI_BASE_URL;
  const ttlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
  const maxCacheEntries = Math.max(
    1,
    options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES,
  );
  const baseHeaders: Record<string, string> = {
    "User-Agent": options.userAgent ?? ESI_USER_AGENT,
    "X-Compatibility-Date":
      options.compatibilityDate ?? ESI_COMPATIBILITY_DATE,
  };
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<readonly EsiMarketHistory[]>>();

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

  function expiry(headers: Readonly<Record<string, string>>): number {
    const value = headers.expires;
    if (value === undefined) return now() + ttlMs;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : now() + ttlMs;
  }

  async function fetchHistory(
    regionId: number,
    typeId: number,
    cached: CacheEntry | undefined,
  ): Promise<CacheEntry> {
    const url = historyUrl(baseUrl, regionId, typeId);
    const headers = { ...baseHeaders };
    if (cached?.etag !== undefined) headers["If-None-Match"] = cached.etag;
    const response = await options.transport(url, { headers });

    if (response.status === 304) {
      if (cached === undefined) {
        throw new EsiError(
          "304 Not Modified without a cached history body",
          304,
          url,
        );
      }
      return {
        history: cached.history,
        etag: response.headers.etag ?? cached.etag,
        expiresAt: expiry(response.headers),
      };
    }
    if (response.status !== 200) {
      const detail = response.body.trim().slice(0, 200);
      throw new EsiError(
        detail
          ? `ESI responded ${response.status}: ${detail}`
          : `ESI responded ${response.status}`,
        response.status,
        url,
      );
    }

    return {
      history: parseHistory(response.body, url),
      etag: response.headers.etag,
      expiresAt: expiry(response.headers),
    };
  }

  return {
    async getHistory(regionId, typeId) {
      const key = `${regionId}:${typeId}`;
      const cached = cacheGet(key);
      if (cached !== undefined && now() < cached.expiresAt) {
        return cached.history;
      }
      const pending = inFlight.get(key);
      if (pending !== undefined) return pending;

      const request = fetchHistory(regionId, typeId, cached)
        .then((entry) => {
          cacheSet(key, entry);
          return entry.history;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, request);
      return request;
    },
    cacheSize: () => cache.size,
  };
}
