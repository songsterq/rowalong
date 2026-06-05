# Overlay UX improvements — design

**Date:** 2026-06-05

Two small, independent usability fixes to the running-workout overlay:

1. The density toggle icon (`▣`) is too easily confused with the stop button (`⏹`).
2. The Electron overlay reopens at a default centred position every time; it should
   remember where (and how big) it was last left.

These are Electron/overlay-UI changes only. Core generator/engine logic is untouched.

---

## Part A — State-aware density toggle icon

**File:** `src/ui/overlayView.ts`

The control row currently renders two filled-square glyphs side by side:

```html
<button data-act="density" title="Toggle density">▣</button>
<button data-act="stop" title="Stop">⏹</button>
```

`▣` and `⏹` read as the same shape at overlay size. Replace the density glyph with a
**state-aware expand/collapse** icon:

- `pill` (compact) → `⤢`, title **"Expand"** — tapping expands to coach detail.
- `coach` (expanded) → `⤡`, title **"Collapse"** — tapping collapses to pill.

Neither glyph resembles the `⏹` stop square.

### Implementation

- Add a pure helper:

  ```ts
  export function densityIcon(d: Density): string // '⤢' for 'pill', '⤡' for 'coach'
  ```

- On initial mount, set the density button's `textContent` and `title` from
  `opts.density` instead of the static `▣`.
- Extend the returned `setDensity(d)` to update the button glyph + title in addition
  to flipping `root.dataset.density`. (The per-tick `apply()` never writes this
  button, so the glyph is safe between toggles.)

### Tests (TDD, jsdom — extend `tests/overlayView.test.ts`)

- `densityIcon('pill') === '⤢'`, `densityIcon('coach') === '⤡'`.
- Mount with `density: 'pill'` → density button text is `⤢`.
- Calling `setDensity('coach')` updates the button to `⤡`.
- The density button is never `⏹`.

---

## Part B — Remember Electron overlay bounds (position + size)

**Files:** new `electron/windowBounds.cjs`, `electron/app.cjs`

Today `openOverlay` constructs the overlay `BrowserWindow` with a fixed
`width: 250, height: 240` and no `x`/`y`, so it centres on every launch. We persist
the window's bounds across sessions and restore them next time.

### Sizing

- **Default:** 250 × 240 (unchanged — used the first time, or when saved bounds are
  unusable).
- **Minimum:** **200 × 180** — keeps the label, the 54px countdown, the progress bar,
  and the control row readable without wrapping. Set as `minWidth`/`minHeight` on the
  `BrowserWindow` so live resizing can't squish it below that, and clamped in
  `pickStartBounds` so stale saved bounds are floored too.

### New pure module `electron/windowBounds.cjs`

CommonJS so the Electron **main** process can `require` it (it cannot import the TS
`src/` modules at runtime — only the renderer entries are built by Vite). The same
file is unit-tested, keeping the testable logic out of the thin shell.

```js
// bounds: { x, y, width, height }; displays: array of work-area rects { x, y, width, height }
// config: { width, height, minWidth, minHeight }  (width/height = defaults)
pickStartBounds(saved, displays, config) -> bounds-for-BrowserWindow
isVisibleOnSomeDisplay(bounds, displays) -> boolean   // exported for tests
```

`pickStartBounds`:
- If `saved` is missing / malformed / not `isVisibleOnSomeDisplay` →
  return `{ width: config.width, height: config.height }` (no `x`/`y` ⇒ Electron
  centres, today's behaviour).
- Otherwise return
  `{ x, y, width: max(saved.width, minWidth), height: max(saved.height, minHeight) }`.

`isVisibleOnSomeDisplay` returns true when the saved rectangle has a positive-area
intersection with **any** display work area. A window stranded on a now-disconnected
monitor has zero intersection everywhere → discarded → falls back to the default.

### `electron/app.cjs` changes

- Require `screen` from electron and `fs`.
- Persist to a small JSON file:
  `const BOUNDS_FILE = path.join(app.getPath('userData'), 'overlay-bounds.json')`.
  (Main-process owned; the renderer's `localStorage` is not readable from main at
  window-creation time, so a userData file is the natural store.)
- `readSavedBounds()` / `writeSavedBounds(bounds)` — thin, wrapped in `try/catch`
  (a corrupt or missing file just yields the default).
- In `openOverlay`, compute the start bounds:

  ```js
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const start = pickStartBounds(readSavedBounds(), displays, {
    width: 250, height: 240, minWidth: 200, minHeight: 180,
  });
  overlayWin = new BrowserWindow({ ...start, minWidth: 200, minHeight: 180, /* …existing opts… */ });
  ```

- After creation, persist on completion of a move or resize:

  ```js
  const save = () => writeSavedBounds(overlayWin.getBounds());
  overlayWin.on('moved', save);
  overlayWin.on('resized', save);
  ```

  (`moved`/`resized` fire once when the drag/resize finishes — no per-pixel thrashing.)

None of the macOS over-fullscreen gotchas are touched: `app.dock.hide()`,
`setAlwaysOnTop('screen-saver')`, and the `setVisibleOnAllWorkspaces(...)` flags all
remain exactly as-is (see AGENTS.md §Gotchas).

### Tests (Vitest — new `tests/windowBounds.test.ts`)

Imports `pickStartBounds` / `isVisibleOnSomeDisplay` from `../electron/windowBounds.cjs`.

- No saved bounds → returns `{ width: 250, height: 240 }` (no `x`/`y`).
- Saved bounds inside a display → returned with `x`/`y` preserved.
- Saved bounds fully off all displays → falls back to default.
- Saved bounds partially overlapping a display → kept.
- Saved size below the minimum → clamped up to 200 × 180.
- Malformed saved (missing fields / wrong types) → falls back to default.

### Manual verification

Per AGENTS.md the Electron shell is verified by hand. After implementation:
`npm run electron:dev` → start a session → move and resize the overlay → stop →
start another session → confirm the overlay reopens at the same position and size.
Test the disconnected-display fallback informally if a second display is available.

---

## Scope / known limitations

- **Browser PiP cannot restore position.** `documentPictureInPicture.requestWindow()`
  accepts only `{ width, height }`; the browser controls placement. So bounds
  persistence is **Electron-only** — which is also the path users actually leave
  parked over fullscreen video. `src/shell/pipOverlayHost.ts` is unchanged.
- The in-page (non-Chrome) fallback overlay is a fixed-position in-page element and is
  unaffected.

## Files touched

- `src/ui/overlayView.ts` — state-aware density icon (Part A).
- `electron/windowBounds.cjs` — **new** pure bounds helper (Part B).
- `electron/app.cjs` — read/restore/persist overlay bounds + min size (Part B).
- `tests/overlayView.test.ts` — extend for `densityIcon` / `setDensity` glyph.
- `tests/windowBounds.test.ts` — **new**.
