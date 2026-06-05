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
npm run spike:electron # Standalone Electron overlay spike (manual)
```

Run a single test file: `npx vitest run tests/<name>.test.ts`.

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
- `src/ui/` — DOM:
  - `overlayView.ts` — the floating widget; **injects its own CSS** so it works in
    any host document; pill/coach density toggle; click-to-pause; controls.
  - `segmentEditor.ts`, `setupView.ts` — the setup page.
- `src/shell/` — `overlayHost.ts` (`OverlayHost` interface + `isPipSupported`),
  `pipOverlayHost.ts` (browser Document Picture-in-Picture).
- `src/main.ts` — setup-page entry. On Start: if `window.electronAPI` → hand off to
  Electron; else open a PiP overlay (or an in-page fallback for non-Chrome).
- `src/overlay-entry.ts` + `overlay.html` — the **Electron overlay window**; it
  owns the running session (engine + tones + overlay + tick loop).
- `electron/` — `app.cjs` (main process: setup + overlay windows), `preload.cjs`
  (`window.electronAPI` bridge, typed in `src/electron.d.ts`), `main.cjs` (spike).

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

- **macOS over-fullscreen needs an accessory app.** The Electron overlay only
  floats over *another app's* native fullscreen (e.g. Apple TV.app) when the app
  runs as a **dock-less accessory** process: `electron/app.cjs` calls
  `app.dock.hide()` and the overlay uses `setVisibleOnAllWorkspaces(true, {
  visibleOnFullScreen: true, skipTransformProcessType: true })`. A normal
  Dock-icon variant (using Electron's activation-policy transform) was tried and
  **failed to float over Apple TV in practice**. So there is intentionally **no
  Dock icon** — do not "fix" that by removing `app.dock.hide()`. (Spec §16.) If a
  Dock icon ever becomes a hard requirement, the path is a native Swift
  non-activating `NSPanel`.
- **Document PiP cannot cross into native-app fullscreen** (browser video only) —
  that limitation is the entire reason the Electron shell exists.
- **`generator.ts` works in 5-second units**, so every duration is a multiple of 5
  and the total stays exact (leftover is folded into the easy cooldown). Keep new
  generator logic in units.
- **`sessionEngine` is driven by `tick()`** off an injectable `Clock`
  (`performance.now()` in prod, a `FakeClock` in tests). `stop()` ends *without* a
  `complete` event; natural end-of-workout fires `complete`.
- **Generator segment ids are deterministic** (`seg-${seed}-${idx}`, not
  `crypto.randomUUID()`) so determinism tests pass; consumers re-id on load.
- **Two HTML entries** (`index.html`, `overlay.html`) are registered in
  `vite.config.ts` `rollupOptions.input`; the dev server is pinned to port 5173
  (`strictPort`) because `electron/app.cjs` hardcodes that URL.

## Reference

- Design spec: `docs/superpowers/specs/2026-06-05-workout-helper-design.md` (§16 =
  Electron/gate addendum).
- Implementation plan: `docs/superpowers/plans/2026-06-05-workout-helper.md`.
