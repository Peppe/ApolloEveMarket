# EveMarket

Paste an EVE Online inventory (or a list of item names) and see the best buy
and best sell price for every major trade hub at once - Jita, Dodixie, Amarr,
Hek, Rens.

Status: phase 0 done (ESI spike + verified facts + fixtures); phase 1 is the
UI-free market core. There is no UI yet.

## Where things live

- `docs/spec/intent.md` - goals, non-goals, verified ESI facts, milestones.
- `docs/spec/phase-<n>-*.md` - one page per phase with acceptance criteria.
- `docs/spec/fixtures/` - real captured ESI responses (never edited).
- `scripts/capture-fixtures.mjs` - re-captures them from the live API.
- `AGENTS.md` - working rules (spec-driven, verification, git, conventions).

## Verify

```sh
npm run typecheck
npm test
npm run build
npm run smoke -- "Tritanium" "Hobgoblin I"   # live ESI, not part of npm test
```

## Design in one line

All ESI traffic is server-side and cached (`Expires` + `ETag`); prices are
aggregated per hub **system**, not per region, because region-wide aggregation
mixes distant markets and produces negative spreads on real data.
