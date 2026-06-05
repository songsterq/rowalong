# Overlay UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ambiguous overlay density-toggle icon with a state-aware expand/collapse glyph, and make the Electron overlay window remember its last position and size (with a sensible minimum).

**Architecture:** Part A is a pure presentational change in the framework-agnostic overlay view (`src/ui/overlayView.ts`), unit-tested in jsdom. Part B splits into a pure, unit-tested bounds helper (`electron/windowBounds.cjs`, CommonJS so the Electron main process can `require` it directly — there is no build step for the main process) and a thin wiring change in `electron/app.cjs` (read on open, persist on move/resize), verified manually per the project's convention for the Electron shell.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest (jsdom), Electron. No new dependencies.

---

## File Structure

- `src/ui/overlayView.ts` — **modify.** Add a pure `densityIcon(d)` helper; render the density toggle button from the current density (glyph + title) on mount and on `setDensity`.
- `tests/overlayView.test.ts` — **modify.** Add tests for `densityIcon` and the state-aware button.
- `electron/windowBounds.cjs` — **create.** Pure helpers `pickStartBounds` and `isVisibleOnSomeDisplay`. No `electron`/`fs` imports — just geometry, so it is unit-testable.
- `electron/windowBounds.d.cts` — **create.** Type declarations for the `.cjs` helper so `tsc --noEmit` (which type-checks `tests/`) resolves the import.
- `tests/windowBounds.test.ts` — **create.** Unit tests for the bounds helper.
- `electron/app.cjs` — **modify.** Read saved bounds when opening the overlay, apply `minWidth`/`minHeight`, and persist `getBounds()` on `moved`/`resized`.

---

## Task 1: State-aware density toggle icon (Part A)

**Files:**
- Modify: `src/ui/overlayView.ts`
- Test: `tests/overlayView.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/overlayView.test.ts`. First add `densityIcon` to the existing import on line 2 so it reads:

```ts
import { formatCountdown, spmText, mountOverlay, densityIcon } from '../src/ui/overlayView';
```

Then append these two blocks at the end of the file:

```ts
describe('densityIcon', () => {
  it('maps pill→expand and coach→collapse, never the stop glyph', () => {
    expect(densityIcon('pill')).toBe('⤢');
    expect(densityIcon('coach')).toBe('⤡');
    expect(densityIcon('pill')).not.toBe('⏹');
    expect(densityIcon('coach')).not.toBe('⏹');
  });
});

describe('density toggle button', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

  it('shows the state-aware glyph on mount and updates via setDensity', () => {
    const engine = fakeEngine(runningState);
    const mounted = mountOverlay(document, engine as never, { density: 'pill' });
    const btn = document.querySelector('[data-act="density"]') as HTMLElement;
    expect(btn.textContent).toBe('⤢');
    expect(btn.getAttribute('title')).toBe('Expand');

    mounted.setDensity('coach');
    expect(btn.textContent).toBe('⤡');
    expect(btn.getAttribute('title')).toBe('Collapse');
  });
});
```

(`fakeEngine`, `runningState`, and `beforeEach` are already defined/imported earlier in this test file.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: FAIL — `densityIcon` is not exported (`densityIcon is not a function`), and the button assertions fail because the current glyph is `▣`.

- [ ] **Step 3: Implement the helper and wire it into the view**

In `src/ui/overlayView.ts`:

(a) Add the pure helper right after the `spmText` function (after line 15):

```ts
export function densityIcon(d: Density): string {
  // pill = compact, so the action is "expand" to coach; coach = expanded, action "collapse".
  return d === 'coach' ? '⤡' : '⤢';
}
```

(b) Replace the density button line in the `root.innerHTML` template (currently
`      <button data-act="density" title="Toggle density">▣</button>`) with an empty
button that is populated below:

```ts
      <button data-act="density"></button>
```

(c) Immediately after `const $ = (sel: string) => root.querySelector(sel) as HTMLElement;`,
add a reference to the button and a sync helper, then call it for the initial state:

```ts
  const densityBtn = root.querySelector('[data-act="density"]') as HTMLButtonElement;
  const syncDensityBtn = (d: Density) => {
    densityBtn.textContent = densityIcon(d);
    densityBtn.title = d === 'coach' ? 'Collapse' : 'Expand';
  };
  syncDensityBtn(opts.density);
```

(d) Update the returned `setDensity` so it also refreshes the button:

```ts
    setDensity(d: Density) {
      root.dataset.density = d;
      syncDensityBtn(d);
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: PASS (all existing tests plus the two new blocks).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat(overlay): state-aware expand/collapse density toggle icon"
```

---

## Task 2: Pure overlay-bounds helper (Part B logic)

**Files:**
- Create: `electron/windowBounds.cjs`
- Create: `electron/windowBounds.d.cts`
- Test: `tests/windowBounds.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/windowBounds.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickStartBounds, isVisibleOnSomeDisplay } from '../electron/windowBounds.cjs';

const DEFAULTS = { width: 250, height: 240, minWidth: 200, minHeight: 180 };
// A single 1440x900 display whose work area starts at (0,0).
const DISPLAYS = [{ x: 0, y: 0, width: 1440, height: 900 }];

describe('isVisibleOnSomeDisplay', () => {
  it('is true when the window overlaps a display', () => {
    expect(isVisibleOnSomeDisplay({ x: 100, y: 100, width: 250, height: 240 }, DISPLAYS)).toBe(true);
  });

  it('is false when the window is entirely off every display', () => {
    expect(isVisibleOnSomeDisplay({ x: 5000, y: 5000, width: 250, height: 240 }, DISPLAYS)).toBe(false);
  });

  it('is true when the window only partially overlaps a display', () => {
    // Hangs off the right edge but its left portion is still on-screen.
    expect(isVisibleOnSomeDisplay({ x: 1400, y: 100, width: 250, height: 240 }, DISPLAYS)).toBe(true);
  });
});

describe('pickStartBounds', () => {
  it('returns defaults (no x/y) when there are no saved bounds', () => {
    expect(pickStartBounds(null, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
  });

  it('restores valid saved bounds, preserving position', () => {
    const saved = { x: 300, y: 220, width: 320, height: 300 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({
      x: 300, y: 220, width: 320, height: 300,
    });
  });

  it('falls back to defaults when saved bounds are off all displays', () => {
    const saved = { x: 5000, y: 5000, width: 320, height: 300 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
  });

  it('keeps partially-overlapping saved bounds', () => {
    const saved = { x: 1400, y: 100, width: 250, height: 240 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({
      x: 1400, y: 100, width: 250, height: 240,
    });
  });

  it('clamps a restored size up to the minimum', () => {
    const saved = { x: 100, y: 100, width: 50, height: 40 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({
      x: 100, y: 100, width: 200, height: 180,
    });
  });

  it('falls back to defaults when saved bounds are malformed', () => {
    expect(pickStartBounds({ x: 'a', y: 10 }, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
    expect(pickStartBounds({ width: 250, height: 240 }, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/windowBounds.test.ts`
Expected: FAIL — cannot resolve `../electron/windowBounds.cjs` (module does not exist yet).

- [ ] **Step 3: Implement the helper and its type declaration**

Create `electron/windowBounds.cjs`:

```js
'use strict';

// Pure geometry helpers for restoring the overlay window's last bounds.
// No electron/fs imports so this is unit-testable; app.cjs supplies real data.

function isRect(b) {
  return (
    b != null &&
    typeof b.x === 'number' && Number.isFinite(b.x) &&
    typeof b.y === 'number' && Number.isFinite(b.y) &&
    typeof b.width === 'number' && b.width > 0 &&
    typeof b.height === 'number' && b.height > 0
  );
}

function intersects(a, b) {
  const ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ix > 0 && iy > 0;
}

// True when `bounds` has a positive-area overlap with at least one display work area.
// A window stranded on a disconnected monitor overlaps nothing → false.
function isVisibleOnSomeDisplay(bounds, displays) {
  if (!isRect(bounds) || !Array.isArray(displays)) return false;
  return displays.some((d) => isRect(d) && intersects(bounds, d));
}

// Returns the bounds to construct the overlay BrowserWindow with.
// - Unusable/missing/off-screen saved bounds → { width, height } only (Electron centres it).
// - Valid saved bounds → { x, y, width, height }, with size floored to the minimum.
function pickStartBounds(saved, displays, config) {
  const { width, height, minWidth, minHeight } = config;
  if (!isVisibleOnSomeDisplay(saved, displays)) {
    return { width, height };
  }
  return {
    x: saved.x,
    y: saved.y,
    width: Math.max(saved.width, minWidth),
    height: Math.max(saved.height, minHeight),
  };
}

module.exports = { pickStartBounds, isVisibleOnSomeDisplay };
```

Create `electron/windowBounds.d.cts` (so `tsc` resolves types for the `.cjs` import in the test):

```ts
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundsConfig {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export interface StartBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export function isVisibleOnSomeDisplay(bounds: unknown, displays: Rect[]): boolean;
export function pickStartBounds(saved: unknown, displays: Rect[], config: BoundsConfig): StartBounds;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/windowBounds.test.ts`
Expected: PASS (all 9 cases).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors (the `.d.cts` provides types for the `.cjs` import).

- [ ] **Step 6: Commit**

```bash
git add electron/windowBounds.cjs electron/windowBounds.d.cts tests/windowBounds.test.ts
git commit -m "feat(electron): pure overlay-bounds helper (pickStartBounds)"
```

---

## Task 3: Persist & restore overlay bounds in the main process (Part B wiring)

**Files:**
- Modify: `electron/app.cjs`

This task wires the Task 2 helper into the Electron main process. The main process is
verified manually (per AGENTS.md), so there is no new unit test here — but the full
suite and typecheck must still pass, and a manual run confirms the behaviour.

- [ ] **Step 1: Add requires, defaults, and read/write helpers**

In `electron/app.cjs`, change the top requires (currently
`const { app, BrowserWindow, ipcMain } = require('electron');` and
`const path = require('path');`) to:

```js
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pickStartBounds } = require('./windowBounds.cjs');
```

Then, just below the `let overlayWin = null;` line, add:

```js
const OVERLAY_DEFAULTS = { width: 250, height: 240, minWidth: 200, minHeight: 180 };

// Persist the overlay window's last bounds in userData (the renderer's localStorage
// is not readable from the main process at window-creation time). Best-effort: any
// read/write failure just falls back to the default centred window.
function boundsFile() {
  return path.join(app.getPath('userData'), 'overlay-bounds.json');
}

function readSavedBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeSavedBounds(bounds) {
  try {
    fs.writeFileSync(boundsFile(), JSON.stringify(bounds));
  } catch {
    // ignore — remembering position is best-effort
  }
}
```

- [ ] **Step 2: Restore bounds on open and persist on move/resize**

Replace the entire `openOverlay` function with:

```js
function openOverlay(payload) {
  if (overlayWin) {
    overlayWin.close();
    overlayWin = null;
  }

  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const start = pickStartBounds(readSavedBounds(), displays, OVERLAY_DEFAULTS);

  overlayWin = new BrowserWindow({
    ...start,
    minWidth: OVERLAY_DEFAULTS.minWidth,
    minHeight: OVERLAY_DEFAULTS.minHeight,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });

  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });

  // Remember where the user parks/sizes the overlay. 'moved'/'resized' fire once
  // when the drag/resize finishes, so there's no per-pixel write thrashing.
  const saveBounds = () => writeSavedBounds(overlayWin.getBounds());
  overlayWin.on('moved', saveBounds);
  overlayWin.on('resized', saveBounds);

  overlayWin.loadURL(`${DEV_URL}/overlay.html`);
  overlayWin.webContents.once('did-finish-load', () => {
    overlayWin.webContents.send('session-payload', payload);
  });
  overlayWin.showInactive(); // show without stealing focus from the video app
  overlayWin.on('closed', () => {
    overlayWin = null;
  });
}
```

(The only changes vs. the original: `displays`/`start` computed before construction,
`...start` + `minWidth`/`minHeight` spread into the options, and the `saveBounds`
listeners. The macOS over-fullscreen calls — `app.dock.hide()` elsewhere,
`setAlwaysOnTop('screen-saver')`, and `setVisibleOnAllWorkspaces(...)` — are unchanged.)

- [ ] **Step 3: Verify the full test suite and typecheck still pass**

Run: `npm test`
Expected: PASS (all files, including the two from Tasks 1–2).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Manual verification (Electron shell)**

Run: `npm run electron:dev`

1. In the setup window, start a session → the overlay appears (first run: default
   250×240, centred).
2. Drag the overlay to a corner and resize it larger.
3. Stop the session (overlay closes).
4. Start another session → the overlay reopens at the **same position and size**.
5. Try to resize it very small → it should not shrink below **200×180**.
6. (If a second display is available) park it on the external display, disconnect
   that display, then start a session → it should fall back to the default centred
   window rather than opening off-screen.

Confirm `overlay-bounds.json` exists under the app's userData dir (macOS:
`~/Library/Application Support/<app name>/overlay-bounds.json`).

- [ ] **Step 5: Commit**

```bash
git add electron/app.cjs
git commit -m "feat(electron): remember overlay position and size across sessions"
```

---

## Self-Review notes

- **Spec coverage:** Part A (state-aware icon, `densityIcon`, `setDensity` update,
  tests) → Task 1. Part B pure helper (`pickStartBounds`, `isVisibleOnSomeDisplay`,
  off-screen fallback, min clamp) → Task 2. Part B wiring (userData file, min size,
  `moved`/`resized` persistence, untouched fullscreen gotchas) → Task 3. The browser
  PiP limitation is a no-op (documented in the spec; `pipOverlayHost.ts` is not
  touched). All spec sections map to a task.
- **Type consistency:** `pickStartBounds(saved, displays, config)` and
  `isVisibleOnSomeDisplay(bounds, displays)` signatures match across the `.cjs`,
  the `.d.cts`, the tests, and the `app.cjs` call site. `OVERLAY_DEFAULTS`
  (`{ width, height, minWidth, minHeight }`) matches the `BoundsConfig` shape and the
  `DEFAULTS` used in tests. `densityIcon(d: Density)` returns `'⤢'`/`'⤡'` consistently
  in implementation and assertions.
- **No placeholders:** every code step shows complete code; every run step states the
  exact command and expected result.
