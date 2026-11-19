# Phase 5 - Deploy and tagged release

Status: accepted (2026-11-19)

Goal: put the site on the public internet and tag exactly the commit that is
running there. A release is a deploy, not a commit.

## Scope

In: production build settings, the platform time limit for a server action,
the first Vercel deployment, a browser check against the deployed URL, tag
`v0.1.0` plus ASCII release notes, README/spec updates.

Out: custom domain, analytics, monitoring/alerting, paid plan features, a
second environment (staging). Those can be their own phases if they earn it.

## Decisions

- **Vercel, default region.** The app is a Next.js server-action page with no
  static assets to speak of; Vercel needs no extra config. Pinning a function
  region near CCP is possible later; the default is measurable and reversible.
- **No `vercel.json`.** Everything needed is in `next.config.ts` and the route
  segment config. An empty platform file would only be something to keep in
  sync.
- **`maxDuration = 60` on the page that owns the action.** A cold appraisal of
  a large paste can spend tens of seconds on ESI paging; the platform default
  would cut it off with an opaque error. 60 seconds is the ceiling the free
  plan allows, so this is "as much as we are given", not a target.
- **The in-process cache is per instance.** Vercel may run several instances
  of the server function, so the phase 3 cache is not globally shared. This is
  recorded as a known limitation rather than papered over: each instance
  respects `Expires`, so extra fetches cost budget, not correctness.
- **Tag only after the deployed URL is verified.** `v0.1.0` will point at the
  commit that was deployed and checked, not at a later doc-only commit.

## Acceptance criteria

- [ ] `npm run build` passes with the production settings and `npm start`
      serves the page locally.
- [ ] The page that hosts the server action sets `maxDuration = 60`, with a
      one-line reason in the code.
- [ ] The site is deployed on Vercel and loads over HTTPS.
- [ ] A real appraisal on the deployed URL returns the five-hub buy/sell table
      with totals, and the station/system toggle still changes prices.
- [ ] The browser network log for that page shows no request to
      `esi.evetech.net`: all ESI traffic is server-side in production too.
- [ ] `package.json` declares the Node version the build actually needs.
- [ ] Tag `v0.1.0` points at the deployed commit; the GitHub release notes are
      ASCII-only, name the live URL, and state what was verified.
- [ ] `docs/spec/intent.md` milestone row is `done` and `README.md` links the
      live site.

## Verification notes

(fill in after the deploy)
