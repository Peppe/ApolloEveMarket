# Phase 9 - Shareable appraisals

Status: accepted (2026-11-21)

Goal: let someone share an appraisal as a URL that restores the inventory and
re-runs current pricing when opened.

## Scope

In: compact self-contained share URL encoding, restoring shared inventory and
price scope, automatic appraisal on link open, URL updates on appraisal, and
malformed-link handling.

Out: saved prices, server-side inventory storage, permanent appraisal
identifiers, accounts, and sharing chart-panel state.

## URL contract

- The URL contains enough information to reproduce the submitted inventory
  and selected price scope, and no market prices or appraisal results.
- The user's locally selected custom fifth-column region is not part of the
  share URL; opening the link keeps the recipient's local preference or uses
  the default region.
- Use a deterministic, versioned, lossless, URL-safe encoding in the URL
  fragment. Compress the UTF-8 inventory before Base64URL encoding it, omit
  Base64 padding, and encode the scope compactly. The exact compression
  implementation must be selected during implementation based on browser
  support, size, and testability.
- A lossless encoding is required: a short hash is not unique by itself, and
  resolving hashes would need a shared server-side lookup store. Do not use
  short codes, runtime memory, or add a persistence service. Do not retain
  submitted inventories on the server.
- Use one version character and one scope character after the fragment
  marker. Version `1` identifies the initial format; scope codes are `r`
  (Region), `s` (System), and `t` (Station). Thus the shape is
  `#1r<compressed-payload>`, `#1s<compressed-payload>`, or
  `#1t<compressed-payload>`.
- Self-contained links do not expire. They remain readable as long as a
  deployed app supports their format version.
- The same exact inventory text and scope produce the same fragment. Do not
  normalize whitespace or otherwise alter the restored input.
- The fragment is not sent in HTTP requests. It is still visible to anyone
  with the link and in browser history; it is not encryption or private
  storage.
- Keep the URL as short as practical without sacrificing lossless uniqueness.
  Verify encoding size for representative appraisals and the maximum accepted
  input. Never silently truncate inventory. If a valid input cannot be shared,
  preserve normal appraisal behavior and explain that a share link could not
  be created.
- The maximum decoded inventory is the existing 20,000-character appraisal
  limit; the existing 100-item limit still applies during appraisal.

## Appraisal and URL behavior

- After an appraisal is submitted, update the current URL fragment to represent
  the effective submitted inventory and selected scope. This includes the
  existing empty-submit sample behavior.
- Editing the textbox alone does not change the URL. Appraising the edited
  text updates it.
- Appraising the same exact text and scope again leaves the URL unchanged.
- Scope is part of the shared state. Changing scope and re-pricing the current
  text updates the URL to the new scope.
- Update the current history entry rather than adding one entry per appraisal.
- Opening a valid shared URL restores the exact inventory and scope, then
  immediately runs the appraisal using current ESI data and normal cache
  behavior.
- A shared URL takes precedence over locally restored appraisal text. A normal
  visit without a share fragment retains the existing local restoration
  behavior.
- No price, order, or history data is embedded in the URL or treated as
  authoritative when a shared link is opened.
- Do not add a database, Redis provider, other external storage, or Vercel
  runtime-memory lookup for share links.

## Invalid links and limits

- Validate the version, encoding, decoded text length, and scope before using
  shared state.
- For an unknown version, malformed payload, invalid scope, or oversized
  decoded inventory, show a clear share-link error and leave the normal app
  usable.
- Do not silently fall back to an old local appraisal or submit the sample
  inventory when a share fragment is present but invalid.
- Links must not bypass the existing appraisal input and item-count limits.

## Acceptance criteria

- [ ] A share URL uniquely and losslessly represents the exact inventory text
      and selected price scope in a self-contained fragment, without a
      server-side lookup or saved prices.
- [ ] The chosen encoding is deterministic, versioned, URL-safe, and tested
      for size against representative and maximum-length inputs; Base64URL
      padding is omitted and format version `1` uses the specified scope codes.
- [ ] Appraising changed text updates the fragment; editing without appraisal
      does not.
- [ ] Re-appraising unchanged text and scope leaves the URL unchanged.
- [ ] A scope change followed by its automatic re-appraisal updates the
      fragment to the selected scope.
- [ ] Opening a valid share link restores the inventory and scope and
      immediately appraises with current market data.
- [ ] A share link takes precedence over locally saved appraisal text; visits
      without a share link retain local restoration.
- [ ] Invalid and oversized links show an explicit error, do not submit sample
      text, and leave the app usable.
- [ ] No database, Redis provider, runtime-memory lookup, server-side
      inventory mapping, or price snapshot is stored.
- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass.
