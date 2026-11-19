import type { EsiIdsResponse } from "./esi-types";
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

/**
 * Resolve item names to type ids, in batches.
 *
 * Only `inventory_types` is read: "Tritanium" also matches a character, so
 * taking the first bucket in the response would price the wrong thing.
 */
export async function resolveNames(
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
