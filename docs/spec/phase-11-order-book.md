# Phase 11: Order book

Status: done (2026-11-22)

## Goal

Show the live EVE buy and sell orders for an item in the existing expanded
price-cell panel. Use real individual orders, not price-aggregated rows, while
making cumulative market depth easy to scan.

## User decisions

- The existing Order book mode beside History is the entry point.
- Display the full book, with one row per order.
- Show order quantity, price, issued age, and time remaining.
- Show cumulative quantity and use a colored background bar for cumulative
  depth.
- Present buy and sell orders in two tables side by side.

## Behavior

- Selecting Order book loads orders for the item and market scope represented
  by the expanded price cell. Reuse the existing server-side ESI order data,
  pagination, cache, and error handling; do not make browser-to-ESI requests.
- Follow the column's established scope: regional orders for a region column,
  system-filtered orders for a system column, and station-filtered orders for a
  station column. The custom region column uses its selected region. PLEX uses
  the global market region.
- Filter the fetched orders to the relevant scope before rendering. Do not
  truncate the book to a top-N set of orders. Respect the existing pagination
  safety limit and surface fetch failures rather than showing a partial book as
  complete.
- Show buy orders on the left, sorted by descending price (best bid first), and
  sell orders on the right, sorted by ascending price (best ask first). Within
  a price level, sort by issue time, oldest first.
- Each row represents one order. Show remaining quantity (`volume_remain`),
  per-unit price in ISK, age since issue time, and time until expiry derived
  from issue time plus order duration.
- Cumulative total is quantity, not ISK. For a buy order, it includes all buy
  quantities at that price or better; for a sell order, it includes all sell
  quantities at that price or better. Orders at the same price level share the
  same cumulative total and depth bar.
- Draw cumulative-depth bars behind the rows, scaled independently for each
  side to that side's total available quantity. Use green for buys and red for
  sells. Make the buy bar grow inward from the center edge of the left table and
  the sell bar grow inward from the center edge of the right table.
- Keep History available as the other panel mode. Show a clear empty state if
  either side has no orders. On narrow screens, stack the tables while
  preserving buy-before-sell order.
- Do not add a separate Clear control.

## Acceptance criteria

- [x] The existing Order book mode is enabled and displays the selected item's
  scoped orders without changing History behavior.
- [x] Buy and sell orders are independently sorted in best-price-first order, with
  individual orders retained and no price-level aggregation.
- [x] Remaining quantity, per-unit price, issue age, and time remaining are shown
  for each order.
- [x] Cumulative quantity and the depth bar include every order at the current
  price level and all better price levels; same-price order rows agree.
- [x] The tables use the correct region, system, or station scope, including the
  custom region and global PLEX cases.
- [x] ESI traffic remains server-side; cache and page-limit behavior are
  preserved, and incomplete pagination is reported as an error.
- [x] Tests cover ordering, scope filtering, time derivation, cumulative totals
  across price levels, and same-price orders using committed ESI fixtures.
- [x] If an ESI page advertised by `X-Pages` disappears during pagination, return a
  visible error instead of treating the collected pages as a complete book.
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.

## Out of scope

- Persistent order-book snapshots or historical order changes.
- Order placement, editing, or cancellation.
- A new Clear control or separate order-book page.
