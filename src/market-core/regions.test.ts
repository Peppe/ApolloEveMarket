import { describe, expect, it } from "vitest";
import {
  createRegionCatalogFetcher,
  DEFAULT_CUSTOM_REGION,
} from "./regions";
import { readFixtureJson } from "./testing/fixtures";
import type { HttpResponse, Transport } from "./transport";

const regionIds = readFixtureJson<number[]>("universe-regions");
const regionNames = readFixtureJson<
  { readonly category: string; readonly id: number; readonly name: string }[]
>("universe-region-names");

function response(body: unknown): HttpResponse {
  return { status: 200, headers: {}, body: JSON.stringify(body) };
}

describe("region catalogue", () => {
  it("resolves and sorts the captured catalogue, including Syndicate", async () => {
    const calls: { url: string; method: string | undefined; body?: string }[] = [];
    const transport: Transport = async (url, request) => {
      calls.push({ url, method: request.method, body: request.body });
      return url.includes("/regions/")
        ? response(regionIds)
        : response(regionNames);
    };

    const getRegions = createRegionCatalogFetcher(transport);
    const regions = await getRegions();

    expect(regions.find((region) => region.name === "Syndicate")).toEqual({
      id: 10000041,
      name: "Syndicate",
    });
    expect(regions.find((region) => region.id === DEFAULT_CUSTOM_REGION.id)).toEqual(
      DEFAULT_CUSTOM_REGION,
    );
    expect(regions.map((region) => region.name)).toEqual(
      [...regions.map((region) => region.name)].sort((a, b) =>
        a.localeCompare(b, "en", { sensitivity: "base" }),
      ),
    );
    expect(calls).toHaveLength(2);
    expect(calls[0]?.url).toContain("/universe/regions/");
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.body).toBe(JSON.stringify(regionIds));

    await getRegions();
    expect(calls).toHaveLength(2);
  });

  it("shares an in-flight catalogue request", async () => {
    const calls: string[] = [];
    const transport: Transport = async (url) => {
      calls.push(url);
      await Promise.resolve();
      return url.includes("/regions/")
        ? response(regionIds)
        : response(regionNames);
    };
    const getRegions = createRegionCatalogFetcher(transport);

    const [first, second] = await Promise.all([getRegions(), getRegions()]);

    expect(first).toBe(second);
    expect(calls).toHaveLength(2);
  });

  it("rejects malformed or incomplete ESI catalogue data", async () => {
    const invalidIds = createRegionCatalogFetcher(async (url) =>
      response(url.includes("/regions/") ? [10000030, 10000030] : regionNames),
    );
    await expect(invalidIds()).rejects.toThrow("invalid ids");

    const missingNames = createRegionCatalogFetcher(async (url) =>
      response(
        url.includes("/regions/")
          ? regionIds
          : regionNames.filter((region) => region.id !== 10000041),
      ),
    );
    await expect(missingNames()).rejects.toThrow("did not resolve every");
  });

  it("reports non-200 responses without caching the failure", async () => {
    let attempts = 0;
    const getRegions = createRegionCatalogFetcher(async () => {
      attempts += 1;
      return { status: 503, headers: {}, body: "" };
    });

    await expect(getRegions()).rejects.toThrow("status 503");
    await expect(getRegions()).rejects.toThrow("status 503");
    expect(attempts).toBe(2);
  });
});
