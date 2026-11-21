# Phase 10 - Custom region comparison column

Status: done (2026-11-21)

Goal: let the user choose a region for the fifth comparison column, in addition
to the four fixed trade hubs.

## Scope

In: searchable region selection, region-wide pricing in the custom column,
local persistence, reset-to-default behavior, clear scope labels, and history
for the selected region.

Out: changing the four fixed hub columns, per-region system/station selection
in the custom column, including the custom region in share links, multiple
custom columns, and server-side preference storage.

## Comparison columns

- The first four columns remain Jita, Dodixie, Amarr, and Hek in that order.
- The fifth column is the custom region column. Its default is Heimatar
  (region 10000030), which contains the Rens trade hub. The catalogue and
  column use the region's actual name, Heimatar.
- The fifth column heading presents a region chooser that can be opened to
  search and select a region.
- The search matches region names without requiring exact case.
- Selecting a region re-runs the current appraisal; it does not require the
  user to edit or resubmit the inventory manually.
- Region names and ids must come from a validated region catalogue suitable
  for market queries. Determine and test the catalogue source during
  implementation; browser code must not call ESI directly.
- The selected region's actual name labels the fifth column and its values.

## Pricing and scope

- The four fixed hub columns continue to follow the selected global price
  scope: Region, System, or Station.
- The custom column always uses the selected region's whole region market,
  with no system or station filter.
- If the global scope is System or Station, the custom column must still be
  explicitly labeled as Region so users can distinguish its semantics from
  the four hub columns.
- The scope note explains that the fixed hub columns use the selected scope
  and the custom column uses region scope when those differ.
- PLEX continues to use ESI's global PLEX market in every column, regardless
  of the selected custom region or global price scope.
- Price ranking and total calculations include the custom column using its
  resulting prices, following existing comparison semantics.

## History panel

- Opening a price cell in the custom column loads market history for the
  selected custom region.
- PLEX history continues to use its global market region.
- Changing the custom region while its history panel is open refreshes the
  panel for the newly selected region or closes the panel. It must not display
  history from the prior region under the new column heading.

## Persistence and reset

- Persist the custom region selection in browser local storage and restore it
  on later visits before appraising restored inventory.
- If local storage is unavailable or contains an invalid region, use Heimatar
  (the Rens trade hub region) and keep the rest of the app usable.
- Provide a clearly labeled, keyboard-operable reset control that returns only
  the custom region column to Heimatar (Rens). Resetting re-runs an existing
  appraisal.
- Do not persist the selection on the server.

## Share links

- Shareable appraisal URLs continue to encode inventory and selected global
  price scope, not the custom region selection.
- Opening a share link uses the recipient's locally saved custom region, or
  Heimatar (Rens) if none is saved. The shared link must not overwrite that local
  preference.
- No price snapshots or region preferences are embedded in server storage.

## Accessibility and responsive behavior

- The chooser has an accessible name, is keyboard-operable, and exposes the
  selected region.
- Search results are navigable and selectable by keyboard as well as pointer.
- The reset control has an explicit accessible label and is operable by
  keyboard.
- The fifth column remains usable in the existing responsive table layout.

## Acceptance criteria

- [x] Jita, Dodixie, Amarr, and Hek remain the first four columns; the
      searchable fifth column defaults to Heimatar (the Rens trade hub region).
- [x] The user can search for and select a validated market region, including
      Syndicate.
- [x] Selecting a region reprices the current inventory in the fifth column
      using region-wide orders.
- [x] The custom column uses region scope even while the fixed columns use
      System or Station, and this difference is clear in the column label and
      scope note.
- [x] PLEX remains global-market data in every column.
- [x] Price cells in the custom column open history for the selected region;
      changing regions cannot leave stale history visible.
- [x] The custom selection persists locally, with Heimatar (Rens) as fallback
      for missing, invalid, or unavailable storage.
- [x] A reset control restores the custom column to Heimatar (Rens) and reprices an
      existing appraisal.
- [x] Share links do not encode or overwrite the custom region preference.
- [x] All region metadata and market requests stay server-side; region
      selection and search work without direct browser ESI calls.
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.
