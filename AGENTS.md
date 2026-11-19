# ApolloEveMarket - project instructions

Paste an EVE inventory (or type item names) and see the best buy and best sell
price for every major hub - Jita, Dodixie, Amarr, Hek, Rens - side by side.

## Spec-driven workflow

- The intent of the app lives in `docs/spec/`. `docs/spec/intent.md` is the
  source of truth for scope and non-goals; each phase has a one-page spec with
  acceptance criteria.
- Read the active phase spec **before** implementing anything for that phase.
- Implement only what the active spec's acceptance criteria require. If
  behavior changes in a way the spec does not cover, update the spec in the
  same change so the document never drifts from reality.
- Spec status is `draft -> accepted -> done`. Never leave it stale.
- Files in `docs/spec/fixtures/` are **REAL ESI responses** (bodies, headers,
  rate-limit values) captured from the live API. Never edit one to make a test
  pass; re-capture it with `node scripts/capture-fixtures.mjs` and update
  `docs/spec/intent.md` in the same change.
- Verified server behavior is recorded in the "Known environment facts" section
  of `docs/spec/intent.md` **with the date it was verified**. Do not restate
  API behavior from memory.

## Verification

Run after every change (all three must pass):

```sh
npm run typecheck
npm test
npm run build
```

- Market math, parsing and HTTP/caching behavior are only proven against the
  committed fixtures. Do not claim a change works without running `npm test`.
- A live wiring check against the real API (no UI needed):
  `npm run smoke -- "Tritanium" "Hobgoblin I"`
  This is the only command that may touch live ESI, and it must not be part of
  `npm test`.

## Hard architectural rules

- **All ESI traffic is server-side.** No `fetch` to `esi.evetech.net` from
  client components, hooks, or anywhere shipped to the browser. Browsers
  cannot set the `User-Agent` CCP wants, CORS blocks direct calls, and the
  rate budget is shared.
- **The core is UI-free.** Modules that parse input, call ESI, aggregate
  orders and cache results import nothing from React or Next.js. The web layer
  is a thin adapter over the core.
- **Caching is correctness.** Respect `Expires` and revalidate with `ETag`;
  a price older than the API's own expiry is a bug, not a slow path.
- **Aggregate per hub system, never per region.** See the pricing semantics
  section of `docs/spec/intent.md`; region-wide aggregation produces negative
  spreads on real data.
- Never commit secrets. There are no API keys in this project - ESI public
  endpoints need none.

## Git workflow (user rule)

- Every feature/phase is implemented on its own **feature branch**, never
  directly on `main`. Branch names: `phase-<n>-<short-name>` or
  `feat/<short-name>`.
- **`main` must always be a known-good, buildable, tested state** - the user
  can switch to it manually whenever something goes wrong. Do not commit
  broken or unverified code to `main`, ever.
- Only merge a feature branch back into `main` after its verification is green
  and the affected specs are updated in the same branch. Merge with
  `git merge --no-ff <branch>` so history keeps the branch shape, then delete
  the branch.
- Commit small and early while working on a branch; subject lines short and
  imperative ("Aggregate orders per hub system"). Never leave the user without
  a committed working state at the end of a session - commit whatever is
  complete before finishing, even if the feature is not.
- Do not add a `Co-authored-by` trailer to commits.
- Release = deploy: tag and write notes for each deployed version.

## Conventions

- Next.js (App Router) + TypeScript, `strict: true`. No `any` without a
  written reason in the same file.
- Runtime: Node 20+. No external runtime services for the MVP (no database,
  no Redis) - in-process cache only.
- Keep dependency count low; prefer the standard library and Next.js built-ins.
  Every new dependency needs a one-line justification in the change.
- **All text files in this repo are ASCII-only.** No em dashes, curly quotes,
  arrows or non-breaking spaces in code, specs, script output or release
  notes. Windows tooling has repeatedly mis-decoded them; use `-`, `->`, `x`.
- Money: prices arrive as JSON numbers; keep them as numbers, format only at
  the UI edge. Never mix per-unit and total values in one field.
- Item identity is the EVE `type_id`, not the name. Names are labels.
- Tests live beside the code as `*.test.ts`; fixtures are loaded from
  `docs/spec/fixtures/`, never inlined as string literals.
- CI (`.github/workflows/ci.yml`) runs typecheck + tests + build on every push
  and pull request. Never merge with a red build.
