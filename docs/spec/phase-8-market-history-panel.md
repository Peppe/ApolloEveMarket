# Phase 8 - Market history panel

Status: done (2026-11-21)

Goal: let a user inspect an item's daily market history from a table price
cell in an expandable inline panel.

This phase depends on Phase 7: the default graph market scope is region, and
the graph can later follow an explicitly selected station or system scope.

## Scope

In: inline history row, panel modes, daily range and volume rendering, date
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
  filled circle at `average`.
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
- Evaluation decision (2026-11-21): Chart.js built-in floating bars accept
  low/high ranges, line point styles provide the average marker, and a second
  built-in bar chart provides volume. Both use a shared numeric date axis
  controlled by native date/range inputs, so no custom renderer or time-axis
  adapter is needed. Chart.js is MIT-licensed. ApexCharts also has a built-in
  range-bar type, but its current dual Community/Commercial/OEM license model
  introduces usage and redistribution conditions for this interactive public
  app. Use Chart.js; customize only series configuration and app theme.
- Aggregation uses the arithmetic mean of daily averages because ESI does not
  provide inputs for a volume-weighted price. High and low use the maximum and
  minimum; volume is summed.
- Week groups start Monday UTC; 3-day groups are calendar blocks anchored to
  January 1.
- Range and volume fills use green when the current plotted average is higher
  than the previous plotted average, red when lower, and a neutral color when
  equal or when no previous point exists. This compares periods, not
  unavailable open/close values.
- Range and volume bars have no visible outline. Average circles use the same
  directional color as their range fill.
- When more than 120 periods are plotted, show average circles at regular
  intervals while retaining all range bars and tooltip data.
- Price tooltips list high, average, and low on separate lines, formatted as
  comma-separated ISK values with up to two fractional digits.
- Larger candle units are supported as settings:
  `1 day`, `3 days`, `1 week`, `1 month`.
- Aggregating to a larger unit combines each source day's low/high/average and
  volume using the formula recorded above.
- Missing dates remain missing; they are not fabricated with zero or copied
  forward.

## Volume

- Volume uses the bottom secondary chart section.
- The history chart and volume chart share the horizontal date axis.
- Volume bars use the same grouped candle unit as the candles.
- Volume aggregation sums the source daily `volume`.
- Volume bars preserve the selected date range and rerender with each range
  change.
- Volume bars use a consistent blue fill, independent of price direction, and
  have no visible outline.

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

- [x] A panel host is separate from the range-chart implementation.
- [x] Item price cells open and close an inline history row; totals and quantity
      cells do not.
- [x] Clicking another price cell replaces the open panel.
- [x] Buyers and Sellers price cells open the same history for the selected item
      and hub.
- [x] Region history is the default and uses the selected hub region.
- [x] PLEX uses the global region and is labeled as such.
- [x] Chart.js built-in floating bar, point, and volume series were evaluated
      against the history fixture; license and alternative considerations are
      recorded above.
- [x] Daily candles use high/low range and average marker exactly.
- [x] Filled average circles align with the range bars; bar outlines are
      omitted and dense charts limit visible circles without dropping data.
- [x] Range and volume colors indicate change from the previous plotted
      average; price tooltips list high, average, and low as formatted ISK.
- [x] Candles aggregate to 1 day, 3 days, 1 week, or 1 month.
- [x] Volume chart uses the same date range and the summed volume aggregation.
- [x] Date range can expand and contract and persists with the candle unit.
- [x] Chart settings persist across graph-to-graph navigation in local storage.
- [x] The chart panel has a switch point for a future order-book panel.
- [x] Loading, no-history and error states stay inside the panel.
- [x] The implementation is fixture-tested with the committed history fixture.
- [x] `npm run typecheck`, `npm test`, `npm run build` pass.
