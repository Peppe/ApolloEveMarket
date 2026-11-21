# ApolloEveMarket

Paste an EVE Online inventory (or a list of item names) and see the best buy
and best sell price for Jita, Dodixie, Amarr and Hek, plus a searchable fifth
column for any EVE market region.

The ESI facts are verified and recorded, the UI-free market core is
fixture-tested, and the site is live against real ESI: paste box, per-hub
Buyers and Sellers comparison, ranked prices, item icons, totals, and Region,
System and Station price scopes. The source also includes an inline regional
history chart with linked volume and browser-local chart settings. PLEX uses
ESI's global market region and is priced the same in every hub. The app has a
custom plum-and-pink theme and logo, with Space Mono Bold headings, Roboto Mono
numbers, and Josefin Sans copy. The last appraisal and custom region selection
are restored from browser-local storage; the custom region defaults to
Heimatar, which contains the Rens trade hub. The live path is bounded too: LRU
order cache, one process-wide concurrency gate, ESI budget headers honoured,
cached name lookups.

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
the columns. Each item includes its EVE icon. The latest input is saved in this
browser and appraised when you return; it is not stored on the server. A dash
means no orders on that side in that scope.

"Region" prices the selected hub's whole EVE region and is the default;
"System" narrows to every station and structure in the hub's solar system;
"Station" narrows to the hub's main station (for example Jita IV-4).
Switching re-prices from the same cached orders. Click any item price cell to
open regional daily high-low history with an average marker and linked volume.
Candle size and date range are shared across graphs and saved in this browser.
After appraising, the URL fragment contains a self-contained compressed copy of
the inventory and price scope. Share the URL to restore and re-price it with
current ESI data; the link contains no saved prices and is not private.
The custom region is a browser-local preference and is not part of the link.
The fifth column always uses whole-region prices, regardless of the fixed hub
price scope.

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
npm run smoke -- "Tritanium" "Hobgoblin I"             # live ESI, hub regions
npm run smoke -- --system "Tritanium"                  # live ESI, whole systems
```

`npm run smoke` is the only command that touches live ESI and is never part of
`npm test`; the tests run entirely on the captured fixtures.

## Design in one line

All ESI traffic, including history and region metadata, is server-side.
Market-order and history caches honor `Expires` and `ETag`; region metadata is
cached per server process. A process-wide gate and budget guard cover every
upstream call, so visitors cannot spend CCP's quota faster than the cache allows.
