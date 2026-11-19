# Phase 1 - Market core (UI-free)

Status: done (2026-11-19)

Goal: given pasted text containing item names and quantities, produce best buy
and best sell per item for all five hubs, using live ESI orders - with all
network behavior injectable so the whole thing is testable offline against
`docs/spec/fixtures/`.

This phase ships **no UI**. It ends with a module and a console smoke command.

## Scope

In: input parsing, name -> type id resolution, ESI order fetching (paging,
caching, revalidation), per-hub-system aggregation, totals, error reporting.

Out: any React/Next.js code, persistence, name search/fuzzy matching, order
depth, price history display, deployment.

## Module layout (UI-free, under `src/market-core/`)

| file | responsibility |
|---|---|
| `hubs.ts` | the five hub definitions (key, label, regionId, systemId) |
| `parse.ts` | pasted text -> `{ name, quantity }[]` + rejected lines |
| `esi-types.ts` | TypeScript shapes for the ESI payloads we consume |
| `esi-client.ts` | HTTP layer: paging, `If-None-Match`, `Expires`, single-flight |
| `resolve.ts` | names -> type ids via `POST /universe/ids/` |
| `aggregate.ts` | one item's orders -> `BookSide` for one hub system |
| `appraise.ts` | orchestration: parse -> resolve -> fetch -> aggregate -> totals |
| `index.ts` | public surface used by the web layer and the smoke command |

No file under `src/market-core/` may import from `react`, `next`, or anything
under `src/app/`. An import-boundary test enforces this.

## Hub table (verified ids, see intent.md)

| key | label | regionId | systemId |
|---|---|---|---|
| `jita` | Jita | 10000002 | 30000142 |
| `dodixie` | Dodixie | 10000032 | 30002659 |
| `amarr` | Amarr | 10000043 | 30002187 |
| `hek` | Hek | 10000042 | 30002053 |
| `rens` | Rens | 10000030 | 30002510 |

## Input grammar (deliberately narrow)

- Split on `\r?\n`; trim; skip blank lines.
- A line is one of:
  - `<name>` - quantity 1
  - `<name>\t<qty>` - tab-separated (EVE inventory copy)
  - `<name> <qty>` - last whitespace-separated token is the quantity
- Quantity: positive integer, optionally `,`-grouped (`1,000`). **No** decimal
  or `.`-grouped forms: `1.000` is ambiguous across locales, so it is
  rejected rather than guessed. Rejected lines are returned with a reason and
  never silently dropped.
- Duplicate names (case-insensitive, trimmed) sum their quantities.
- Names keep their original casing for display; lookup is case-insensitive.

## Aggregation rules

For each `(typeId, hub)`:

1. Fetch the item's orders for the hub's **region** (the endpoint is
   region-scoped), all pages, from cache when fresh.
2. Keep only orders with `system_id === hub.systemId`. Region-wide aggregation
   is forbidden - on real data it yields a negative spread (intent.md).
3. `bestBuy` = highest `price` among `is_buy_order === true`;
   `bestSell` = lowest `price` among `is_buy_order === false`.
   `volumeRemain` is that order's `volume_remain`.
4. No orders on a side (or none at all) -> `null`, reported as "no market".
   An empty book is **not** an error.

Totals per hub: `sum(quantity * price)` over items that have that side, plus a
count of items excluded because the side was missing.

## Caching rules

- Key: `${regionId}:${typeId}`.
- Fresh when `now < Expires` from the response headers -> serve, no request.
- Stale -> request with `If-None-Match: <etag>`; `304` refreshes the expiry and
  reuses the stored body; `200` replaces both.
- Single-flight: concurrent callers for the same key share one in-flight
  request.
- Paging: read `X-Pages` from page 1, fetch pages 2..N. Never probe past the
  last page (that returns 404 - verified). `404` mid-paging stops the walk and
  keeps what was collected.

## Acceptance criteria

- [x] `parse.ts` accepts the three line forms above, sums duplicates,
      rejects `1.000`/negative/zero quantities with a reason, and skips blanks.
- [x] `resolve.ts` sends a bare JSON array to `/universe/ids/` and reads only
      `inventory_types`; a name that also matches a character (Tritanium)
      resolves to type 34. Unresolved names are returned, not thrown.
- [x] `aggregate.ts` against `orders-forge-tritanium` with system `30000142`
      yields **bestSell 4.1** and **bestBuy 3.96** (fixture, captured
      2026-11-19), and the result is **not** the region-wide 2.36.
- [x] `aggregate.ts` against `orders-forge-plex-empty` yields both sides
      `null` and `orderCount 0` (no throw, no error state).
- [x] Fake transport with `X-Pages: 3` produces exactly 3 order requests and
      no 404 probe; a body from page 2 is included in the result.
- [x] Second call after expiry sends `If-None-Match`; a `304` response reuses
      the cached body without a second full payload.
- [x] Concurrent identical requests issue exactly one upstream fetch
      (single-flight).
- [x] `appraise.ts` returns per-item results for all five hubs plus per-hub
      totals, in a stable order.
- [x] Import-boundary test: nothing under `src/market-core/` imports React or
      Next.js.
- [x] `npm run typecheck`, `npm test`, `npm run build` pass; `npm run smoke --
      "Tritanium" "Hobgoblin I"` prints the five-hub table from live ESI.

## Verification notes (2026-11-19)

- 
pm run typecheck clean, 
pm test 29/29 passed (6 files), 
pm run build
  produced the static page (Next.js 16.4.6).
- Fixture-backed assertions hold: Jita book from orders-forge-tritanium is
  best buy 3.96 / best sell 4.10 over 117 orders, while the region-wide book
  is 2.36 / 3.96 (the negative spread the per-system rule exists to avoid).
  Perimeter in the same capture is a separate 4.20 / 3.95 book.
- 
pm run smoke -- "Tritanium" "Hobgoblin I" "Ishtar" against live ESI:
  three items x five hubs = 15 books in 867 ms, e.g. Tritanium 3.96 / 4.10 in
  Jita and Ishtar 127.2M / 130.9M.
- Observed live and recorded in intent.md: Hek Tritanium returned best buy
  3.04 with best sell 3.01. This is legitimate (ange: station across
  different stations in one system), so the MVP shows both sides and no
  spread.
- Tests deliberately pin numbers from the committed fixtures. Re-capturing
  fixtures means updating those expectations and this section in the same
  change.
