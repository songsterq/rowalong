# Local macOS Packaging — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)
**Area:** Build tooling (`package.json`, `electron-builder.yml`, `vite.config.ts`,
`electron/app.cjs`, `build/` icon assets)

## Summary

Package RowAlong into a runnable macOS app (`RowAlong.app` + a `.dmg`) that the
user can build and run **locally** — no Apple Developer notarization. Uses
**electron-builder**. Includes the first real **app icon**, generated from the
RowAlong wave mark (the "Heat" gradient treatment).

## Decisions (from brainstorming)

- **Build tool:** electron-builder (vs electron-forge / raw packager) — standard,
  minimal config, produces `.app` + `.dmg` with an icon.
- **Identity:** `appId: com.endlessrainstudio.rowalong`, `productName: RowAlong`,
  author `Endless Rain Studio`.
- **Signing:** ad-hoc only (no Developer ID, no notarization). Enough to launch
  locally on Apple Silicon; not distributable to other machines without Gatekeeper
  friction (out of scope).
- **Targets:** `.dmg` (which also yields the unpacked `.app` for direct launch).
- **Icon:** treatment **C — Heat** (amber→orange→red gradient squircle, white wave
  mark).

## The blocker this fixes

Today `electron/app.cjs` loads both windows from the Vite **dev server**
(`http://localhost:5173`). A packaged app has no dev server, so it must load the
built HTML from disk. This is the central change; without it the packaged app
shows blank windows.

## Components & changes

### 1. `electron/app.cjs` — load from disk when packaged

Branch on `app.isPackaged`. Dev keeps the dev-server URLs; packaged loads the
built files bundled at `dist/` (packed into `app.asar`, reachable from
`__dirname/../dist`).

```js
const isDev = !app.isPackaged;
const DEV_URL = process.env.WH_DEV_URL || 'http://localhost:5173';

// dev → Vite dev server; packaged → built file in dist/ (inside app.asar).
function loadPage(win, page /* 'index' | 'overlay' */) {
  if (isDev) {
    win.loadURL(page === 'index' ? DEV_URL : `${DEV_URL}/${page}.html`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', `${page}.html`));
  }
}
```

- `createSetupWindow`: replace `setupWin.loadURL(DEV_URL)` → `loadPage(setupWin, 'index')`.
- `openOverlay`: replace `overlayWin.loadURL(\`${DEV_URL}/overlay.html\`)` →
  `loadPage(overlayWin, 'overlay')`.
- Everything else (panel overlay, float flags, IPC, bounds) is unchanged.

### 2. `vite.config.ts` — relative asset base for `file://`

Built HTML must reference assets relatively (default `/assets/...` resolves to the
filesystem root under `file://`). Switch base to `'./'` for the build only, via the
function config form:

```ts
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  // …existing server / build.rollupOptions / test config unchanged…
}));
```

(Both `index.html` and `overlay.html` sit at `dist/` root with assets in
`dist/assets/`, so relative `./assets/…` resolves correctly for each.)

### 3. `package.json`

- `main`: `index.js` → **`electron/app.cjs`** (the packager's entry point).
- `author`: `Endless Rain Studio` (electron-builder uses it for metadata).
- Add devDependency: `electron-builder`.
- Scripts:
  - `pack`: `npm run build && electron-builder` — build renderer, then package.
  - `pack:dir`: `npm run build && electron-builder --dir` — fast unpacked `.app`
    only (no dmg) for the local iterate loop.

### 4. `electron-builder.yml`

```yaml
appId: com.endlessrainstudio.rowalong
productName: RowAlong
directories:
  output: release
  buildResources: build
files:
  - dist/**
  - electron/**
  - package.json
mac:
  category: public.app-category.healthcare-fitness
  target: [dmg]
  icon: build/icon.icns
dmg:
  title: RowAlong
```

Notes:
- We have **no runtime dependencies** (all of `jsdom`/`vite`/`electron` etc. are
  devDependencies; `app.cjs` only requires Node builtins + local `.cjs`), so
  `node_modules` is not bundled — the app stays small.
- **Ad-hoc signing.** electron-builder re-signs the bundle on macOS; with no
  Developer ID it produces an **ad-hoc** signature, which is what lets the arm64
  app launch locally. The implementation step will verify the built `.app`
  actually opens; if a build ever yields an unsigned bundle that won't launch, the
  fallback is an explicit `codesign --force --deep --sign - <app>` post-step. No
  notarization either way.

### 5. Icon pipeline → `build/icon.icns`

Treatment **C (Heat)**, generated reproducibly (no external rasterizer dependency):

1. Render the icon into a 1024×1024 `<canvas>` (squircle clip + amber→orange→red
   gradient + the wave `Path2D` stroked white, with a small transparent margin and
   a soft shadow), export `toDataURL('image/png')` → `build/icon-1024.png`
   (transparent corners).
2. Native macOS conversion (always present — no Homebrew): `sips` resizes the
   master into the standard `.iconset` sizes (16–512 + @2x), then
   `iconutil -c icns` → `build/icon.icns`.

Committed: `build/icon-1024.png`, `build/icon.icns`, and `tools/make-icon.sh`
(re-runs steps 1–2 from the master PNG so the `.icns` is reproducible).

### 6. `.gitignore`

Add `release/` (electron-builder output). Keep `build/` **tracked** (it holds the
committed icon assets).

## Build & run flow

```bash
npm run pack          # → release/RowAlong-<ver>.dmg  and  release/mac*/RowAlong.app
open release/mac*/RowAlong.app    # run it directly
# or open the .dmg and drag to /Applications
```

## Testing / verification

- **Automated (unaffected):** `npm test` (122) + `npm run typecheck` stay green —
  no `src/` logic changes. `vite build` still emits `index.html` + `overlay.html`.
- **Manual (user-run, the real validation):**
  1. `npm run pack` completes; `release/` has the `.app` and `.dmg`.
  2. The `.app` **launches** (ad-hoc signature OK on Apple Silicon) and the setup
     window renders from the bundled `dist/` (not a dev server).
  3. Start a workout from the packaged app → overlay opens, still **floats over
     native fullscreen** (the panel behavior must survive packaging).
  4. The **Heat icon** shows in the Dock and in Finder/the dmg.
  5. Drag/resize/height-hug/click-to-pause still work; ⌘-Q quits.

## Risks

- **arm64 ad-hoc signing** — covered above (verify launch; explicit `codesign`
  fallback).
- **Prod file paths** — `loadFile(__dirname/../dist/…)` must resolve inside
  `app.asar`; verified by the manual launch.
- **`base: './'` + multi-page** — both pages load their hashed assets from
  `dist/assets/`; verified by the setup window and overlay rendering.

## Out of scope

- Notarization / Developer ID signing / distribution to other Macs.
- Auto-update, Windows/Linux builds, Mac App Store.
- A universal (x64+arm64) binary — local build targets the host arch only.
