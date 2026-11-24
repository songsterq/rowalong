# Share workouts by link

A quest for songsterq/rowalong, approved by Song Qian on 2026-11-24. Its tasks are tracked in Minira.

## Why

Rowers want to send a workout they like to a friend, or move it to another machine. Today a workout only exists in one machine's localStorage, so there's no way to pass it on.

## What

A Share button on the setup page publishes the workout currently in the editor (name + segments) to the existing `rowalong` Cloudflare Worker, which stores it in Workers KV under a short ID and returns a link. Opening the link in a browser shows a small preview page (name, total time, intensity timeline, how to import, download button). Pasting the link into a new Import box on the setup page fetches the JSON, saves it as a template and loads it into the editor. This works the same in the browser and Electron builds. Links are permanent and can't be changed, there are no accounts, and the Worker validates every payload (known intensities, durations in 5-second steps, size cap about 8 KB) and rate-limits link creation per IP. Everything stays on the free tier.

## Done when

- [ ] In the app, clicking Share on a workout gives a link; opening it in a browser shows that workout's name, total time and intensity timeline.
- [ ] Pasting that link into Import on another machine/profile (browser or Electron build) creates a template with the same name and segments and loads it into the editor.
- [ ] Worker tests show that invalid payloads (unknown intensity, durations not in 5-second steps, oversized) and too-frequent creates are rejected, and that an unknown ID returns 404.
- [ ] `npm test` and `npm run typecheck` pass, and the landing site still deploys and serves as before.

## Out of scope

- rowalong:// deep links that open the Electron app
- Accounts, editing or deleting shared links, link expiry
- Sharing session history records

## Decisions

- **What can be shared?** Whatever workout is in the setup editor right now (name + segments) — covers saved templates, generated workouts and history picks _(recommended by Claude, accepted)_
- **Where do shared workouts live on Cloudflare?** Workers KV, served by the existing `rowalong` Worker (add a `main` script alongside the site assets) _(recommended by Claude, accepted)_
- **How does a user import a link?** Paste the URL into an Import box on the setup page _(recommended by Claude, accepted)_
- **What does the share URL show when opened in a normal browser?** A small preview page (name, total time, intensity timeline) with 'copy link / import in RowAlong' instructions and the download button _(recommended by Claude, accepted)_
- **What happens on import?** It's saved as a template (with its shared name) and loaded into the editor _(recommended by Claude, accepted)_
- **Link lifetime and abuse limits?** Permanent, immutable links; no accounts; server validates the payload (known intensities, 5-second multiples, size cap ~8 KB) and rate-limits creates per IP _(recommended by Claude, accepted)_

## Plan

1. **ROW-1 Shared workout format, validator and client**. Add a pure, unit-tested src/core/share.ts: the SharedWorkout payload type ({ v: 1, name, segments } with Template minus ids), validateSharedWorkout() (known intensities, positive durations in 5-second steps, sane name length and segment count, serialized size cap of about 8 KB), parseShareUrl() (accepts the full /w/:id link or a bare ID, rejects anything else), and createShare()/fetchShare() over an injectable fetch and base URL. The Worker and the app must both import this validator so the rules can't drift. Import re-IDs segments with makeId(). TDD with Vitest; no UI.
2. **ROW-2 Worker API on KV with validation and rate limit** (after ROW-1). Give the existing `rowalong` Worker a `main` script (keep assets serving site/ unchanged; route /api/* and /w/* to the script first, for example with assets.run_worker_first) plus a KV namespace binding in wrangler.jsonc. POST /api/workouts validates via share-core's validator, stores under a short random ID (base62, 8 chars, retry on collision) and returns { id, url }. GET /api/workouts/:id returns the JSON with CORS headers, which the Electron and localhost dev origins need. Unknown ID → 404, invalid → 400, oversized → 413. Rate-limit creates per IP (CF-Connecting-IP; KV counter with TTL or the Workers rate-limit binding), returning 429. Unit-test the handler with a fake KV, kept free-tier only. Add wrangler as a devDependency if it's needed, and keep `tsc` and `npm test` passing (a separate tsconfig for the worker is fine).
3. **ROW-3 Browser preview page for share links** (after ROW-2). GET /w/:id renders a self-contained HTML page styled like site/ (reuse site/styles.css): workout name, total time, an intensity timeline bar using the INTENSITY_META colors, the segment list, a 'Copy link' button, short 'paste this link into Import in RowAlong' steps and the existing download button URL. Escape the name (it's user input). 404 page for an unknown ID. Tests for rendering and escaping.
4. **ROW-4 Share and Import on the setup page** (after ROW-1). In setupView.ts add a Share button that posts the workout currently in the editor (name + segments via readEditor) through share-core's client, then shows the link with a Copy button. Add an Import box that takes a pasted link or ID, fetches it, saves it as a template with its shared name and loads it into the editor. Show clear errors for a bad link, not found, rate-limited and offline. The base URL is a single constant (the production Worker host), overridable in dev. Both the browser and Electron builds must work; check that Electron's CSP/webPreferences allow the fetch. TDD with jsdom and a fake fetch, matching existing setupView tests. CSS comments in SETUP_CSS must not contain backticks.
5. **ROW-5 Deploy docs and end-to-end check** (after ROW-2, ROW-3, ROW-4). Update site/DEPLOY.md with how to create the KV namespace, put its ID in wrangler.jsonc, and keep the deploy on the free tier. Add the share feature to AGENTS.md (architecture + any gotchas, e.g. the validator is shared between the Worker and the app) and README. Run `wrangler dev` locally and do the share → preview → import round-trip against it from `npm run dev`; record the steps and the result in the PR.
