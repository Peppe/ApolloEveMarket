# ApolloEveMarket

Paste an EVE Online inventory (or a list of item names) and see the best buy
and best sell price for every major trade hub at once - Jita, Dodixie, Amarr,
Hek, Rens.

Status: phases 0-3 done. The ESI facts are verified and recorded, the UI-free
market core is fixture-tested, and the web page is live in the browser against
real ESI: paste box, buy/sell table per hub, totals, and a station/system
price-scope toggle. The live path is bounded too: LRU order cache, one
process-wide concurrency gate, ESI budget headers honoured, cached name
lookups. Not deployed yet.

## Run it

```sh
npm install
npm run dev          # http://localhost:3000
```

Paste an inventory (or type `Tritanium 1000000` style lines) and press
Appraise. The table shows, per hub and per item, `buy` (best buy order - what
you receive by selling into it) and `sell` (best sell order - what you pay by
buying from it). A dash means no orders on that side in that scope.

"Hub station" prices only the hub's main station (for example Jita IV-4);
"Whole system" widens to every station and structure in the hub's solar
system. Switching re-prices from the same cached orders.

## Where things live

- `docs/spec/intent.md` - goals, non-goals, verified ESI facts, milestones.
- `docs/spec/phase-<n>-*.md` - one page per phase with acceptance criteria.
- `docs/spec/fixtures/` - real captured ESI responses (never edited).
- `scripts/capture-fixtures.mjs` - re-captures them from the live API.
- `src/market-core/` - UI-free parsing, ESI client, aggregation (no React).
- `src/app/` - Next.js page, server action, form, styles.
- `AGENTS.md` - working rules (spec-driven, verification, git, conventions).

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run smoke -- "Tritanium" "Hobgoblin I"             # live ESI, hub stations
npm run smoke -- --system "Tritanium"                  # live ESI, whole systems
```

`npm run smoke` is the only command that touches live ESI and is never part of
`npm test`; the tests run entirely on the captured fixtures.

## Design in one line

All ESI traffic is server-side and cached (`Expires` + `ETag`, LRU-bounded,
single-flight); prices are aggregated per hub **system**, then narrowed to the
hub **station** by default, because region-wide aggregation mixes distant
markets and produces negative spreads on real data. One process-wide gate and
one budget guard cover every upstream call, so a burst of visitors cannot
spend CCP's quota faster than the cache allows.
