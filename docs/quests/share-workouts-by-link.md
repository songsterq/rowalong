# Share workouts by link

A quest for songsterq/rowalong, approved by Song Qian on 2026-11-24. Its tasks are tracked in Minira.

## Why

Everything in RowAlong lives in one machine's localStorage, so there's no way to hand a friend a workout you like. A link they can open and import closes that gap, using only Cloudflare's free tier on the Worker that already serves the landing page.

## What

A Share button next to Save uploads the builder's workout (name + segments) to a share API added to the existing `rowalong` Worker. The Worker validates it strictly (known intensities, 5-second durations, size cap), stores it in Workers KV under a content-hashed id (same workout, same link, no second write; links never expire) and returns `<site>/w/<id>`, which the app copies to the clipboard. Opening the link shows a preview page (name, total time, intensity timeline, blocks) with an 'Open in RowAlong' button (a rowalong:// deep link the Mac app registers) and a download link. In the app, the deep link or a link pasted into a new Import box fetches the workout, saves it to Templates under the sharer's name and loads it into the builder. The site host is one constant. You do the one-time KV namespace setup from the steps in site/DEPLOY.md; the existing push-to-main build deploys.

## Done when

- [ ] `npm test` covers the share Worker: a valid workout returns an id; re-sharing the same workout returns the same id without a second KV write; invalid or oversized payloads get a 400 and store nothing; fetching an id returns the workout and an unknown id gets a 404.
- [ ] `npm test` covers the app side: importing a share link (fetch stubbed) adds a template with the sharer's name and loads its segments into the builder; a bad or unknown link shows an error and changes nothing.
- [ ] After the KV setup and a push to main, a person clicks Share in the app, opens the copied link in a browser, and sees the preview page with the workout's name, total time and blocks; the landing page still works as before.
- [ ] On a locally packed Mac build, 'Open in RowAlong' on that page opens the app with the workout saved in Templates and loaded in the builder; pasting the same link into Import under `npm run dev` does the same.

## Out of scope

- Accounts, or editing/deleting a link after it's made (links are snapshots)
- Rate limiting and link expiry
- Releasing v1.0.3 or updating the site's download links
- Sharing history records, prefs, or several workouts in one link; deep links on Windows/Linux

## Decisions

- **What can be shared?** The workout in the builder: one Share button next to Save _(recommended by Claude, accepted)_
- **How is the workout stored behind the link?** Workers KV: short link /w/<id> _(recommended by Claude, accepted)_
- **Where does the share API run?** Add a Worker script to the existing `rowalong` assets Worker _(recommended by Claude, accepted)_
- **Which host do share links use?** The landing page's current domain, kept as one constant so it's a one-line change (tell me the URL if you know it) _(recommended by Claude, accepted)_
- **How does the recipient import?** Both _(recommended by Claude, accepted)_
- **What happens on import?** Saved to Templates under the sharer's name and loaded into the builder _(recommended by Claude, accepted)_
- **How long do links last?** Forever _(recommended by Claude, accepted)_
- **How much abuse protection on the public share endpoint?** Strict validation + size cap + content-hashed ids _(recommended by Claude, accepted)_
- **Who does the Cloudflare setup?** The tasks write the code and the DEPLOY.md steps; you do the one-time KV setup _(recommended by Claude, accepted)_
- **The deep link needs a new Mac build (the rowalong:// protocol lives in the app bundle). Cut v1.0.3 as part of this quest?** No, release separately _(recommended by Claude, accepted)_

## Plan

1. **ROW-1 Shared-workout format, validation and link parsing**. Pure, unit-tested module in src/core/ (e.g. share.ts) that both the Worker and the app import. Defines the shared payload (version, name, segments of intensity + durationSec + optional label; no ids), strict validation (known intensities, positive 5-second-multiple durations, segment-count / name-length / byte-size caps), canonical serialization and a content-hashed short id (SHA-256 of the canonical form, URL-safe, ~10 chars), and parseShareLink() that pulls the id out of `<site>/w/<id>`, `rowalong://w/<id>` or a bare id. Holds the single SHARE_BASE_URL constant (the landing page's domain). Converting to/from app Segments re-ids on load. TDD with Vitest.
2. **ROW-2 Share API on the rowalong Worker with Workers KV** (after ROW-1). Turn the assets-only `rowalong` Worker into assets + script: add `main` (e.g. worker/index.ts), a KV binding and run_worker_first for /api/* and /w/* in the root wrangler.jsonc (keep the root-config gotcha in its comment). POST /api/w validates with share-core, computes the content id, writes to KV only if absent (no expiry) and returns {id, url}; GET /api/w/<id> returns the JSON or 404; CORS open for the app (file:// origin is null) with OPTIONS preflight. Everything else falls through to the static site. Add wrangler + workers types as dev deps and a tsconfig so `npm run typecheck` covers the worker. Unit tests against a fake KV cover the spec's check 1. Document the one-time `wrangler kv namespace create` + paste-the-id step in site/DEPLOY.md.
3. **ROW-3 Share preview page at /w/<id>** (after ROW-2). The Worker renders an HTML page for /w/<id>: workout name, total time, an intensity timeline (INTENSITY_META colors) and the block list, an 'Open in RowAlong' button linking rowalong://w/<id>, a 'Download RowAlong' link to the current DMG, and a friendly not-found page for unknown ids. Styled to match site/ (reuse site/styles.css), with the name HTML-escaped. Unit tests on the rendered HTML (contents, escaping, 404).
4. **ROW-4 Share button and Import box on the setup page** (after ROW-1). A small share client (injectable fetch, base URL from share-core) plus UI in setupView: a Share button next to Save that posts the builder's workout (name from the name field or the current program name), copies the returned link to the clipboard and shows it, with a clear error on failure; an Import box in the Templates panel that takes a pasted link, fetches the workout, saves it to Templates under the sharer's name and loads it into the builder, and shows an error for a bad or unknown link without changing anything. Expose the import path as a function the Electron deep link can call. Tests with fetch stubbed cover the spec's check 2. Write CSS comments without backticks (SETUP_CSS is a template literal).
5. **ROW-5 rowalong:// deep link in the Mac app** (after ROW-4). Register the rowalong protocol: `protocols` in electron-builder.yml and app.setAsDefaultProtocolClient in electron/app.cjs. Handle `open-url` on macOS, including a cold start before the setup window has loaded (queue the link) and a single-instance lock so a second launch hands the link to the running app. Forward the id to the setup window over a new preload bridge method (typed in src/electron.d.ts), where it runs the app-share-import import path and focuses the window. Verify by hand with `npm run pack:dir` (spec check 4) and note the steps in the PR.
