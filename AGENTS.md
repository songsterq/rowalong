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
npm run typecheck      # tsc --noEmit, for the app and then the Worker (worker/tsconfig.json)
npm run build          # Vite multi-page build (index.html + overlay.html)
npm run harness        # Render the real overlay to .harness/overlay.html (visual dev tool)
npm run spike:electron # Standalone Electron overlay spike (manual)
npm run worker:dev     # The site + share-API Worker locally (wrangler dev, :8787, local KV)
```

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
  - `share.ts` — share-by-link core, imported by both the app and the share
    Worker: the `SharedWorkout` payload (no ids), strict validation + caps,
    canonical JSON, the content-hashed id (`shareIdFor`, SHA-256 → 10 base64url
    chars), `parseShareLink`, and the single `SHARE_BASE_URL`. The id hashes the
    canonical form, so changing `serializeSharedWorkout` or the normalization in
    `validateSharedWorkout` changes the id of every workout shared afterwards
    (old links still resolve, but re-sharing no longer dedups); a golden-id test
    guards it.
  - `shareClient.ts` — `createShareClient({ fetch?, baseUrl? })`: `share()` validates
    locally then POSTs, `fetchShared(link)` parses a link / deep link / bare id
    and GETs + re-validates. Returns `{ ok, error }` with user-facing messages;
    never throws. Tests inject a stub `fetch`.
- `src/ui/` — DOM:
  - `overlayView.ts` — the floating widget; **injects its own CSS** so it works in
    any host document; pill/coach density toggle; click-to-pause; controls.
  - `segmentEditor.ts`, `setupView.ts` — the setup page, including the Share
    button and the Templates panel's Import box. `mountSetup` returns
    `importShareLink(linkOrId)`, the one import path (the Electron deep link
    calls it too); an import is saved as template id `shared-<id>`, so
    re-importing replaces it.
  - `historyPanel.ts` — `renderHistory`: streak/week/total stat tiles, the
    13-week heatmap, and the last-3-sessions list with `onPick` to reload one.
- `src/shell/` — `overlayHost.ts` (`OverlayHost` interface + `isPipSupported`),
  `pipOverlayHost.ts` (browser Document Picture-in-Picture).
- `src/main.ts` — setup-page entry. On Start: if `window.electronAPI` → hand off to
  Electron; else open a PiP overlay (or an in-page fallback for non-Chrome).
- `src/overlay-entry.ts` + `overlay.html` — the **Electron overlay window**; it
  owns the running session (engine + tones + overlay + tick loop).
- `electron/` — `app.cjs` (main process: setup + overlay windows, rowalong://
  deep links, single-instance lock), `preload.cjs` (`window.electronAPI` bridge,
  typed in `src/electron.d.ts`), `deepLink.cjs` and `windowBounds.cjs` (pure,
  unit-tested helpers with `.d.cts` typings), `main.cjs` (spike).
- `worker/` — the `rowalong` Cloudflare Worker (`main` in the root `wrangler.jsonc`)
  that serves `site/` and the share API. `handler.ts` holds the routing and
  `POST /api/w` / `GET /api/w/<id>` over structural `ShareStore` (KV) and
  `AssetsFetcher` bindings, so tests use fakes; `index.ts` only binds it to the
  real `KVNamespace`/`Fetcher`. `previewPage.ts` renders the HTML for
  `GET /w/<id>` (the preview, or a friendly 404), styled by `site/styles.css`'s
  last section; its `DOWNLOAD_URL` must match `site/index.html`'s DMG hrefs, and
  every class it uses must exist in `styles.css` (tests check both). Deploy +
  one-time KV setup: `site/DEPLOY.md`.

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
- **The Worker typechecks against the Workers types, not the DOM.** The two
  declare the same globals differently, so `worker/` has its own tsconfig (run
  by `npm run typecheck`). Code shared with the app (`src/core/share.ts`,
  `src/ui/format.ts`, which the preview page uses, so it must stay DOM-free) and
  `worker/handler.ts` must compile under both, so only `worker/index.ts` may name
  Workers-only types (`KVNamespace`, `ExportedHandler`, ...); tests import
  `handler.ts`, never `index.ts`, and run in Vitest's `node` environment
  (`sharePreview.test.ts` stays on jsdom only to parse the page with DOMParser).
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
- **rowalong:// deep links only work in a packed build.** The scheme is declared
  in the bundle's Info.plist (`protocols` in `electron-builder.yml`), and
  `app.cjs` calls `setAsDefaultProtocolClient` only when `app.isPackaged`: under
  `electron:dev` the running bundle is the stock Electron.app, and claiming the
  scheme for it would send real links to a bare Electron window. In dev, pass the
  link on the command line instead (`npx electron electron/app.cjs
  rowalong://w/<id>` with Vite running). A cold start's `open-url` fires before
  `ready`, so that listener stays registered at startup, and links wait in
  `deepLink.cjs`'s queue until the setup page calls `onOpenShareLink` (which sends
  `share-link-ready`). Main forwards the raw link; `importShareLink` parses it.
  To check by hand: quit every RowAlong (a running copy with the same bundle id,
  such as an installed v1.0.2, gets the link and ignores it), `npm run pack:dir`,
  launch `release/mac-arm64/RowAlong.app` once so Launch Services registers it,
  quit it, then `open 'rowalong://w/<id>'` for a cold start and again with the
  app running.

## Reference

- Design spec: `docs/superpowers/specs/2026-06-05-workout-helper-design.md` (§16 =
  Electron/gate addendum).
- Implementation plan: `docs/superpowers/plans/2026-06-05-workout-helper.md`.
