# Phase 7 - Region price scope

Status: done (2026-11-21)

Goal: add EVE's region market scope to the existing price-scope control.
Region scope is the default and is implemented as a separate phase before
history and graph features.

## Scope

In: region scope selection, scope persistence while appraising, region-aware
table labels, and a region filtering decision record.

Out: history graphs, candlesticks, volume charts, order-book panels, changes to
station/system aggregation behavior.

## Scope semantics

- Region: orders fetched for the hub's region, with no station or system
  filtering. This matches EVE's in-game regional market view.
- Station: existing behavior, limited to the hub's primary station.
- System: existing behavior, limited to the hub's solar system.

Region is the initial and default scope for new visits. Existing browser-local
text restoration does not replace the scope default unless a later spec adds
scope restoration.

## UI

- The existing two-option scope control becomes three options:
  `Region`, `Hub station`, `Whole system`.
- A scope change re-prices the existing text without requiring another text
  edit.
- The table scope note identifies the selected scope.
- PLEX remains identical in all hubs and across all three scopes because ESI
  defines PLEX as a global market.

## Acceptance criteria

- [x] `PriceMode` includes `"region"` in the market core and web action.
- [x] Region mode fetches no extra station/system filter; the hub region book
      is the source.
- [x] Region is the default on first visit and initial result rendering.
- [x] The station and system modes retain their existing behavior and fixtures.
- [x] Switching scope refreshes the existing inventory text and cache-backed
      appraisal.
- [x] The UI scope note distinguishes region, station and system.
- [x] Fixture tests prove at least one item differs from the Jita system and
      Jita station books when region aggregation is used.
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.
