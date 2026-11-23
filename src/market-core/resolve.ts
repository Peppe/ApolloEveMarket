import type { EsiIdEntry, EsiIdsResponse } from "./esi-types";
import { EsiError } from "./esi-client";
import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  type Transport,
} from "./transport";

export interface ResolvedType {
  readonly typeId: number;
  readonly name: string;
}

export interface ResolveResult {
  /** Keyed by normalized (trimmed, lowercased) name. */
  readonly types: ReadonlyMap<string, ResolvedType>;
  /** Normalized names that ESI did not recognize as inventory types. */
  readonly unresolved: readonly string[];
}

export type IdsFetcher = (names: readonly string[]) => Promise<EsiIdsResponse>;
export type NamesFetcher = (
  ids: readonly number[],
) => Promise<readonly EsiIdEntry[]>;

const NAME_LOOKUP_BATCH_SIZE = 100;
const MAX_NAME_LOOKUP_ID = 2_147_483_647;

function isNameLookupId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_NAME_LOOKUP_ID;
}

function isEsiIdEntry(entry: unknown): entry is EsiIdEntry {
  return (
    typeof entry === "object" &&
    entry !== null &&
    "id" in entry &&
    Number.isSafeInteger(entry.id) &&
    "name" in entry &&
    typeof entry.name === "string"
  );
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Sends a BARE JSON ARRAY. `{"names": [...]}` is rejected by ESI with
 * "Invalid body JSON type, 'names' is required" (verified 2026-11-19).
 */
export function createIdsFetcher(
  transport: Transport,
  baseUrl: string = ESI_BASE_URL,
): IdsFetcher {
  return async (names) => {
    const url = `${baseUrl}/universe/ids/?datasource=tranquility`;
    const response = await transport(url, {
      method: "POST",
      headers: {
        "User-Agent": ESI_USER_AGENT,
        "X-Compatibility-Date": ESI_COMPATIBILITY_DATE,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(names),
    });

    if (response.status !== 200) {
      throw new EsiError(
        `name resolution failed: ESI responded ${response.status}`,
        response.status,
        url,
      );
    }

    return JSON.parse(response.body) as EsiIdsResponse;
  };
}

export function createNamesFetcher(
  transport: Transport,
  baseUrl: string = ESI_BASE_URL,
): NamesFetcher {
  return async (ids) => {
    const uniqueIds = [...new Set(ids)].filter(isNameLookupId);
    const entries: EsiIdEntry[] = [];
    for (
      let start = 0;
      start < uniqueIds.length;
      start += NAME_LOOKUP_BATCH_SIZE
    ) {
      const batch = uniqueIds.slice(start, start + NAME_LOOKUP_BATCH_SIZE);
      const url = `${baseUrl}/universe/names/?datasource=tranquility`;
      const response = await transport(url, {
        method: "POST",
        headers: {
          "User-Agent": ESI_USER_AGENT,
          "X-Compatibility-Date": ESI_COMPATIBILITY_DATE,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });

      if (response.status !== 200) {
        throw new EsiError(
          `location name lookup failed: ESI responded ${response.status}`,
          response.status,
          url,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw new EsiError("location names response was not JSON", 0, url);
      }
      if (
        !Array.isArray(parsed) ||
        !parsed.every(isEsiIdEntry)
      ) {
        throw new EsiError("location names response had an invalid shape", 0, url);
      }
      entries.push(...parsed);
    }
    return entries;
  };
}

export function createCachedNamesFetcher(
  inner: NamesFetcher,
  maxEntries = DEFAULT_MAX_CACHED_NAMES,
): NamesFetcher {
  const cache = new Map<number, EsiIdEntry | null>();
  const limit = Math.max(1, maxEntries);

  return async (ids) => {
    const uniqueIds = [...new Set(ids)].filter(isNameLookupId);
    const hits: EsiIdEntry[] = [];
    const missing: number[] = [];

    for (const id of uniqueIds) {
      const cached = cache.get(id);
      if (cached === undefined) {
        missing.push(id);
        continue;
      }
      cache.delete(id);
      cache.set(id, cached);
      if (cached !== null) hits.push(cached);
    }

    if (missing.length === 0) return hits;
    const fresh = await inner(missing);
    const freshById = new Map(fresh.map((entry) => [entry.id, entry]));
    const missingIds = new Set(missing);
    for (const id of missing) {
      cache.delete(id);
      cache.set(id, freshById.get(id) ?? null);
      while (cache.size > limit) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
      }
    }
    return [...hits, ...fresh.filter((entry) => missingIds.has(entry.id))];
  };
}

export interface CachedIdsFetcherOptions {
  /** Upper bound on remembered names, evicted oldest-first. */
  readonly maxEntries?: number;
}

const DEFAULT_MAX_CACHED_NAMES = 5000;

/**
 * Remembers successful name -> type id lookups for the process lifetime.
 *
 * A type id never changes, so a hit is permanent. A miss is not cached, so a
 * typo the user fixes is looked up again. Cached hits are merged back into the
 * response, which keeps `resolveNames` - which only ever looks at
 * `inventory_types` - unaware of the cache.
 */
export function createCachedIdsFetcher(
  inner: IdsFetcher,
  options: CachedIdsFetcherOptions = {},
): IdsFetcher {
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_CACHED_NAMES);
  const cache = new Map<string, EsiIdEntry>();

  function remember(key: string, entry: EsiIdEntry): void {
    cache.delete(key);
    cache.set(key, entry);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  return async (names) => {
    const asked = new Set<string>();
    const hits: EsiIdEntry[] = [];
    const missing: string[] = [];

    for (const name of names) {
      const key = normalizeName(name);
      if (key === "" || asked.has(key)) continue;
      asked.add(key);

      const hit = cache.get(key);
      if (hit === undefined) {
        missing.push(name.trim());
        continue;
      }
      // Refresh recency, same LRU rule as the order cache.
      cache.delete(key);
      cache.set(key, hit);
      hits.push(hit);
    }

    if (missing.length === 0) return { inventory_types: hits };

    const response = await inner(missing);
    const fresh = response.inventory_types ?? [];

    // Cache under the name we asked for, not only the name ESI echoed back.
    for (const name of missing) {
      const key = normalizeName(name);
      const entry = fresh.find((candidate) => normalizeName(candidate.name) === key);
      if (entry !== undefined) remember(key, entry);
    }

    const byId = new Map<number, EsiIdEntry>();
    for (const entry of [...hits, ...fresh]) byId.set(entry.id, entry);

    return { ...response, inventory_types: [...byId.values()] };
  };
}

/**
 * Resolve item names to type ids, in batches.
 *
 * Only `inventory_types` is read: "Tritanium" also matches a character, so
 * taking the first bucket in the response would price the wrong thing.
 */export async function resolveNames(
  names: readonly string[],
  fetcher: IdsFetcher,
  batchSize = 100,
): Promise<ResolveResult> {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const key = normalizeName(name);
    if (key !== "" && !wanted.has(key)) wanted.set(key, name.trim());
  }

  const entries = [...wanted.entries()];
  const types = new Map<string, ResolvedType>();

  for (let start = 0; start < entries.length; start += batchSize) {
    const batch = entries.slice(start, start + batchSize);
    const response = await fetcher(batch.map(([, original]) => original));
    for (const entry of response.inventory_types ?? []) {
      types.set(normalizeName(entry.name), { typeId: entry.id, name: entry.name });
    }
  }

  const unresolved = entries
    .map(([key]) => key)
    .filter((key) => !types.has(key));

  return { types, unresolved };
}
