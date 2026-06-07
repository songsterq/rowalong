# Dock Icon + Panel Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give RowAlong a normal macOS Dock icon while keeping the overlay floating over other apps' native fullscreen, by making the overlay window a non-activating `NSPanel` (`type: 'panel'`) instead of running the whole app as a dock-less accessory.

**Architecture:** All changes live in `electron/app.cjs` (main process). The overlay `BrowserWindow` gains `type: 'panel'`; the app stops hiding its Dock (`app.dock.hide()` removed) and adopts standard macOS lifecycle (`window-all-closed` no longer force-quits on darwin). The float flags (`setAlwaysOnTop('screen-saver')` + `setVisibleOnAllWorkspaces({ visibleOnFullScreen: true, skipTransformProcessType: true })`) are unchanged.

**Tech Stack:** Electron 42.3.3 (CommonJS main process, `.cjs`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-06-dock-icon-panel-overlay-design.md`

> **Note on TDD:** there is no pure logic to unit-test here — this is Electron window/process config whose payoff (floating over native fullscreen) is only observable at runtime on macOS. The automatable steps below are *regression guards* (existing suite + typecheck + a `.cjs` syntax check). Task 2 is the real validation and is **user-run**.

---

### Task 1: Make the overlay a panel + restore the Dock icon

**Files:**
- Modify: `electron/app.cjs` (overlay `BrowserWindow` options ~lines 80-94; `app.whenReady` ~lines 149-161; `window-all-closed` ~lines 163-166)

- [ ] **Step 1: Make the overlay window a non-activating panel**

In `openOverlay()`, the overlay window is created with `new BrowserWindow({ ...start, … })`. Add a `type: 'panel'` property right after `...start,`. The block becomes:

```js
  overlayWin = new BrowserWindow({
    ...start,
    // macOS non-activating NSPanel: floats over another app's native fullscreen
    // even though the app runs as a normal Dock (Regular) app — this is why we no
    // longer hide the Dock. (Electron 25+; see the design spec.)
    type: 'panel',
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
```

Leave the `setAlwaysOnTop(true, 'screen-saver')` and `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })` calls below it **exactly as they are**.

- [ ] **Step 2: Stop hiding the Dock (run as a normal Regular app)**

Replace the `app.whenReady().then(...)` body's accessory comment + `app.dock.hide()` call. Change:

```js
app.whenReady().then(() => {
  // Accessory app (no Dock icon). This replicates the verified spike: ONLY as an
  // accessory (UIElement) process does the overlay's setVisibleOnAllWorkspaces
  // ({ visibleOnFullScreen: true, skipTransformProcessType: true }) actually
  // float over another app's native fullscreen. As a normal foreground app the
  // same flags float over nothing.
  if (app.dock) app.dock.hide();
  nativeTheme.themeSource = 'dark'; // dark traffic-light glyphs + native menus
  createSetupWindow();
  app.on('activate', () => {
    if (!setupWin) createSetupWindow();
  });
});
```

to:

```js
app.whenReady().then(() => {
  // Normal Dock (Regular) app. The overlay floats over another app's native
  // fullscreen because its window is a non-activating NSPanel (type: 'panel' in
  // openOverlay), which works independent of Dock/accessory status — so we do
  // NOT hide the Dock here. (The earlier activation-policy-transform attempt that
  // kept the Dock icon WITHOUT a panel failed to float; see the design spec.)
  nativeTheme.themeSource = 'dark'; // dark traffic-light glyphs + native menus
  createSetupWindow();
  app.on('activate', () => {
    if (!setupWin) createSetupWindow();
  });
});
```

(Only the comment and the removed `if (app.dock) app.dock.hide();` line change; keep `nativeTheme`, `createSetupWindow()`, and the `activate` handler.)

- [ ] **Step 3: Adopt standard macOS quit-on-close behavior**

Change the `window-all-closed` handler. From:

```js
app.on('window-all-closed', () => {
  // No Dock icon to reactivate from, so quit when the last window closes.
  app.quit();
});
```

to:

```js
app.on('window-all-closed', () => {
  // Standard macOS Dock app: stay alive when all windows close (the Dock icon /
  // ⌘-Tab reopen the setup window via the 'activate' handler). Quit elsewhere.
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Regression guards — syntax, tests, typecheck**

Run each and confirm:

```bash
node -c electron/app.cjs        # parses with no output (exit 0)
npm test                        # Test Files passed; Tests 122 passed
npm run typecheck               # tsc --noEmit, no errors
```

Expected: `node -c` prints nothing and exits 0; `npm test` shows **122 passed**; typecheck clean. (None of these exercise the float behavior — that's Task 2 — but they confirm the edit didn't break the parse, the unit suite, or the `windowBounds` typings.)

- [ ] **Step 5: Commit**

```bash
git add electron/app.cjs
git commit -m "feat(electron): Dock icon via non-activating panel overlay

Make the overlay window a macOS NSPanel (type: 'panel') so it floats over
another app's native fullscreen independent of Dock/accessory status, then
run as a normal Dock (Regular) app: drop app.dock.hide() and stay alive on
window-all-closed (darwin). Float flags unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Manual verification over native fullscreen (USER-RUN — the real gate)

**Files:** none (runtime verification on macOS).

This is the validation the prior attempt failed. It must be run by a human on a Mac with a native-fullscreen video app (Apple TV.app, Netflix in a browser is *not* native fullscreen — use Apple TV.app / QuickTime / a native player).

- [ ] **Step 1: Launch the app**

Run: `npm run electron:dev`
Expected: Vite starts, the Electron setup window opens, and a **Dock icon** appears for RowAlong.

- [ ] **Step 2: Put a video app into native fullscreen**

Open Apple TV.app (or QuickTime with a clip) and enter **native fullscreen** (green button / ⌃⌘F), so it occupies its own Space.

- [ ] **Step 3: Start a workout and confirm the float**

From the RowAlong setup window, start a workout. Switch to the fullscreen video Space.
Confirm: the **overlay rides on top of the fullscreen video** (the core requirement).

- [ ] **Step 4: Confirm Dock-app behaviors**

Confirm all of:
- The Dock icon is present while running.
- **⌘-Q** quits the app.
- Closing the **setup window** leaves the app running; clicking the Dock icon (or ⌘-Tab) **reopens** the setup window.
- The overlay still **drags**, **resizes**, **hugs its height**, and **click-to-pause** works; showing it does not yank you out of the video's fullscreen Space.

- [ ] **Step 5: Record the outcome**

- If **all pass** → proceed to Task 3 (docs).
- If the overlay **does not float** over the fullscreen video → STOP. Approach A is insufficient on this machine; do **not** update the docs. Report back so we open a new spec for Approach B (separate accessory helper process). Optionally `git revert` the Task 1 commit to restore the working accessory build in the meantime.

---

### Task 3: Update the docs (only after Task 2 passes)

**Files:**
- Modify: `AGENTS.md` (the "macOS over-fullscreen needs an accessory app" gotcha)
- Modify: `docs/superpowers/specs/2026-06-06-dock-icon-panel-overlay-design.md` (status line)

- [ ] **Step 1: Rewrite the AGENTS.md gotcha**

In `AGENTS.md`, replace the gotcha bullet that currently begins **"macOS over-fullscreen needs an accessory app."** Its current text says the overlay only floats as a dock-less accessory, that a Dock-icon variant failed, and "there is intentionally **no Dock icon** — do not 'fix' that by removing `app.dock.hide()`."

Replace that bullet with:

```markdown
- **macOS over-fullscreen uses a panel window.** The Electron overlay floats over
  another app's native fullscreen (e.g. Apple TV.app) by being a **non-activating
  `NSPanel`** — `electron/app.cjs` creates the overlay `BrowserWindow` with
  `type: 'panel'` and keeps `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen:
  true, skipTransformProcessType: true })` + `setAlwaysOnTop(true, 'screen-saver')`.
  Because the panel floats independent of Dock/accessory status, the app runs as a
  normal Dock (Regular) app (no `app.dock.hide()`). **History:** an earlier
  Dock-icon attempt that kept a *normal window* and relied on Electron's
  activation-policy transform (omitting `skipTransformProcessType`) **failed to
  float over Apple TV** and was reverted — so don't reintroduce that. The panel is
  what makes the Dock icon and the float coexist. (Spec §16 + the 2026-06-06
  dock-icon-panel-overlay design.)
```

- [ ] **Step 2: Mark the spec accepted**

In `docs/superpowers/specs/2026-06-06-dock-icon-panel-overlay-design.md`, change the status line:

```markdown
**Status:** Approved (pending spec review)
```

to:

```markdown
**Status:** Implemented and verified on macOS over Apple TV native fullscreen.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md docs/superpowers/specs/2026-06-06-dock-icon-panel-overlay-design.md
git commit -m "docs: panel-overlay supersedes the accessory-app gotcha"
```

---

## Self-review notes

- **Spec coverage:** panel window (Task 1 Step 1), drop `app.dock.hide()` (Step 2),
  standard lifecycle (Step 3), float flags unchanged (Step 1 note), ⌘-Q via default
  menu (no code — Task 2 Step 4 verifies), regression guards (Step 4), manual
  checklist (Task 2), docs update (Task 3). All spec sections map to a task.
- **No new unit tests** is intentional and justified above — there is no pure logic
  to test; adding a fake Electron test would verify nothing real.
- **Fallback** (Approach B) is explicitly a *new spec*, not a task here (Task 2
  Step 5).
