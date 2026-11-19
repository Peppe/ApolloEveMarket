# Phase 3 - Cache and budget hardening

Status: done (2026-11-19)

Goal: make the live path safe to leave running for strangers. Phase 1 proved
the numbers and the HTTP contract; this phase bounds the memory, bounds the
parallelism, and makes the process stop before CCP stops it for us.

No price changes. The same fixtures must produce the same books before and
after this phase.

## Scope

In: bounded (LRU) order cache, one process-wide concurrency gate, ESI budget
headers (`x-esi-error-limit-*`, `x-ratelimit-*`), `420`/`429` with
`Retry-After`, a bounded cache for resolved names, smoke output, and validation
that all pages in a fetched order snapshot have the same `Last-Modified`.

Out: cross-process cache (Redis, a database), serving stale prices, retry
loops, per-user quotas, deployment.

## What the captured headers actually say (2026-11-19)

Market-order responses (from `docs/spec/fixtures/orders-*`):

```
x-ratelimit-group: market-order
x-ratelimit-limit: 12000/15m
x-ratelimit-remaining: 11945
x-ratelimit-used: 2
```

Every other endpoint (from `universe-ids-names`, `types-tritanium`):

```
x-esi-error-limit-remain: 100
x-esi-error-limit-reset: 43
```

Two different budgets: a **request** budget per rate-limit group (12000 per 15
minutes), and an **error** budget (100 errors, reset in seconds). `429` (and
the older `420`) means we already spent one; `Retry-After` says how long to
wait. Nothing in the current client reads any of these.

Also worth recording: `type_id=34` in The Forge is `x-pages: 1` with 170
orders, so a normal cache entry is small. The 134-page HEAD response was the
*whole region* without a `type_id` - not something this app fetches.

## Decisions

- **Bound by entry count, not bytes.** 500 entries default. Entries are
  per-(region, type) and normally one page of orders, so this is tens of MB at
  worst and easy to reason about. Byte accounting would be false precision.
- **LRU, not FIFO.** A pasted inventory re-reads the same items; recently used
  entries are the ones worth keeping.
- **A process-wide gate, not per appraisal.** `appraise` already limits its own
  fan-out to 6. Ten concurrent visitors would still mean 60 sockets; the gate
  caps the whole process at 8 upstream requests regardless of who is asking.
  The budget check runs *inside* the gate, so a queued request re-checks when
  it finally runs.
- **Fresh budget per process.** The numbers in the headers are global to our
  IP, not to this process. The guard is a floor, not an accountant: it refuses
  new requests when the last seen remaining value is low. Being wrong in that
  direction costs one message to the user; being wrong the other way costs 15
  minutes of a blocked quota.
- **Floor values.** Skip new work below 10 errors or 100 remaining requests.
  Both are far above what one appraisal needs and far below the limits, so a
  normal traffic spike never trips them.
- **No stale serving.** The milestone line for this phase said
  "stale-while-revalidate"; the project rule in `AGENTS.md` is stronger: a
  price older than the API's own expiry is a bug. So a stale entry is
  revalidated, never served, and a failed revalidation surfaces an error.
  Single-flight still applies to that revalidation, so N concurrent visitors
  cause one upstream request. If we later want a short, labelled stale window,
  that is a decision to make explicitly, not a caching detail.
- **Name hits are cached forever, misses are not.** A `type_id` never changes
  for a given name, so a hit is permanent within the process. A miss may be a
  typo that the user fixes, so misses are re-queried (one small POST).

## Design

```
fetch transport
  -> withBudgetGuard     (checks floor before, reads headers after,
                          420/429 -> EsiBudgetError)
  -> withConcurrencyLimit (process-wide semaphore, default 8)
```

`live.ts` composes them once. Orders and name resolution share the chain, so
one gate and one budget cover all ESI traffic.

Order cache: `Map` used as an LRU (`get` re-inserts, `set` evicts the first
key above the cap). Existing `Expires`/`ETag`/single-flight behavior is
unchanged.

Name cache: `createCachedIdsFetcher(inner)` keeps normalized name -> entry for
hits only, bounded at 5000 with FIFO eviction, and merges cached hits with
fresh ones so `resolveNames` still sees every requested name. Requests to the
inner fetcher contain only names that missed.

## Acceptance criteria

- [x] Order cache is bounded (default 500 entries, LRU); a test fetches three
      keys with a cap of two and proves the right key was evicted and that a
      cache hit refreshes recency.
- [x] `withConcurrencyLimit` caps in-flight upstream calls process-wide; a test
      fires 12 requests with a cap of 3 and never sees more than 3 in flight,
      and a rejected request does not leak a slot.
- [x] The budget guard observes both header families and refuses to start a
      request below the floor, with a message that names the remaining budget.
- [x] `429`/`420` become one `EsiBudgetError` carrying `retryAfterMs` parsed
      from `Retry-After` (seconds or HTTP date); there is no blind retry.
- [x] `createCachedIdsFetcher` sends only cache misses; a second call with the
      same names makes zero upstream requests, and unresolved names are
      re-queried.
- [x] `live.ts` composes guard -> gate -> transport for both orders and name
      resolution; `npm run smoke` prints cache size and remaining budgets.
- [x] No code path serves an order book after its `Expires`.
- [x] Paginated order results with inconsistent `Last-Modified` headers fail
      instead of mixing data from different ESI cache snapshots.
- [x] Existing fixture tests are unchanged and still pass; `npm run
      typecheck`, `npm test`, `npm run build` pass.

## Verification notes

Implemented 2026-11-19 on `phase-3-cache-hardening`; gates on a clean tree:
`npm run typecheck` clean, `npm test` 8 files / 52 tests (was 6 / 31),
`npm run build` green.

- LRU: `maxCacheEntries: 2` with keys 1, 2, then a hit on 1, then 3 - the test
  proves 2 was evicted, 1 survived, and re-reading 2 costs a request.
- Gate: 12 concurrent requests through a cap of 3 peak at exactly 3; after a
  thrown request the next one still runs (the slot is handed to a waiter, never
  freed and re-taken, so the count cannot overshoot).
- Budget: a response carrying `x-esi-error-limit-remain: 4` and
  `...-reset: 12` makes the next request fail before the transport is called,
  with `retryAfterMs` 12000 and the remaining budget in the message. The same
  works for `x-ratelimit-remaining: 99` (message includes `12000/15m`).
- `429` with `Retry-After: 30` -> `EsiBudgetError` with `retryAfterMs: 30000`;
  `420` without the header -> the same error type and no retry after value.
  Other statuses (503) pass through untouched.
- Name cache: the first batch asks for `Tritanium`, a later batch asks only for
  `Ishtar` and still resolves both; unresolved names are re-queried; a full
  cache hit makes zero requests; a bound of 1 evicts the oldest name.
- Wiring: with a fake transport, `resolveNames` and two `getOrders` calls run
  through one gate (peak 1 at `maxConcurrentRequests: 1`), a `remain: 0`
  header surfaces as `EsiBudgetError` from `getOrders`, and repeating a paste
  costs one `/universe/ids/` POST.
- Live: `npm run smoke -- "Tritanium" "Hobgoblin I"` priced 10 books in 531 ms
  and printed `esi budget: 11935 of 12000/15m requests left, 100 errors left`,
  which matches the header values in the fixtures.

Not implemented on purpose: serving a stale book when revalidation fails. The
project rule says a price past `Expires` is a bug, so the app reports the
failure instead. If a short stale window is ever wanted, it must carry a
visible label and its own decision record.
