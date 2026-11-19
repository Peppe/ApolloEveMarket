# ApolloEveMarket

Paste an EVE Online inventory (or a list of item names) and see the best buy
and best sell price for every major trade hub at once - Jita, Dodixie, Amarr,
Hek, Rens.

Status: phases 0-5 done. The ESI facts are verified and recorded, the UI-free
market core is fixture-tested, and the site is live against real ESI: paste
box, per-hub Buyers and Sellers comparison, ranked prices, item icons, totals,
and a station/system price-scope toggle. PLEX uses ESI's global market region
and is priced the same in every hub. The app has a custom plum-and-pink theme
and logo, with Syne ExtraBold headings and Josefin Sans copy. The last appraisal
is restored from browser-local storage. The live
path is bounded too: LRU order cache, one process-wide concurrency gate, ESI
budget headers honoured, cached name lookups.

Live: https://apolloevemarket.vercel.app

## Run it

```sh
npm install
npm run dev          # http://localhost:3000
```

Paste an inventory (or type `Tritanium 1000000` style lines) and press
Appraise, or use Ctrl+Enter / Cmd+Enter. An empty submission tries a sample
appraisal. The table shows Sellers (best sell order - what you pay) before
Buyers (best buy order - what you receive), with prices ranked by color across
the hubs. Each item includes its EVE icon. The latest input is saved in this
browser and appraised when you return; it is not stored on the server. A dash
means no orders on that side in that scope.

"Hub station" prices only the hub's main station (for example Jita IV-4);
"Whole system" widens to every station and structure in the hub's solar
system. Switching re-prices from the same cached orders.

## Deploy

The site runs on Vercel. The first deploy is a one-time login plus one
command; no environment variables and no secrets are needed, because ESI's
public endpoints need none.

```sh
npx vercel login      # once, interactive
npx vercel --prod --yes
```

`maxDuration = 60` on the page gives a cold appraisal enough time to walk the
order pages. The order cache is per server instance, so Vercel may fetch the
same book once per instance; every instance still honours `Expires`, so that
costs rate budget, never correctness.

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
