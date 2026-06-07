# Local macOS Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build RowAlong into a runnable, ad-hoc-signed macOS `.app` + `.dmg` locally (no notarization), with a real Heat-gradient app icon generated from the wave mark.

**Architecture:** Three pieces — (1) make `electron/app.cjs` load the built `dist/` from disk when packaged (today it only loads the Vite dev server) plus Vite `base:'./'`; (2) generate `build/icon.icns` from the wave mark with native macOS tools; (3) add electron-builder config + scripts.

**Tech Stack:** Electron 42, electron-builder, Vite 8, native macOS `sips`/`iconutil`. CommonJS main process.

**Spec:** `docs/superpowers/specs/2026-06-06-local-packaging-design.md`

> **Branch:** this work is on `feat/local-packaging`, stacked on `feat/dock-icon-panel-overlay` (PR #9). It should merge after #9.
>
> **No unit tests:** there is no pure logic here — it's build config + an Electron load path whose payoff is observable only by building and launching. Automatable steps are regression guards (existing suite, typecheck, build-output checks); Task 4 is the user-run launch gate.

---

### Task 1: Load the built app from disk when packaged

**Files:**
- Modify: `electron/app.cjs` (`DEV_URL` ~line 19; `createSetupWindow` ~line 65; `openOverlay` ~line 115)
- Modify: `vite.config.ts`
- Modify: `package.json` (`main`)

- [ ] **Step 1: Add a dev/prod page loader in `app.cjs`**

Find the line:

```js
const DEV_URL = process.env.WH_DEV_URL || 'http://localhost:5173';
```

Replace it with:

```js
const DEV_URL = process.env.WH_DEV_URL || 'http://localhost:5173';
const isDev = !app.isPackaged;

// In dev, load from the Vite dev server; when packaged, load the built page from
// dist/ (bundled into app.asar, reachable from electron/.. → dist).
function loadPage(win, page /* 'index' | 'overlay' */) {
  if (isDev) {
    win.loadURL(page === 'index' ? DEV_URL : `${DEV_URL}/${page}.html`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', `${page}.html`));
  }
}
```

- [ ] **Step 2: Use it for the setup window**

In `createSetupWindow()`, replace:

```js
  setupWin.loadURL(DEV_URL);
```

with:

```js
  loadPage(setupWin, 'index');
```

- [ ] **Step 3: Use it for the overlay window**

In `openOverlay()`, replace:

```js
  overlayWin.loadURL(`${DEV_URL}/overlay.html`);
```

with:

```js
  loadPage(overlayWin, 'overlay');
```

- [ ] **Step 4: Relative asset base in Vite (for `file://`)**

Edit `vite.config.ts`. Change the config to the function form so the build uses a relative base (dev keeps `/`). Replace:

```ts
export default defineConfig({
  // Fixed port so the Electron main process can rely on the dev server URL.
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: r('./index.html'),
        overlay: r('./overlay.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
```

with:

```ts
export default defineConfig(({ command }) => ({
  // Built pages load over file:// in the packaged app, so assets must be
  // referenced relatively; the dev server keeps the absolute root base.
  base: command === 'build' ? './' : '/',
  // Fixed port so the Electron main process can rely on the dev server URL.
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: r('./index.html'),
        overlay: r('./overlay.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
}));
```

- [ ] **Step 5: Point `package.json` `main` at the Electron entry**

In `package.json`, change:

```json
  "main": "index.js",
```

to:

```json
  "main": "electron/app.cjs",
```

- [ ] **Step 6: Verify — syntax, build output, regression**

```bash
node -c electron/app.cjs                       # parses, exit 0
npm run build                                  # emits dist/index.html + dist/overlay.html
grep -o '\(src\|href\)="\./assets/[^"]*"' dist/index.html | head    # relative ./assets paths
grep -o '\(src\|href\)="\./assets/[^"]*"' dist/overlay.html | head
npm test                                       # Tests 122 passed
npm run typecheck                              # clean
```

Expected: both `grep`s print `./assets/...` matches (proves `base:'./'` took effect — **not** absolute `/assets/`); 122 tests pass; typecheck clean. (Dev path unchanged; `npm run electron:dev` still loads from the dev server.)

- [ ] **Step 7: Commit**

```bash
git add electron/app.cjs vite.config.ts package.json
git commit -m "feat(electron): load built dist from disk when packaged

Branch window loading on app.isPackaged (dev server vs loadFile dist/), set
Vite base to './' for the build so file:// assets resolve, and point
package.json main at electron/app.cjs."
```

---

### Task 2: Generate the app icon (`build/icon.icns`)

**Files:**
- Create: `build/icon-1024.png` (master, generated)
- Create: `build/icon.icns` (generated by the script)
- Create: `tools/make-icon.sh`

- [ ] **Step 1: Render the 1024² master PNG (Heat treatment)**

Render the icon to a transparent 1024 PNG via a headless canvas. Using the chrome-devtools MCP: navigate to `about:blank`, then run this with the screenshot/eval saved to a file:

`mcp__chrome-devtools__evaluate_script` with `filePath: ".harness/icon-b64.txt"` and function:

```js
() => {
  const S = 1024, m = 96, b = S - 2 * m, r = 188;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const k = c.getContext('2d');
  // body: rounded square with the Heat gradient + a soft drop shadow
  k.save();
  k.shadowColor = 'rgba(0,0,0,.28)'; k.shadowBlur = 48; k.shadowOffsetY = 22;
  const g = k.createLinearGradient(m, m, S - m, S - m);
  g.addColorStop(0, '#fbbf24'); g.addColorStop(.52, '#ff8c42'); g.addColorStop(1, '#ff4d4f');
  k.fillStyle = g; k.beginPath(); k.roundRect(m, m, b, b, r); k.fill();
  k.restore();
  // top sheen, clipped to the body
  k.save(); k.beginPath(); k.roundRect(m, m, b, b, r); k.clip();
  const sh = k.createLinearGradient(0, m, 0, m + b * 0.55);
  sh.addColorStop(0, 'rgba(255,255,255,.20)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  k.fillStyle = sh; k.fillRect(m, m, b, b); k.restore();
  // wave mark (the brand ≈), white, centered
  const s = 22, t = 512 - s * 12;
  k.save(); k.translate(t, t); k.scale(s, s);
  k.strokeStyle = '#fff'; k.lineWidth = 2; k.lineCap = 'round'; k.lineJoin = 'round';
  k.shadowColor = 'rgba(0,0,0,.22)'; k.shadowBlur = 0.18; k.shadowOffsetY = 0.12;
  k.stroke(new Path2D('M2 9c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0M2 15c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0'));
  k.restore();
  return c.toDataURL('image/png').split(',')[1]; // raw base64, no data: prefix
}
```

Then decode the saved base64 (the file holds the JSON-quoted string) to the master PNG:

```bash
mkdir -p build
tr -d '"' < .harness/icon-b64.txt | base64 -D > build/icon-1024.png
file build/icon-1024.png     # → PNG image data, 1024 x 1024
```

(`base64 -D` is the macOS decode flag.)

- [ ] **Step 2: Create the icns build script**

Create `tools/make-icon.sh`:

```bash
#!/usr/bin/env bash
# Build build/icon.icns from build/icon-1024.png using native macOS tools
# (sips + iconutil). Re-run after changing the master PNG.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="build/icon-1024.png"
SET="build/RowAlong.iconset"
rm -rf "$SET"; mkdir -p "$SET"
for sz in 16 32 128 256 512; do
  sips -z "$sz" "$sz" "$SRC" --out "$SET/icon_${sz}x${sz}.png" >/dev/null
  sips -z "$((sz * 2))" "$((sz * 2))" "$SRC" --out "$SET/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o build/icon.icns
rm -rf "$SET"
echo "wrote build/icon.icns"
```

- [ ] **Step 3: Generate the icns**

```bash
chmod +x tools/make-icon.sh
./tools/make-icon.sh           # → wrote build/icon.icns
file build/icon.icns           # → Mac OS X icon, ...
```

Expected: `build/icon.icns` exists and `file` reports a Mac icon.

- [ ] **Step 4: Eyeball the master**

Open `build/icon-1024.png` (`open build/icon-1024.png`) and confirm it's the Heat-gradient squircle with white waves and transparent corners. If the look is off, adjust the canvas code in Step 1 and re-run Steps 1–3.

- [ ] **Step 5: Commit**

```bash
git add build/icon-1024.png build/icon.icns tools/make-icon.sh
git commit -m "feat(build): RowAlong app icon (Heat) + make-icon.sh"
```

---

### Task 3: electron-builder configuration

**Files:**
- Modify: `package.json` (devDependency + scripts + author)
- Create: `electron-builder.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Install electron-builder**

```bash
npm install --save-dev electron-builder
```

Expected: it's added under `devDependencies` in `package.json`.

- [ ] **Step 2: Add author + pack scripts**

In `package.json`, set the author (currently `"author": ""`):

```json
  "author": "Endless Rain Studio",
```

And add two scripts alongside the existing ones (after `"build": "vite build",`):

```json
    "pack": "npm run build && electron-builder",
    "pack:dir": "npm run build && electron-builder --dir",
```

- [ ] **Step 3: Create `electron-builder.yml`**

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

- [ ] **Step 4: Ignore the build output**

In `.gitignore`, add `release/` (electron-builder's output dir). Keep `build/` tracked (icon assets). The relevant lines should read:

```
.superpowers/
.harness/
release/
*.local
```

- [ ] **Step 5: Build the unpacked app (fast target)**

```bash
npm run pack:dir
```

Expected: completes without error and produces `release/mac*/RowAlong.app` (the arch dir is `mac` on Intel, `mac-arm64` on Apple Silicon). electron-builder ad-hoc signs the bundle (no Developer ID).

- [ ] **Step 6: Confirm the app is signed enough to launch**

```bash
codesign -dv "release/"mac*"/RowAlong.app" 2>&1 | head -3
```

Expected: a signature is present (ad-hoc shows `Signature=adhoc`). If electron-builder produced an **unsigned** bundle (no signature), ad-hoc sign it explicitly so it launches on Apple Silicon:

```bash
codesign --force --deep --sign - "release/"mac*"/RowAlong.app"
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json electron-builder.yml .gitignore
git commit -m "feat(build): electron-builder config + pack scripts"
```

---

### Task 4: Build & run verification (USER-RUN gate)

**Files:** none (runtime verification on macOS).

- [ ] **Step 1: Full package**

Run: `npm run pack`
Expected: `release/` contains `RowAlong-<version>.dmg` and `release/mac*/RowAlong.app`.

- [ ] **Step 2: Launch the packaged app**

Run: `open release/mac*/RowAlong.app` (or open the `.dmg` and drag to /Applications, then launch).
Confirm: the app launches and the **setup window renders** (proves it loaded the bundled `dist/`, not a dev server — there is no dev server running).

- [ ] **Step 3: Icon present**

Confirm the **Heat icon** shows in the Dock while running, and on the `.app` / inside the `.dmg` in Finder.

- [ ] **Step 4: Overlay still floats over native fullscreen**

Put Apple TV.app (or QuickTime) in native fullscreen, start a workout from the packaged app, and confirm the overlay **floats over the fullscreen video** (the panel behavior survives packaging) and still drags / resizes / hugs height / click-to-pause. ⌘-Q quits.

- [ ] **Step 5: Record outcome**

- All pass → packaging is done.
- Setup window blank → the prod load path is wrong; check `loadFile(__dirname/../dist/...)` resolves and that `dist/index.html` uses `./assets/`. Report back.
- App won't launch ("damaged"/quarantine) → ad-hoc sign per Task 3 Step 6; if from the dmg, `xattr -cr /Applications/RowAlong.app`.

---

## Self-review notes

- **Spec coverage:** prod-loading (Task 1 Steps 1-3), Vite base (Step 4), `main`
  (Step 5), icon pipeline (Task 2), electron-builder.yml + scripts + author + appId
  (Task 3), `.gitignore release/` (Task 3 Step 4), ad-hoc signing + fallback (Task 3
  Step 6), build/run verification incl. icon + fullscreen float (Task 4). All spec
  sections map to a task.
- **No placeholders:** every code/command step is concrete.
- **Naming consistency:** `loadPage(win, page)` defined in Task 1 Step 1 and used in
  Steps 2-3; `build/icon-1024.png` / `build/icon.icns` consistent across Task 2 and
  the `electron-builder.yml` `icon:` in Task 3.
