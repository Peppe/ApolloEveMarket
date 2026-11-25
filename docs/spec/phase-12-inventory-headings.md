# Phase 12 - Inventory category headings

Status: done (2026-11-25)

Goal: let users visually group inventory items in the appraisal table with
simple headings in the pasted input.

## Scope

In: recognizing category-heading lines, preserving their order with item rows,
rendering full-width styled heading rows, and tests for parsing and display
data.

Out: nested categories, collapsible groups, separate totals per category,
category metadata in the share URL, or changing item pricing and duplicate
quantity semantics.

## Input format

- A non-empty trimmed line beginning with `# ` is a category heading. The
  heading text is everything after the first `# `, trimmed at both ends.
- A `# ` line with no heading text is rejected with a readable reason.
- Heading lines are not item names, unresolved items, or rejected inventory
  rows; they do not count toward the 100-distinct-item limit.
- Items and headings retain their input order in the results table.
- Duplicate item names continue to merge case-insensitively and sum quantities
  as before. The merged item stays at its first input position and in that
  position's category.
- If a category contains no resolved/priced item, omit its heading from the
  results table. Consecutive headings with no item rows use the last heading
  before the next priced item.
- Existing inputs without headings keep their current parsing and display
  behavior.

## Results presentation

- A heading is rendered as one table row between item rows.
- Its text spans the full table width, including item, quantity, side, and all
  market columns.
- Heading styling is visually distinct from item rows while matching the
  existing table and brand theme.
- Heading rows do not alter price cells, history/order-book panel behavior,
  totals, or the final totals rows.
- An input containing no priced items continues to use the existing
  "Nothing could be priced" message; headings alone do not create a results
  table.

## Acceptance criteria

- [x] `# Gallente` parses as a heading titled `Gallente`, not as an item or
      rejected line.
- [x] Heading lines with empty titles are rejected clearly and do not resolve
      or price as items.
- [x] Results preserve heading/item order and show each heading on a styled row
      spanning every table column.
- [x] Existing duplicate merging, input limits, pricing totals, and panel
      interactions remain correct.
- [x] Headings without a priced item beneath them are omitted.
- [x] The feature is covered by parser and results tests.
- [x] `npm run typecheck`, `npm test`, and `npm run build` pass.
