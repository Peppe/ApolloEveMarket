# Fixtures: recorded reality

Every directory here is a **capture of a real HTTP exchange with the live EVE
ESI API**, recorded by `scripts/capture-fixtures.mjs`. They exist so that the
market core can be tested offline, deterministically, and so that a claim like
"the API returns 404 past the last page" is backed by bytes in the repo rather
than by memory.

## The rule

**Never edit a fixture to make a test pass.** Not the body, not a header, not
a number. If the API or the market changed, the fixture is still a true record
of what it recorded; editing it destroys the only evidence we have.

When reality changes:

1. Re-run `node scripts/capture-fixtures.mjs` (overwrites the captures).
2. Read the diff. If a *shape* changed (field renamed, status changed), that is
   a real break to handle in code and in `docs/spec/intent.md`.
3. Update the affected test expectations and the "Known environment facts"
   section of `docs/spec/intent.md`, re-dating it, in the same commit.

## Layout

```
<fixture-name>/
  request.txt              method, URL, and JSON body (if any) exactly as sent
  response.headers.txt     status line + the headers that matter
  response.body.json       raw response bytes (absent for HEAD and 304)
```

`response.body.json` is written byte-for-byte from the response; headers are a
filtered subset (`content-type`, `date`, `etag`, `expires`, `last-modified`,
`x-pages`, `x-compatibility-date`, rate-limit and error-limit headers).

## Captures (2026-11-19)

| fixture | what it proves |
|---|---|
| `universe-ids-names` | POST body is a bare array; "Tritanium" matches a character *and* type 34 |
| `universe-names-hub-systems` | hub system ids and Jita 4-4 station id resolve to the names we use |
| `orders-forge-tritanium` | order shape; both book sides; 170 orders (117 in Jita system) |
| `orders-forge-tritanium-revalidate` | `If-None-Match` -> `304`, 0-byte body |
| `orders-forge-tritanium-page2` | page past `X-Pages` -> `404`, not `[]` |
| `orders-forge-plex-empty` | published type with no hub orders -> `200 []` |
| `history-forge-tritanium` | daily OHLCV shape, latest row 2026-11-18 |
| `types-tritanium` | `name/group_id/volume/portion_size/published` |
| `region-orders-forge-buy-head` | headers only: one side of one region is `X-Pages: 134` |

## Why so few order fixtures

One real response is enough to pin the *contract* (fields, paging headers,
caching headers). Multi-page and rate-limit behaviour are proven with fake
transports in unit tests, because capturing a 134-page region dump would add
~100 MB to the repo for no extra information.
