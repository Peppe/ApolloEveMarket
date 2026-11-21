import { describe, expect, it } from "vitest";
import type { EsiMarketHistory } from "./esi-types";
import { EsiError } from "./esi-client";
import { createEsiHistoryClient } from "./history-client";
import { readFixtureBody, readFixtureHeaders, readFixtureJson } from "./testing/fixtures";
import type { HttpResponse, Transport } from "./transport";

const recordedHistory = readFixtureJson<EsiMarketHistory[]>(
  "history-forge-tritanium",
);
const recordedHeaders = readFixtureHeaders("history-forge-tritanium");
const recordedBody = readFixtureBody("history-forge-tritanium");

function fakeTransport(
  handler: (url: string, headers: Readonly<Record<string, string>>) => HttpResponse | Promise<HttpResponse>,
): { transport: Transport; calls: { url: string; headers: Readonly<Record<string, string>> }[] } {
  const calls: { url: string; headers: Readonly<Record<string, string>> }[] = [];
  const transport: Transport = async (url, request) => {
    calls.push({ url, headers: request.headers });
    return handler(url, request.headers);
  };
  return { transport, calls };
}

describe("createEsiHistoryClient", () => {
  it("requests and parses the captured regional history response", async () => {
    const { transport, calls } = fakeTransport(() => ({
      status: 200,
      headers: recordedHeaders,
      body: recordedBody,
    }));
    const client = createEsiHistoryClient({
      transport,
      now: () => Date.parse("2026-11-19T10:00:00Z"),
    });

    const history = await client.getHistory(10000002, 34);

    expect(history).toEqual(recordedHistory);
    expect(calls[0]?.url).toContain(
      "/markets/10000002/history/?type_id=34&datasource=tranquility",
    );
    expect(calls[0]?.headers["User-Agent"]).toContain("ApolloEveMarket");
    expect(client.cacheSize()).toBe(1);
  });

  it("revalidates expired history with ETag and reuses a 304 body", async () => {
    const base = Date.parse("2026-11-19T10:00:00Z");
    let clock = base;
    const { transport, calls } = fakeTransport((_url, headers) => {
      if (headers["If-None-Match"] === '"v1"') {
        return {
          status: 304,
          headers: {
            etag: '"v2"',
            expires: new Date(clock + 300_000).toUTCString(),
          },
          body: "",
        };
      }
      return {
        status: 200,
        headers: {
          etag: '"v1"',
          expires: new Date(clock + 300_000).toUTCString(),
        },
        body: recordedBody,
      };
    });
    const client = createEsiHistoryClient({ transport, now: () => clock });

    const first = await client.getHistory(10000002, 34);
    clock += 400_000;
    const second = await client.getHistory(10000002, 34);
    const third = await client.getHistory(10000002, 34);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.headers["If-None-Match"]).toBe('"v1"');
    expect(second).toBe(first);
    expect(third).toBe(second);
  });

  it("does not cache failed or malformed responses", async () => {
    const { transport } = fakeTransport(() => ({
      status: 200,
      headers: {},
      body: '[{"date":"not-a-date"}]',
    }));
    const client = createEsiHistoryClient({ transport });

    await expect(client.getHistory(10000002, 34)).rejects.toBeInstanceOf(EsiError);
    expect(client.cacheSize()).toBe(0);
  });

  it("returns an empty history as a valid no-data result", async () => {
    const { transport } = fakeTransport(() => ({
      status: 200,
      headers: {},
      body: "[]",
    }));
    const client = createEsiHistoryClient({ transport });

    await expect(client.getHistory(10000002, 34)).resolves.toEqual([]);
  });
});
