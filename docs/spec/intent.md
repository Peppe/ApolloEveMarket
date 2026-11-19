# Intent

ApolloEveMarket answers one question fast: **what is this item worth right now, in
every major trade hub?** Paste an EVE inventory (or type item names) and get
the best buy and best sell price per item, side by side, for Jita, Dodixie,
Amarr, Hek and Rens.

Inspiration: evepraisal-style paste-and-appraise, but with all five hubs on
one screen instead of one region at a time.

Status: the north-star document. Changes to scope belong here, in the same
change that implements them.

## Goals

- **One textbox, no ceremony.** Paste a cargo scan / inventory, or type item
  names, press go. No login, no account, no saved fits.
- **All five hubs at once**: Jita, Dodixie, Amarr, Hek, Rens. Per item, show
  *both* sides of the book - what you would pay (best sell/ask) and what you
  would receive (best buy/bid) - plus totals for the whole paste.
- **Correct before clever.** Prices are derived from live ESI orders, and the
  aggregation rule is explicit and tested (see "Pricing semantics").
- **All ESI traffic happens server-side.** The browser never calls CCP. This
  is a hard architectural rule, not a preference (reasons in "Decisions").
- **Caching is correctness**, not optimisation: a stale price is a wrong
  price, and the rate budget is shared by every visitor.
- **Cheap to run**: no database required for the MVP; in-process cache is
  enough at this scale. No telemetry, no accounts, no tracking.
- **Repo text is ASCII-only** (see AGENTS.md) so no tool ever mis-decodes it.

## Non-goals

- Not a trading bot, order placer, or contract tool. Read-only market data.
- Not an authenticated app: no SSO, no character scopes, no assets, no
  wallet. Nothing on this site requires an EVE login.
- Not a full market browser (category trees, order-book depth per station)
  in the MVP. Those are later phases if they earn their keep.
- Not a price-history/charting product in the MVP. History is captured and
  verified but shown only if a later phase asks for it.
- Not a reprocessing/refining calculator. Quantities are priced as-is.

## The product in one screen

```
+--------------------------------------------------------------+
|  [ paste inventory or type item names ]                      |
|                                                              |
|  Tritanium 1000000                                            |
|  Hobgoblin I 10                                               |
|                                                              |
|                          [ Appraise ]                         |
+--------------------------------------------------------------+
| item          qty | side    | Jita | Dodixie | Amarr | ...    |
| Tritanium  1000000| Sellers | 4.07 | ...     | ...   |        |
|                   | Buyers  | 4.06 | ...     | ...   |        |
| Hobgoblin I     10| Sellers | ...  | ...     | ...   |        |
|                   | Buyers  | ...  | ...     | ...   |        |
+--------------------------------------------------------------+
| total             | Sellers | ... | ...     | ...   |        |
|                   | Buyers  | ... | ...     | ...   |        |
+--------------------------------------------------------------+
```

"Buyers" = what instant-selling to buy orders yields (best bid).
"Sellers" = what instant-buying from sell orders costs (best ask).

## Known environment facts (verified 2026-11-19)

Everything below was observed against the live API with the capture script
in `scripts/capture-fixtures.mjs`; the matching responses are committed under
`docs/spec/fixtures/`. Do not "correct" this section from memory - re-run the
script and re-date it.

### Endpoints and shapes

- Base URL `https://esi.evetech.net/latest`; `datasource=tranquility` is
  required on every call.
- `GET /markets/{region_id}/orders/?order_type=all|buy|sell&type_id={id}` is
  the pricing input. It returns a **flat JSON array** of order objects with
  fields: `duration, is_buy_order, issued, location_id, min_volume, order_id,
  price, range, system_id, type_id, volume_remain, volume_total`.
- **Page size is 1000 orders.** `X-Pages` gives the page count. Verified:
  Heimatar buy orders page 1 contains exactly 1000 orders and `X-Pages: 21`.
- A whole region is far too much to page through: The Forge buy orders is
  `X-Pages: 134`, all orders `X-Pages: 414`. Per-type queries are mandatory;
  region dumps are not an option.
- **Requesting a page past `X-Pages` returns HTTP 404**, not an empty array.
  Drive paging off `X-Pages`; do not probe until failure.
- **Unknown type ids return `200 []`**, not 404 (`type_id=0` verified).
  "No orders" is a normal, valid answer and must render as such.
- Some real items genuinely have no hub orders: **PLEX (type 44992) returns
  `[]` in all five hubs**. Regional markets do not carry it. Never assume a
  published type has orders.
- `POST /universe/ids/` takes a **bare JSON array of names** - `["Tritanium"]`
  - *not* `{"names": [...]}`. Max size not yet verified.
  - The response has separate buckets: `characters`, `inventory_types`,
    `systems`, `stations`, ... **A name can match more than one bucket**:
    "Tritanium" matched a character *and* type 34. Always filter to
    `inventory_types`; never take the first hit.
  - Verified ids: Tritanium 34, Hobgoblin I 2454, Vespa I 15508, Scourge
    Heavy Missile 209, Ishtar 12005.
- `POST /universe/names/` maps ids back to names (systems, stations, types);
  used to label hubs and, later, order locations.
- `GET /markets/{region_id}/history/?type_id={id}` returns daily rows
  `{average, date, highest, lowest, order_count, volume}` (414 rows for
  Tritanium/The Forge, latest 2026-11-18). Not needed by the MVP.
- `GET /universe/types/{id}/` gives `name, group_id, volume, portion_size,
  published` - enough for display and for volume-aware totals later.

### Caching and rate budget

- Orders responses carry `ETag`, `Last-Modified` and `Expires`, where
  **`Expires` = `Last-Modified` + 300 s**. That is CCP telling us the data is
  good for five minutes.
- Conditional revalidation works and is cheap: `If-None-Match: <ETag>` on an
  unchanged resource returns **`304` with a 0-byte body** (verified). The 304
  still carries a **fresh `Expires` and a new `ETag`**, so the client must
  update both from it rather than assuming the cached expiry still holds.
- Responses expose `X-Ratelimit-Group: market-order`,
  `X-Ratelimit-Limit: 12000/15m`, `X-Ratelimit-Remaining`, `X-Ratelimit-Used`
  and `X-Esi-Error-Limit-*`. The budget is shared, so every visitor must be
  served from the same server-side cache.
- Two separate budgets, both observed in the captures (2026-11-19): a
  **request** budget per rate-limit group (`12000/15m`, market-order only) and
  an **error** budget on the non-market endpoints (`x-esi-error-limit-remain:
  100`, `x-esi-error-limit-reset: 43` seconds). `429` (or the older `420`) plus
  `Retry-After` is how ESI says one of them is spent. Phase 3 reads all of
  these and refuses new work below a floor; see `phase-3-cache-hardening.md`.
- `type_id=34` in The Forge is a single page (`x-pages: 1`, 170 orders). The
  `x-pages: 134` capture is the whole region with no `type_id`, which this app
  never requests - so a cache entry is one small page, not a region dump.
- Requests send `X-Compatibility-Date: 2020-01-01`; the response also reports
  `2020-01-01`. During the 2026-11-19 review, a request for the current date
  still returned `2020-01-01`, so the client remains pinned to the date ESI
  reports rather than sending an unverified compatibility date.

### ESI compliance review (2026-11-19)

Reviewed against CCP's [ESI best practices](https://developers.eveonline.com/docs/services/esi/best-practices/),
[versioning guidance](https://developers.eveonline.com/docs/services/esi/overview/)
and [rate-limit guidance](https://developers.eveonline.com/docs/services/esi/rate-limiting/):

- Every ESI request is made server-side and carries `User-Agent` identifying
  `ApolloEveMarket/0.2.0` and this repository. Name resolution and every order
  page use the same headers; the fixture-capture script identifies itself too.
- Market requests respect `Expires`, revalidate with `If-None-Match`, and do
  not run blind retries. Requests are bounded by a process-wide concurrency
  gate and stop at the request/error budget floors; `420`/`429` honors
  `Retry-After`.
- Multi-page order results are rejected if their `Last-Modified` values do
  not match page 1, avoiding a mixed snapshot if ESI refreshes during paging.
- ESI's guidance says not to fetch before `Expires`, to send application
  identification, and to keep the compatibility date current with supported
  schema versions. The current selected compatibility date is the
  `2020-01-01` value ESI returns for these requests.

### Pricing semantics (the part that is easy to get wrong)

- Orders are scoped to a **region** but placed in a **system** (`system_id`)
  and **station** (`location_id`).
- Aggregating a whole region mixes distant markets and produces an apparent
  spread between orders that cannot trade. In the 2026-11-19 20:10 UTC
  Tritanium capture, the region-wide best sell was 3.96 in Perimeter and best
  buy was 3.97 in Jita, an apparent 0.25% spread across station-range orders.
  An earlier capture showed the opposite, negative spread; the sign can change
  as markets move, but the region-wide aggregation remains invalid.
- Aggregating per **hub system** gives a sane book. Verified same capture:

  | system | name | best sell | best buy | spread |
  |---|---|---|---|---|
  | 30000142 | Jita | 4.15 | 3.97 | 4.53% |
  | 30000144 | Perimeter | 4.20 | 3.95 | 6.33% |
  | 30030141 | (structure) | 4.00 | 3.00 | 33.33% |

  -> **Rule: fetch per region (that is how the endpoint is scoped), then keep
  only orders whose `system_id` is the hub's system.**
- Verified hub systems: Jita `30000142` (The Forge `10000002`), Amarr
  `30002187` (Domain `10000043`), Dodixie `30002659` (Sinq Laison
  `10000032`), Hek `30002053` (Metropolis `10000042`), Rens `30002510`
  (Heimatar `10000030`). Jita 4-4 station is `60003760`.
- Best buy = max `price` among buy orders (ignore `min_volume` for the MVP,
  note it for a later phase); best sell = min `price` among sell orders.
  Both over the item's orders in the hub system only.
- **A bid above the ask is possible inside one system.** Orders carry
  `range: station`, so a bid in one station and an ask in another cannot
  trade against each other. Verified live on 2026-11-19: Hek Tritanium showed
  best buy 3.04 and best sell 3.01. Do not "fix" this by widening the filter,
  and do not compute a single spread - show both sides as they are.
- **Station scope is the default, system scope is the toggle.** Phases 1-2:
  price the hub's primary station (the station ids and their verification are
  in `phase-2-web-ui.md`) and let the user widen to the whole system. Both
  scopes are computed from the same region fetch, so switching costs no
  upstream request.
- `min_volume` is 1 on the orders captured so far, but it is a real constraint
  for buy orders in principle. The MVP ignores it and says so.

## Decisions and why

- **Server-side ESI only.** Three independent reasons: browsers cannot set a
  descriptive `User-Agent` (CCP asks for one and will block anonymous
  scrapers), CORS blocks direct ESI calls from a page, and the rate budget is
  per client - fan-out to visitors would burn it instantly and leak our
  quota behaviour. The server is a cache and an aggregator, nothing more.
- **Per-system aggregation** (above): correctness beats matching a
  region-wide number.
- **Per-(region, type) cache entries**, TTL from `Expires`, revalidated with
  `ETag`. Keyed so that 100 users pasting Tritanium cost one upstream fetch
  per five minutes.
- **No database in the MVP.** In-process cache with a bounded size; if the
  app ever needs multiple instances, that becomes a phase of its own.
- **Never serve a price past its `Expires`.** A stale entry is revalidated, and
  a failed revalidation is an error, not a reason to show an old number.
  Concurrent revalidations are deduplicated, so this costs one request, not
  one per visitor. (Phase 3 records why this beats a stale-while-revalidate
  window for this app.)
- **Next.js (App Router) + TypeScript**, UI-free core module + thin
  server/UI layer, mirroring EveDpsOverlay's `Core`/`Wpf` split.
- **CI from the first code commit** (build + typecheck + tests), because a
  website's "release" is a deploy and regressions ship instantly.

## Fixtures inventory

Captured 2026-11-19 with `node scripts/capture-fixtures.mjs`. Each directory
holds `request.txt`, `response.headers.txt` and (except for HEAD/304)
`response.body.json`. **Fixtures are recorded reality: never edit them to
make a test pass.** Re-capture instead, and update this table plus the facts
above in the same change.

| fixture | what it proves |
|---|---|
| `universe-ids-names` | bare-array body; one name matches a character *and* a type |
| `universe-names-hub-systems` | hub system ids and Jita 4-4 station id resolve to the names we claim |
| `orders-forge-tritanium` | real order shape, 1000/page contract, both sides in one response |
| `orders-forge-tritanium-revalidate` | `If-None-Match` -> `304`, 0 bytes |
| `orders-forge-tritanium-page2` | page past `X-Pages` -> `404` |
| `orders-forge-plex-empty` | a published type with no orders -> `200 []` |
| `history-forge-tritanium` | daily OHLCV shape; last row is yesterday |
| `types-tritanium` | type metadata used for display/totals |
| `region-orders-forge-buy-head` | headers only: `X-Pages: 134` for one side of one region |

## Milestones

| phase | scope | spec | status |
|---|---|---|---|
| 0 | ESI spike: endpoints, paging, caching, per-system pricing rule; fixtures | this file | done |
| 1 | UI-free market core: parse paste text, resolve types, fetch+aggregate per hub, cache with ETag/Expires; fixture-tested; console smoke | `phase-1-market-core.md` | done |
| 2 | Web UI: one textarea, two-row Sellers/Buyers comparison across hubs, ranked prices, totals, station/system toggle, rejected/unresolved feedback | `phase-2-web-ui.md` | done |
| 3 | Cache + budget hardening: LRU-bounded order cache, process-wide concurrency gate, ESI budget headers and `Retry-After`, cached name lookups | `phase-3-cache-hardening.md` | done |
| 4 | Name search/catalog: resolve arbitrary item names (ESI ids endpoint is exact-match only), paste-format edge cases | - | - |
| 5 | Deploy + tagged release notes | `phase-5-deploy.md` | done |

Ordering constraints: phase 1 must be testable with no network (fixtures);
phase 2 must not add ESI calls of its own; phase 3 must not change prices,
only how they are obtained.

## Open questions

- **Item catalogue for search.** `POST /universe/ids/` requires exact names,
  and a static `invTypes` dump is the usual answer for prefix/fuzzy search
  (`developers.eveonline.com/static-data/`, `sde.zzeve.com`,
  `fuzzwork.co.uk/dump/latest/` all responded 200 on 2026-11-19, but content
  and licence were not inspected). Resolve in phase 4, not before.
- **Paste formats.** EVE's inventory copy uses tab-separated name and
  quantity in some locales and space-separated in others; cargo scans and
  contracts differ again. Phase 1 fixes the grammar for the formats we can
  capture from the client, and the parser must reject (not guess) the rest.
- **Buy/sell label wording in the UI.** Resolved in phase 2: rows are labeled
  `Sellers` (best sell order/ask) and `Buyers` (best buy order/bid), with the
  prices and their relationship across hubs explained in the legend.
- **Station scope.** Resolved in phase 2: the hub's primary station is the
  default, with a toggle to the whole system. Station ids are verified and
  listed in `phase-2-web-ui.md`; no id-to-name lookups happen per order.
