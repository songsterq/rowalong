# Overlay drag-to-reposition + state-aware play/pause — Design

**Date:** 2026-06-05

## Goal

Two related overlay UX improvements:

1. **Drag the overlay itself to reposition it.** The user should be able to grab
   anywhere on the overlay body and drag to move the floating window — no need to
   rely on the dedicated grip strip (which we remove). A single click (no drag)
   must still toggle pause/resume, so we distinguish a *drag* from a *click*.
2. **State-aware play/pause button.** The control button shows a **pause** glyph
   while the session is running and a **play** glyph while paused, instead of the
   static play/pause (`⏯`) glyph.

## Context

`mountOverlay` (`src/ui/overlayView.ts`) renders the same overlay UI in three
contexts:

| Context | How it floats | Drag today |
|---|---|---|
| **Electron** (`src/overlay-entry.ts`) | frameless OS window | the `#grip` strip in `overlay.html` (`-webkit-app-region: drag`) |
| **Browser PiP** (`src/main.ts`) | Document PiP window | browser-provided title bar |
| **In-page fallback** (non-Chrome) | `position:fixed` in host page | not draggable |

Drag-to-reposition only matters for the **Electron** window — PiP and the in-page
fallback already have their own drag (title bar) or are intentionally pinned. So
the drag-vs-click logic lives in `mountOverlay` (host-agnostic, unit-tested) and
calls an injected `onDrag(dx, dy)` callback that **only the Electron path wires
up**.

### Key constraint

`-webkit-app-region: drag` makes an element an OS-level drag handle but **swallows
clicks** — they never reach JS. So we cannot make the whole `.ov-root` an
app-region drag handle *and* keep click-to-pause. The drag must be JS-driven so we
can tell a drag apart from a click by a movement threshold.

## Approach (chosen)

**JS pointer drag → IPC → `win.setPosition`.** `mountOverlay` tracks pointer
movement on `.ov-root`; past a small threshold it calls `opts.onDrag(dx, dy)`. The
Electron entry forwards the delta over a new IPC channel and the main process
moves the window. This is the only approach compatible with "whole overlay
draggable *and* click-to-pause."

Rejected alternatives:
- **`-webkit-app-region: drag` on `.ov-root`** — smooth and zero-IPC, but swallows
  clicks, breaking click-to-pause.
- **app-region drag + double-click to pause** — changes the pause gesture; the
  requirement is that a single click stays pause.

## Design

### 1. Drag-vs-click in `mountOverlay` (`src/ui/overlayView.ts`)

- Add optional `opts.onDrag?: (dx: number, dy: number) => void`.
- **When `onDrag` is provided**, attach pointer handlers to `.ov-root`:
  - `pointerdown` (primary/left button only, target not inside `.ov-ctrls`):
    record start screen coords (`screenX`/`screenY`), capture the pointer
    (`setPointerCapture`, wrapped in try/catch for jsdom), mark a pending,
    not-yet-dragging gesture.
  - `pointermove`: once total movement from start exceeds the **4px** threshold,
    enter drag mode. While dragging, call
    `onDrag(ev.screenX - lastX, ev.screenY - lastY)` with **incremental
    screen-coordinate deltas** (screen coords are robust to the window moving
    under the cursor), then update `lastX`/`lastY`.
  - `pointerup` / `pointercancel`: release capture; if the gesture never crossed
    the threshold → treat as a **click** → toggle pause/resume; if it dragged →
    suppress the pause toggle. Reset state.
  - Cursor: `grab` at rest, `grabbing` while actively dragging.
- **When `onDrag` is absent** (PiP / fallback): behavior is unchanged — keep the
  existing simple `click → pause/resume` listener. This preserves current behavior
  and keeps the existing "clicking the body toggles pause/resume" test green.
- Control-button clicks (`.ov-ctrls`) are unaffected: `pointerdown` on a control
  returns early so no drag/click-pause gesture starts, and the controls keep their
  own `click` handler with `stopPropagation`.

### 2. State-aware play/pause button (`src/ui/overlayView.ts`)

- In `apply(state)`, set the `[data-act="pause"]` button from `state.status`:
  - `paused` → glyph `⏵` (U+23F5), title `Resume`.
  - otherwise (`running`/`idle`/`done`) → glyph `⏸` (U+23F8), title `Pause`.
- These match the existing media glyphs (`⏮ ⏭ ⏹`). The static `⏯` in the initial
  `innerHTML` is replaced; `apply()` (already called on mount and on every `tick`)
  keeps it in sync.

### 3. Electron wiring

- `electron/preload.cjs`: expose
  `moveOverlayBy: (dx, dy) => ipcRenderer.send('move-overlay-by', { dx, dy })`.
- `src/electron.d.ts`: add `moveOverlayBy(dx: number, dy: number): void` to
  `ElectronAPI`.
- `electron/app.cjs`: handle `'move-overlay-by'`:
  ```js
  ipcMain.on('move-overlay-by', (_e, { dx, dy }) => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      const [x, y] = overlayWin.getPosition();
      overlayWin.setPosition(Math.round(x + dx), Math.round(y + dy));
    }
  });
  ```
  Also persist bounds on the overlay window's `'close'` event (in addition to the
  existing `'moved'`/`'resized'` handlers), because a programmatic `setPosition`
  may not reliably fire `'moved'` on macOS — `'close'` guarantees the final
  JS-moved position is remembered.
- `src/overlay-entry.ts`: pass
  `onDrag: (dx, dy) => window.electronAPI?.moveOverlayBy(dx, dy)` into
  `mountOverlay`.

### 4. Remove the grip (`overlay.html`)

- Delete the `#grip` element, its CSS rules, and the now-unneeded
  `.ov-root { -webkit-app-region: no-drag }` rule. The body keeps its transparent,
  full-height flex layout; `mountOverlay` appends `.ov-root` to the body as before.

## Testing (TDD)

Per project convention (`AGENTS.md`: build features test-first; core/UI is
unit-tested in jsdom). Tests in `tests/overlayView.test.ts`:

- **Drag suppresses pause:** with an `onDrag` spy, a `pointerdown` →
  `pointermove` beyond 4px → `pointerup` calls `onDrag` with the expected deltas
  and does **not** toggle pause/resume.
- **Sub-threshold is a click:** with `onDrag` provided, `pointerdown` →
  `pointerup` with movement under threshold toggles pause (and does not call
  `onDrag`).
- **No `onDrag` → existing behavior:** body `click` still toggles pause/resume.
- **Play/pause glyph is state-aware:** mounting with `status: 'running'` shows
  `⏸` / title `Pause`; mounting with `status: 'paused'` shows `⏵` / title
  `Resume`.

The Electron IPC / window-move wiring and the `overlay.html` grip removal are
verified manually (`npm run electron:dev`), consistent with the existing
"thin shells are verified by hand" convention.

## Out of scope

- Dragging the PiP window or in-page fallback from the body (they keep their
  title-bar / pinned behavior; `onDrag` is simply not wired there).
- Resize behavior, snapping, or multi-monitor edge clamping beyond what
  `setPosition` already does.
