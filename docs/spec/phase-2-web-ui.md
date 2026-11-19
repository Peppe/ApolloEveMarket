# Phase 2 - Web UI (paste box and hub table)

Status: done (2026-11-19)

Goal: the thing the project exists for. One textarea: paste an inventory or type
item names, press Appraise, and compare seller prices across Jita, Dodixie,
Amarr, Hek and Rens on one row and buyer prices across them on the next, with
totals and a toggle that switches pricing between the hub's primary station and
its whole system.

## Scope

In: page layout, form, results table, totals, station/system toggle, rejected
and unresolved feedback, server action wiring, styling, first-visit sample
appraisal, browser-local last-input restore, item icons, and application
branding.

Out: name search/autocomplete (phase 4), server-side persistence, multiple
saved appraisals, history charts, deployment.

## Pricing scope (the toggle)

- **station** (default): only orders whose `location_id` is the hub's primary
  station. This is "what the market at Jita 4-4 looks like".
- **system**: orders in the hub's solar system, as in phase 1. This includes
  structures and other stations (Perimeter's TTT, for example).

Station ids verified on 2026-11-19 from `/universe/systems/{id}/` plus
`/universe/names/`:

| hub | station | name |
|---|---|---|
| Jita | 60003760 | Jita IV - Moon 4 - Caldari Navy Assembly Plant |
| Dodixie | 60011866 | Dodixie IX - Moon 20 - Federation Navy Assembly Plant |
| Amarr | 60008494 | Amarr VIII (Oris) - Emperor Family Academy |
| Hek | 60005686 | Hek VIII - Moon 12 - Boundless Creation Factory |
| Rens | 60004588 | Rens VI - Moon 8 - Brutor Tribe Treasury |

The toggle is a two-option control; changing it re-prices with the same text
against the same cached orders (refiltered, not refetched).

## Column semantics (fixed by the UI, not negotiable per page)

- `buy` = best **buy order** (highest bid): what you receive by selling into
  the book.
- `sell` = best **sell order** (lowest ask): what you pay by buying from it.

Rows are labeled **Sellers** (best sell order/ask) and **Buyers** (best buy
order/bid), matching EVE's market wording. Sellers appear first. Within each
row, available prices are ranked across hubs: highest is bright red, second
highest darker red, middle white, second lowest darker green, and lowest bright
green. Equal prices share a color; missing prices are not ranked. Totals use
the same ordering and ranking. No `spread` column: a bid above the ask inside
one system is legitimate (`range: station` across stations), so a single spread
number would be a lie.

## Server boundary

- The page is a server component; the form is a client component that calls a
  **server action**. No ESI code reaches the browser.
- One module-level `createLiveMarket()` instance per server process, so the
  order cache is shared across requests and visitors.
- Input limits enforced server-side before any network call: at most 20,000
  characters and at most 100 parsed items; over the limit returns a clear error
  instead of spending the rate budget.
- Errors from ESI surface as a message in the form; the page stays usable.

## Acceptance criteria

- [x] Hub table in `hubs.ts` carries `stationId`; `aggregateBook` accepts an
      optional station id and filters on `location_id` when given.
- [x] `appraise(text, deps, { priceMode })` supports `"station"` (default) and
      `"system"`, echoes the mode in its result, and prices the same text
      differently per mode where the data differs.
- [x] Fixture test: station `60003760` yields best buy 3.94 / best sell 4.15
      over 110 orders (vs 113 for the whole Jita system), proving the filter.
- [x] `npm run smoke` supports `--station` / `--system` and prints which scope
      it used.
- [x] Page renders a textarea, mode toggle, submit button, and after submitting
      a table with two rows per item (Sellers then Buyers, each with one price
      per hub), matching totals rows, and the scope label (station name or
      system).
- [x] Price text is ranked by value across hubs on each row: most expensive red,
      second darker red, middle white, fourth darker green, cheapest bright
      green; ties share a rank and missing prices are unranked.
- [x] Rejected lines and unresolved names are shown to the user, not swallowed.
- [x] Missing side of an item's book renders as `-`, not `0`.
- [x] Submitting an empty textarea appraises the displayed sample input.
- [x] Ctrl+Enter or Cmd+Enter in the textarea submits the appraisal, matching
      the Appraise button.
- [x] The latest submitted text is stored in browser local storage and
      automatically restored and appraised on the next page load. If browser
      storage is unavailable, the user sees a warning.
- [x] Each resolved item row shows its icon from
      `https://images.evetech.net/types/{type_id}/icon?size=64`; the core and
      server action provide the resolved type id.
- [x] The page uses the supplied plum background and pink brand accents,
      retains the existing price-ranking colors, and shows the supplied logo.
- [x] Favicon, Apple touch icon, app icons, manifest, and browser theme color
      use the supplied brand assets and `#0F0B13`.
- [x] Headings use Syne ExtraBold, copy uses Josefin Sans, and the inventory
      textarea remains monospaced.
- [x] Server action rejects input over the limits with a readable message.
- [x] No client component imports `src/market-core` (it imports only the
      server action); the import-boundary test still passes.
- [x] `npm run typecheck`, `npm test`, `npm run build` pass; the page works in
      a real browser against live ESI.

## Verification notes

Verified 2026-11-19 in the in-app Chromium browser against live ESI, F5 on
the dev server, plus the three gates on a clean tree:

- Initial browser verification below used the 18:31 UTC fixture capture.
  At 20:10 UTC, fixture-backed scope counts are 113 orders at Jita 4-4 versus
  116 in the Jita system; both now have best buy/sell 3.97 / 4.15 because the
  extreme orders sit in that station.
- Pasting `Tritanium 1000000 / Hobgoblin I 10 / Ishtar 1` at station scope
  rendered the three rows and a totals row; Jita buy 3.96, sell 4.13.
- Toggling to whole system re-priced from the same cached orders: Amarr sell
  moved 3.61 (station) -> 3.28 (system), proving the filter changes results.
  The toggle POST carried the typed text and the new mode.
- Empty submit and over-limit input return a message and do not price.
- `npm run smoke -- "Tritanium"` prints `scope: station (hub station)`.
- Brand refresh verified in the local browser: deep-plum page background,
  pink Appraise button, supplied logo, favicon links, and manifest theme color.

Two React behaviours were found and fixed in the browser, not by reasoning:

1. An uncontrolled textarea lost its value when the result re-rendered, so
   flipping the scope submitted an empty box. Both the textarea and the mode are
   now controlled React state.
2. React 19 resets form fields after a server action completes, which reverted
   a radio's `checked` state. The mode is no longer a form field: it lives in
   React state and is injected into `FormData` by the action wrapper, and the
   toggle renders as `aria-pressed` buttons.

`next dev` also rewrites `AGENTS.md` on start with a block containing non-ASCII
characters; `agentRules: false` in `next.config.ts` disables that so the
project's own rules file and the ASCII-only rule stay intact.
