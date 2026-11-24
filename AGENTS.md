# Workout Helper

A local web app that runs interval **rowing** workouts and shows a floating,
always-on-top overlay (intensity, recommended stroke rate, countdown, tone cues)
that rides over any video — browser **and** native macOS fullscreen apps.

## Commands

```bash
npm run dev            # Browser version (open in Chrome). Overlay via Document PiP.
npm run electron:dev   # Electron app. Overlay floats over native-app fullscreen too.
npm test               # Vitest, run once
npm run test:watch     # Vitest, watch
npm run typecheck      # tsc --noEmit
npm run build          # Vite multi-page build (index.html + overlay.html)
npm run harness        # Render the real overlay to .harness/overlay.html (visual dev tool)
npm run spike:electron # Standalone Electron overlay spike (manual)
npx wrangler dev       # The `rowalong` Worker (site + share API) on :8787, local KV
npx wrangler deploy --dry-run   # Check the Worker bundles, without deploying
```

Share round trip against a local Worker: run `npx wrangler dev`, then
`VITE_SHARE_BASE_URL=http://localhost:8787 npm run dev`. wrangler needs
**Node 22+**. Deploy, the KV namespace and the free-tier limits: `site/DEPLOY.md`. With both
running, `node tools/share-roundtrip.mjs` drives Share → preview → Import in
headless Chromium (needs `playwright-core` installed outside the repo; see the
file header).

Run a single test file: `npx vitest run tests/<name>.test.ts`.

**Overlay visual harness** (`npm run harness`, source in `tools/`): renders the
**real** overlay — the exact `OVERLAY_CSS` + the DOM `mountOverlay` produces — for
every density / intensity / status into a single self-contained
`.harness/overlay.html` (gitignored). Open it in any browser over `file://`
(jsdom can't run the CSS animation; a real browser can). A control bar freezes the
stroke animation at catch / drive / finish / recovery or scrubs it, so layout
checks and screenshots are deterministic. It runs under Vitest only to borrow the
jsdom env + TS transpile; it has its own config so it's excluded from `npm test`,
and lives in `tools/` so `tsc` ignores it.

## Architecture

The overlay is the **same web UI** everywhere; only *how its floating window is
created* differs (the "shell seam"). Core logic is framework-agnostic and fully
unit-tested; browser-API / Electron wrappers are thin and verified manually.

- `src/core/` — pure, unit-tested:
  - `types.ts` — `Intensity`, `Segment`, `Template`, and `INTENSITY_META` (color +
    recommended spm + work/rest per intensity).
  - `random.ts` — seeded PRNG (mulberry32) for reproducible generation.
  - `generator.ts` — `generate(totalMin, opts?, seed?)` → `Segment[]`.
  - `sessionEngine.ts` — runtime: injectable `Clock`, `tick()`, events
    (`tick`/`transition`/`countdown`/`complete`), `start/pause/resume/skip*/stop`.
  - `storage.ts` — templates + prefs over an injectable `KeyValueStore`
    (defaults to `localStorage`).
  - `audio.ts` — pure tone-decision fns + `TonePlayer` (Web Audio, no assets).
  - `starters.ts` — built-in templates.
  - `history.ts` — local-date bucketing (`dayKey`), heatmap cells, and streak /
    weekly / all-time stats over `SessionRecord[]`.
  - `sessionRecorder.ts` — `createRecorder(storage, ctx)`: write-once
    `finish(elapsedSec, completed)` that turns a run into a `SessionRecord`.
  - `share.ts` — the share-a-workout format (`SharedWorkout` = `{ v: 1, name,
    segments }`, no ids), `validateSharedWorkout` (the one validator, used by
    **both** the Worker and the app), link/id helpers (`parseShareUrl`,
    `generateShareId`, `shareUrl`), and the client `createShare`/`fetchShare`
    over an injectable `fetch` that throws `ShareError` with a `kind`.
- `src/ui/` — DOM:
  - `overlayView.ts` — the floating widget; **injects its own CSS** so it works in
    any host document; pill/coach density toggle; click-to-pause; controls.
  - `segmentEditor.ts`, `setupView.ts` — the setup page, including **Share**
    (posts the editor's workout, shows the link) and **Import** (paste a link or
    id → saved as a template and loaded into the editor).
  - `historyPanel.ts` — `renderHistory`: streak/week/total stat tiles, the
    13-week heatmap, and the last-3-sessions list with `onPick` to reload one.
- `src/shell/` — `overlayHost.ts` (`OverlayHost` interface + `isPipSupported`),
  `pipOverlayHost.ts` (browser Document Picture-in-Picture).
- `src/main.ts` — setup-page entry. On Start: if `window.electronAPI` → hand off to
  Electron; else open a PiP overlay (or an in-page fallback for non-Chrome).
- `src/overlay-entry.ts` + `overlay.html` — the **Electron overlay window**; it
  owns the running session (engine + tones + overlay + tick loop).
- `electron/` — `app.cjs` (main process: setup + overlay windows), `preload.cjs`
  (`window.electronAPI` bridge, typed in `src/electron.d.ts`), `main.cjs` (spike).
- `src/shareConfig.ts` — `SHARE_BASE_URL`, where Share/Import talk to
  (production `https://rowalong.endlessrainstudio.com`; `VITE_SHARE_BASE_URL`
  overrides it, inlined at build time).
- `worker/` + root `wrangler.jsonc` — the `rowalong` Cloudflare Worker. `site/`
  (the landing page) is static assets; the script runs only for `/api/*` and
  `/w/*` (`assets.run_worker_first`). `handler.ts`: `POST /api/workouts`
  (validate → KV `w:<id>` → `201 {id, url}`, per-IP rate limit → 429),
  `GET /api/workouts/:id` (JSON, 404 if unknown), `GET /w/:id` (HTML preview).
  `preview.ts` renders that page. `index.ts` is only the default export.
  Bindings: KV `SHARES`, rate limiter `CREATE_LIMITER`, `ASSETS`. Tests:
  `tests/worker.test.ts`, `tests/preview.test.ts` with fake bindings.

**Share flow:** Share → `POST {base}/api/workouts` → link `{base}/w/<id>`. In a
browser the link shows the preview page; pasted into Import, the app calls
`GET {base}/api/workouts/<id>` and `fromSharedWorkout` re-ids it into a
`Template`. Links are permanent and immutable; there are no accounts.

**Two host paths:**
- **Browser** → Document PiP. Floats over *browser* video only.
- **Electron** → a native always-on-top window. Floats over *native-app*
  fullscreen too. The setup window hands `{ segments, prefs }` to the main process
  via IPC; the overlay window runs the whole session itself.

## Conventions

- Vanilla TypeScript + Vite, no UI framework. Vitest runs in `jsdom`; tests
  `import { ... } from 'vitest'` (no globals). Build features test-first (TDD).
- The all-out spm label is `'30–32'` with an **EN DASH** (U+2013) — `INTENSITY_META`
  and tests assert the exact character. Don't replace it with a hyphen.

## Gotchas (non-obvious — read before changing the shell or generator)

- **macOS over-fullscreen uses a panel window.** The Electron overlay floats over
  *another app's* native fullscreen (e.g. Apple TV.app) by being a **non-activating
  `NSPanel`**: `electron/app.cjs` creates the overlay `BrowserWindow` with
  `type: 'panel'` and keeps `setAlwaysOnTop(true, 'screen-saver')` +
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true,
  skipTransformProcessType: true })`. The panel floats independent of
  Dock/accessory status, so the app runs as a **normal Dock (Regular) app** — no
  `app.dock.hide()`. **History (don't repeat):** an earlier Dock-icon attempt that
  kept a *normal window* and relied on Electron's activation-policy transform
  (omitting `skipTransformProcessType`) **failed to float over Apple TV** and was
  reverted; the panel is what lets the Dock icon and the float coexist. Verified
  on macOS over Apple TV native fullscreen. (Spec §16 + the 2026-06-06
  dock-icon-panel-overlay design.)
- **Document PiP cannot cross into native-app fullscreen** (browser video only) —
  that limitation is the entire reason the Electron shell exists.
- **`generator.ts` and `pushStyles.ts` work in 5-second units**, so every duration
  is a multiple of 5. A workout is a fixed skeleton — warm-up (easy→medium) →
  repeated 7-min pushes separated by 3-min bridges → easy cool-down — supporting
  only 10/20/30 min (1/2/3 pushes). Any leftover *inside a push* becomes the leading
  medium "build"; unsupported totals snap to the nearest of 10/20/30. Keep new
  generator logic in units.
- **`sessionEngine` is driven by `tick()`** off an injectable `Clock`
  (`performance.now()` in prod, a `FakeClock` in tests). `stop()` ends *without* a
  `complete` event; natural end-of-workout fires `complete`.
- **Generator segment ids are deterministic** (`seg-${seed}-${idx}`, not
  `crypto.randomUUID()`) so determinism tests pass; consumers re-id on load.
- **Two HTML entries** (`index.html`, `overlay.html`) are registered in
  `vite.config.ts` `rollupOptions.input`; the dev server is pinned to port 5173
  (`strictPort`) because `electron/app.cjs` hardcodes that URL.
- **`SETUP_CSS` / `OVERLAY_CSS` are template literals**, so a backtick or a `${`
  inside a CSS comment silently ends the string and turns the rest of the
  stylesheet into code. The failure surfaces as a nonsense `tsc` error pointing
  at a CSS token (e.g. `Cannot find name 'root'`) plus a chunk of the suite
  failing to import — not as a style bug. Write CSS comments without backticks.
- **Vitest is pinned to `TZ=America/Los_Angeles`** (`vite.config.ts`, `test.env`)
  for *all* test files, not just history ones — `history.ts`'s day bucketing
  (`dayKey`) is local-date based, so running under a UTC CI runner would silently
  pass while breaking for anyone west of UTC.
- **The Electron overlay window owns the session record.** It calls
  `sessionRecorder.finish()`, not the setup window, so the setup window's history
  panel depends on cross-renderer `localStorage` propagation (the `storage`
  event) rather than reading its own write. Because the overlay renderer can be
  torn down without warning — the setup window's Stop button, Cmd-W, or app quit
  all close it without going through the engine's `complete` event or the
  overlay's own stop handler — `overlay-entry.ts` also records on the window's
  `pagehide` event, guarded by the recorder's write-once `finish()`.
- **`src/core/share.ts` is shared with the Worker.** `worker/handler.ts` imports
  its validator and id helpers, and `worker/preview.ts` imports `src/ui/format.ts`,
  so wrangler bundles them into the Worker. Keep both DOM-free and free of Vite-
  or Node-only APIs (`import.meta.env`, `node:*`); app-only config belongs in
  `src/shareConfig.ts`. One validator means the client and server can't drift —
  don't add a second copy of the rules in `worker/`.
- **Tightening `validateSharedWorkout` breaks old links.** Stored workouts are
  re-validated on the way out: the preview page 404s an entry that no longer
  passes, and `fetchShare` rejects it on import. Links are permanent, so only
  loosen the rules; anything stricter needs a new `v`, with v1 still accepted.
  Also store the validator's normalized `value`, never the raw request body.
- **`worker/index.ts` may only have a default export.** workerd treats every
  named export of the entry module as an entrypoint and refuses to start; a
  test checks it. Put logic and constants in `worker/handler.ts`.
- **Every `/api` response needs `Access-Control-Allow-Origin: *`, errors
  included**, plus the 204 `OPTIONS` preflight (JSON POSTs trigger one). The app
  calls cross-origin from `http://localhost:5173` and, packaged, from `file://`
  (Origin `null`); Electron keeps `webSecurity` on. Without the header the app
  sees a 400/404/429 as a network failure ("check your connection").
- **Keep `run_worker_first` to `/api/*` and `/w/*`.** Static asset requests are
  free and unmetered; routing more through the script costs free-tier requests
  and bypasses `site/_headers` (the preview sets its own CSP and security
  headers for that reason).
- **The share host is baked in at build time.** `VITE_SHARE_BASE_URL` is
  inlined by Vite, so a DMG built with it set talks to that host forever. And
  `parseShareUrl` accepts a `/w/:id` link on *any* host but `fetchShare` always
  fetches from `SHARE_BASE_URL`: a `localhost:8787` link pasted into a
  production build is "not found", not a cross-host import.
- **Shared names come from strangers.** Escape them wherever they are rendered
  (the setup template list and the preview page both do).

## Reference

- Design spec: `docs/superpowers/specs/2026-06-05-workout-helper-design.md` (§16 =
  Electron/gate addendum).
- Implementation plan: `docs/superpowers/plans/2026-06-05-workout-helper.md`.
- Share workouts by link: `docs/quests/share-workouts-by-link.md`; deploy, KV
  namespace and free-tier limits: `site/DEPLOY.md`.
