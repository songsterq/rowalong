# Overlay window hugs its content

## Problem

The Electron overlay is a fixed-size, transparent, frameless window (default
`250 × 240`, min `200 × 180`). The visible card (`.ov-root`) only takes its
natural content height — in pill (compact) mode roughly ~140px — and does **not**
fill the window. The body is `height: 100%` but the card has no `flex:1`/height,
so the remaining ~100px below the card is transparent.

A transparent Electron window is **not** click-through: it intercepts mouse
events across its entire rectangular bounds, including fully transparent pixels.
So that empty strip below the card swallows clicks meant for the video playing
underneath — a "dead zone".

The dead zone is vertical only: `body { align-items: stretch }` makes the card
span the full window width, so there is no horizontal gap (except the rounded
corners).

## Goal

Make the overlay window's **height** track the card's rendered height so there is
no transparent strip below the card in the resting state. Width stays
user-controlled.

This is the "hug the content" approach (option 1). The alternative —
`setIgnoreMouseEvents` click-through (option 2) — is out of scope.

## Approach

### Mechanism: a `ResizeObserver` on the card

Put a single `ResizeObserver` on `.ov-root` in `overlayView.ts`. It fires
whenever the card's box changes — density toggle (pill↔coach), hover-reveal of
controls/brand, the paused tag appearing, and any row added later — and reports
the card's border-box height to the host.

Using an observer (rather than re-measuring on each known trigger) means we can't
forget a trigger. The countdown ticking does **not** change height (tabular-nums,
fixed font size), so the observer stays quiet during normal running and we do not
resize every frame.

### Shell seam: a new optional callback

Add `onResize?(height: number)` to `OverlayOpts`, mirroring the existing optional
`onDrag`. The `ResizeObserver` is only created when `onResize` is provided, so the
browser / Document-PiP path is completely unaffected — this is Electron-only.

Data flow (mirrors the existing `move-overlay-by` path):

1. `overlayView.ts` — `ResizeObserver` measures `.ov-root` border-box height and
   calls `opts.onResize(height)`.
2. `overlay-entry.ts` — wires `onResize: (h) => window.electronAPI?.setOverlayHeight(h)`.
3. `preload.cjs` — exposes `setOverlayHeight: (h) => ipcRenderer.send('set-overlay-height', h)`.
4. `electron.d.ts` — types `setOverlayHeight(height: number): void` on `ElectronAPI`.
5. `app.cjs` — `ipcMain.on('set-overlay-height', ...)` calls
   `overlayWin.setContentSize(currentWidth, Math.ceil(height))`, keeping the
   window's x/y and width fixed so the card stays put and only the bottom edge
   moves.

### Height only; width stays user-controlled

The card stretches to the window width, so there is no horizontal dead zone — only
vertical. Auto-managing height alone:

- kills the dead zone, and
- avoids a feedback loop: setting the window height does not change the card's
  content height (the card is not `height:100%`), so the observer won't
  re-trigger itself.

The user can still drag-resize the window width; that just re-stretches the card.
A manual height drag will re-hug on the next content change — acceptable.

### Hover/paused behavior: window grows to fit

When the card grows (hover reveals controls in pill mode; the paused tag appears),
the window grows downward to fit, then shrinks back when the card contracts. This
preserves the current hover-to-show-controls affordance in pill mode (which would
otherwise be clipped by `body { overflow: hidden }`). The slight motion on hover
is acceptable / reads as feedback.

### Lower `minHeight`

Today `minHeight: 180` would clamp the ~140px pill and leave a ~40px strip. Drop
the height floor to a small safety value well below the pill so content fully
governs the height. `minWidth` stays so the card keeps its shape.

### Persistence unchanged

Saved bounds still restore on launch. The first layout pass re-hugs the height, so
a stale saved height just self-corrects (briefly, on open). No change to the
bounds-persistence logic.

## Out of scope

- The transparent rounded-corner triangles still capture clicks (negligible).
  Eliminating those needs the click-through approach (option 2).
- Auto-fitting width.

## Testing

Following the repo split (core/UI unit-tested; Electron wrappers verified
manually, per AGENTS.md):

- **Unit (jsdom), test-first:** `overlayView`'s wiring. Install a stub
  `ResizeObserver`, mount with an `onResize` spy, and assert the observer is
  created + `onResize` is invoked with a numeric height. Assert no
  `ResizeObserver` / `onResize` activity when `onResize` is omitted (PiP path
  untouched). `unmount()` disconnects the observer.
- **Manual:** the actual pixel measurement, the `app.cjs` `setContentSize` /
  lowered `minHeight`, and the visible result (dead zone gone; window grows on
  hover; floats over fullscreen unchanged) via `npm run electron:dev`.

## Affected files

- `src/ui/overlayView.ts` — `onResize` opt + `ResizeObserver`; disconnect in `unmount()`.
- `src/overlay-entry.ts` — wire `onResize` to `electronAPI.setOverlayHeight`.
- `electron/preload.cjs` — expose `setOverlayHeight`.
- `src/electron.d.ts` — type `setOverlayHeight`.
- `electron/app.cjs` — `set-overlay-height` IPC handler; lower `minHeight`.
- `tests/overlayView.test.ts` — observer/`onResize` wiring tests.
