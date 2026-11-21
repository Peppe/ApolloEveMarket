# Phase 8 - Market history panel

Status: draft

Goal: let a user inspect an item's daily market history from a table price
cell in an expandable inline panel.

This phase depends on Phase 7: the default graph market scope is region, and
the graph can later follow an explicitly selected station or system scope.

## Scope

In: inline history row, panel modes, candlestick and volume rendering, date
range controls, local-storage settings, region history loading, and keyboard/
pointer interaction.

Out: order-book implementation, live order-depth visualization, chart
indicators, annotations, export, server persistence, and account features.

## Panel architecture

- The table price area uses a panel host inserted between the selected item
  and the next item row.
- The host is independent of the chart implementation. It defines the item,
  hub/region, and a selected panel mode.
- The first panel mode is market history. A second order-book mode may be
  prepared and shown only when implemented.
- The panel host must support replacing one chart implementation with another
  without changing table interaction behavior.

## Opening and closing

- Any item price cell, for a hub and for either Sellers or Buyers, opens the
  history for that item and hub.
- Quantity cells and totals cells are not price cells and do not open a panel.
- The selected price cell has a visible active state.
- The panel opens directly after the selected item and before the next item.
- If the selected item is the final item, the panel opens after its final
  row and before the totals row.
- Clicking the active price cell again closes the panel.
- Clicking another price cell closes the current panel and opens the new one.
- Clicking another item or the scope control does not require keeping the
  panel open. It may close on data refresh or remain if the item and hub are
  still available.
- Buy and Sell price cells open the same history market; they do not select
  separate history series.

## Market scope

- Default market scope is Region.
- The graph uses the selected hub's region for regular items.
- PLEX uses ESI's global market region, not the selected hub's region.
- Station/system graph support is not required for the first release. The
  panel can expose only Region until the corresponding scoped history API
  behavior is implemented and verified.
- The scope label is visible in the panel header.

## Candle representation

- ESI supplies only daily `average`, `highest`, `lowest`, `order_count`, and
  `volume`; it does not supply open or close.
- A unit candle represents a single day by default.
- The candle draw is a vertical range from `lowest` to `highest`, with a
  horizontal marker at `average`.
- Before selecting a charting dependency or building a renderer, evaluate
  existing chart frameworks for an out-of-the-box range/candlestick series
  that maps high, low, and average without inventing open/close values, plus a
  volume series sharing the date axis and range controls.
- Prefer a framework's built-in series and interaction model over a custom
  renderer. Limit custom work to data adaptation, accessibility, and visual
  theme integration. Do not build a heavily customized chart if a suitable
  built-in chart can represent these values accurately.
- Record the candidate(s), fixture-backed visual result, missing capabilities,
  licensing/dependency impact, and selection rationale before adding a runtime
  dependency. If no evaluated framework supports the required representation
  and linked volume/range interactions cleanly, revise this spec before
  choosing a custom renderer.
- Red/green candle fill is not based on unavailable open/close values. Use
  established app red/green palette semantics for separate positive/negative
  or price-change context only, never as a true intraday close claim.
- Larger candle units are supported as settings:
  `1 day`, `3 days`, `1 week`, `1 month`.
- Aggregating to a larger unit combines each source day's low/high/average and
  volume. The aggregated average is a volume- or count-weighted average only
  if the source data supports the exact weight; otherwise use the mean of
  source daily averages and label it as an average. The spec implementation
  must state the selected formula.
- Missing dates remain missing; they are not fabricated with zero or copied
  forward.

## Volume

- Volume uses the bottom secondary chart section.
- The history chart and volume chart share the horizontal date axis.
- Volume bars use the same grouped candle unit as the candles.
- Volume aggregation sums the source daily `volume`.
- Volume bars preserve the selected date range and pan/zoom state.

## Date range and zoom

- The default date range is 1 year of available ESI history.
- The range control allows zooming in and out over the available data.
- The range control also supports a visible start/end date selection.
- If fewer than 1 year of records are available, show all available records.
- Candles and volume rerender at the same visible start/end boundary.
- The date range is never inferred from a missing value or current table price.

## Local storage

- Chart settings persist in browser local storage:
  candle unit, start date, end date, and selected panel mode.
- Settings carry across different items and hubs.
- They do not persist an open panel or the selected item.
- Invalid or unavailable local storage falls back to default settings and does
  not prevent table use.
- Region scope and graph settings are independent.

## Loading and errors

- History loads server-side. No browser request goes directly to ESI.
- A graph loading state is shown inside the panel.
- Missing history renders a readable no-history state instead of a chart.
- Fetch or budget errors render a readable panel error and preserve the table.
- History cache behavior follows `Expires` and ETag rules already used by the
  app; stale history is never served.

## Accessibility

- Price cells that open the panel expose a keyboard-operable button or equivalent
  control.
- The open/closed state is represented with `aria-expanded` and `aria-controls`.
- Panel state changes are announced by assistive technology.
- Chart text and controls remain readable in keyboard navigation.
- Pointer controls have keyboard equivalents.

## Acceptance criteria

- [ ] A panel host is separate from the candlestick chart implementation.
- [ ] Item price cells open and close an inline history row; totals and quantity
      cells do not.
- [ ] Clicking another price cell replaces the open panel.
- [ ] Buyers and Sellers price cells open the same history for the selected item
      and hub.
- [ ] Region history is the default and uses the selected hub region.
- [ ] PLEX uses the global region and is labeled as such.
- [ ] Chart framework candidates are evaluated against the committed history
      fixture before dependency selection; prefer an out-of-the-box range
      series for high/low/average and linked volume.
- [ ] Candidate, fit, licensing/dependency impact, and selection rationale
      are recorded in the implementation change.
- [ ] Daily candles use high/low range and average marker exactly.
- [ ] Candles aggregate to 1 day, 3 days, 1 week, or 1 month.
- [ ] Volume chart uses the same date range and the summed volume aggregation.
- [ ] Date range can expand and contract and persists with the candle unit.
- [ ] Chart settings persist across graph-to-graph navigation in local storage.
- [ ] The chart panel has a switch point for a future order-book panel.
- [ ] Loading, no-history and error states stay inside the panel.
- [ ] The implementation is fixture-tested with the committed history fixture.
- [ ] `npm run typecheck`, `npm test`, `npm run build` pass.
