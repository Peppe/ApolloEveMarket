// Capture real ESI responses as fixtures for offline tests.
//
// Fixture rule (see docs/spec/fixtures/README.md): these files are RECORDED
// REALITY. Never hand-edit a captured body or header to make a test pass.
// If ESI changes, re-run this script and commit the new capture plus a note
// in docs/spec/intent.md describing what changed.
//
// Usage: node scripts/capture-fixtures.mjs
// Requires Node 18+ (global fetch). Reads no config; no credentials needed.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, "..", "docs", "spec", "fixtures");
const ESI = "https://esi.evetech.net/latest";
const USER_AGENT = "ApolloEveMarket-fixture-capture/0.1 (github.com/Peppe/ApolloEveMarket)";

// Headers worth recording: freshness (caching correctness), paging, rate
// budget, and the CCP "compatibility date" contract.
const RECORDED_HEADERS = [
  "content-type",
  "date",
  "etag",
  "expires",
  "last-modified",
  "x-pages",
  "x-compatibility-date",
  "x-esi-error-limit-remain",
  "x-esi-error-limit-reset",
  "x-ratelimit-group",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-used",
  "retry-after",
];

async function capture(name, { url, method = "GET", body, extraHeaders = {} }) {
  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "follow",
  });

  const raw = Buffer.from(await res.arrayBuffer());
  const dir = join(FIXTURE_ROOT, name);
  await mkdir(dir, { recursive: true });

  const requestLines = [
    `${method} ${url}`,
    `User-Agent: ${USER_AGENT}`,
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
    "",
  ];
  if (body !== undefined) requestLines.push(JSON.stringify(body, null, 0), "");

  const headerLines = [`HTTP ${res.status} ${res.statusText}`];
  for (const key of RECORDED_HEADERS) {
    const value = res.headers.get(key);
    if (value !== null) headerLines.push(`${key}: ${value}`);
  }

  await writeFile(join(dir, "request.txt"), requestLines.join("\n"), "utf8");
  await writeFile(join(dir, "response.headers.txt"), headerLines.join("\n") + "\n", "utf8");
  await writeFile(join(dir, "response.body.json"), raw);

  console.log(
    `${name.padEnd(34)} ${res.status}  ${String(raw.length).padStart(7)} bytes  x-pages=${res.headers.get("x-pages") ?? "-"}`,
  );
  return res;
}

const nameBody = [
  "Tritanium",
  "Hobgoblin I",
  "Vespa I",
  "Scourge Heavy Missile",
  "Ishtar",
];

// 1. Name -> type id resolution (POST body is a BARE ARRAY, not {"names":[]}).
await capture("universe-ids-names", {
  url: `${ESI}/universe/ids/?datasource=tranquility`,
  method: "POST",
  body: nameBody,
});

// 2. The core pricing input: one type's orders in one region, both sides.
const ordersUrl = `${ESI}/markets/10000002/orders/?order_type=all&type_id=34&datasource=tranquility`;
const orders = await capture("orders-forge-tritanium", { url: ordersUrl });

// 3. Conditional revalidation: same request with the ETag must be 304 + 0 bytes.
const etag = orders.headers.get("etag");
await capture("orders-forge-tritanium-revalidate", {
  url: ordersUrl,
  extraHeaders: { "If-None-Match": etag },
});

// 4. Page past the end: 404, not an empty array.
await capture("orders-forge-tritanium-page2", {
  url: `${ESI}/markets/10000002/orders/?order_type=all&type_id=34&page=2&datasource=tranquility`,
});

// 5. A real "no orders" answer: 200 with an empty array (PLEX trades in no hub).
await capture("orders-forge-plex-empty", {
  url: `${ESI}/markets/10000002/orders/?order_type=all&type_id=44992&datasource=tranquility`,
});

// 6. History: daily OHLCV, a different shape from live orders.
await capture("history-forge-tritanium", {
  url: `${ESI}/markets/10000002/history/?type_id=34&datasource=tranquility`,
});

// 7. Type metadata (name, group, packaged volume) for display and totals.
await capture("types-tritanium", {
  url: `${ESI}/universe/types/34/?datasource=tranquility`,
});

// 8. Hub identity: the five trade systems plus Jita's station. Prices are
//    aggregated per SYSTEM, not per region (see intent.md), so these ids are
//    load-bearing, not decoration.
await capture("universe-names-hub-systems", {
  url: `${ESI}/universe/names/?datasource=tranquility`,
  method: "POST",
  body: [30000142, 30002187, 30002659, 30002053, 30002510, 60003760],
});

// 9. Headers only: a whole region's orders is many pages. Recorded to prove
//    pagination is real and that per-type filtering is mandatory.
await capture("region-orders-forge-buy-head", {
  url: `${ESI}/markets/10000002/orders/?order_type=buy&datasource=tranquility`,
  method: "HEAD",
});

console.log(`\nfixtures written under ${FIXTURE_ROOT}`);
