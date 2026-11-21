import {
  ESI_BASE_URL,
  ESI_COMPATIBILITY_DATE,
  ESI_USER_AGENT,
  type Transport,
} from "./transport";

export interface MarketRegion {
  readonly id: number;
  readonly name: string;
}

export const DEFAULT_CUSTOM_REGION: MarketRegion = {
  id: 10000030,
  name: "Heimatar",
};

function isRegionIds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((id) => Number.isSafeInteger(id) && id > 0) &&
    new Set(value).size === value.length
  );
}

function parseRegionNames(
  value: unknown,
  regionIds: readonly number[],
): readonly MarketRegion[] {
  if (!Array.isArray(value)) {
    throw new Error("ESI region names response was not an array.");
  }

  const expectedIds = new Set(regionIds);
  const found = new Map<number, MarketRegion>();
  for (const rawEntry of value) {
    if (
      typeof rawEntry !== "object" ||
      rawEntry === null ||
      Array.isArray(rawEntry)
    ) {
      throw new Error("ESI region names response contained invalid region data.");
    }
    const entry = rawEntry as Record<string, unknown>;
    if (
      entry.category !== "region" ||
      !Number.isSafeInteger(entry.id) ||
      typeof entry.id !== "number" ||
      !expectedIds.has(entry.id) ||
      typeof entry.name !== "string" ||
      entry.name.trim() === "" ||
      found.has(entry.id)
    ) {
      throw new Error("ESI region names response contained invalid region data.");
    }
    found.set(entry.id, { id: entry.id, name: entry.name });
  }

  if (found.size !== expectedIds.size) {
    throw new Error("ESI region names response did not resolve every region id.");
  }

  return [...found.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "en", { sensitivity: "base" }),
  );
}

export function createRegionCatalogFetcher(
  transport: Transport,
  baseUrl = ESI_BASE_URL,
): () => Promise<readonly MarketRegion[]> {
  let cached: readonly MarketRegion[] | undefined;
  let pending: Promise<readonly MarketRegion[]> | undefined;

  async function load(): Promise<readonly MarketRegion[]> {
    const headers = {
      "User-Agent": ESI_USER_AGENT,
      "X-Compatibility-Date": ESI_COMPATIBILITY_DATE,
    };
    const regionsUrl = `${baseUrl}/universe/regions/?datasource=tranquility`;
    const regionsResponse = await transport(regionsUrl, { headers });
    if (regionsResponse.status !== 200) {
      throw new Error(`ESI region list failed with status ${regionsResponse.status}.`);
    }

    let regionIds: unknown;
    try {
      regionIds = JSON.parse(regionsResponse.body);
    } catch {
      throw new Error("ESI region list response was not valid JSON.");
    }
    if (!isRegionIds(regionIds)) {
      throw new Error("ESI region list response contained invalid ids.");
    }

    const namesUrl = `${baseUrl}/universe/names/?datasource=tranquility`;
    const namesResponse = await transport(namesUrl, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(regionIds),
    });
    if (namesResponse.status !== 200) {
      throw new Error(`ESI region names failed with status ${namesResponse.status}.`);
    }

    let names: unknown;
    try {
      names = JSON.parse(namesResponse.body);
    } catch {
      throw new Error("ESI region names response was not valid JSON.");
    }
    const regions = parseRegionNames(names, regionIds);
    if (!regions.some((region) => region.id === DEFAULT_CUSTOM_REGION.id)) {
      throw new Error("ESI region catalogue does not contain the default region.");
    }
    return regions;
  }

  return () => {
    if (cached !== undefined) return Promise.resolve(cached);
    if (pending !== undefined) return pending;
    pending = load()
      .then((regions) => {
        cached = regions;
        return regions;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
