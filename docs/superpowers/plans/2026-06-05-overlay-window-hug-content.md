# Overlay Window Hug Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resize the Electron overlay window's height to track the card's rendered height, eliminating the transparent dead zone below the card that intercepts clicks meant for the video underneath.

**Architecture:** A `ResizeObserver` on `.ov-root` (in the shared `overlayView`) reports the card's border-box height through a new optional `onResize` callback. The Electron overlay entry forwards that height over a new IPC channel; the main process calls `setContentSize` to hug it. The callback is optional, so the browser / Document-PiP path is untouched. Only height is auto-managed; width stays user-controlled.

**Tech Stack:** Vanilla TypeScript + Vite, Vitest (jsdom), Electron (CommonJS main/preload).

---

## File Structure

- `src/ui/overlayView.ts` — add `onResize?` to `OverlayOpts`; create a `ResizeObserver` on the card when provided; disconnect it in `unmount()`. (unit-tested)
- `tests/overlayView.test.ts` — observer/`onResize` wiring tests with a stub `ResizeObserver`.
- `src/overlay-entry.ts` — wire `onResize` → `electronAPI.setOverlayHeight`. (manual)
- `electron/preload.cjs` — expose `setOverlayHeight`. (manual)
- `src/electron.d.ts` — type `setOverlayHeight`. (typecheck)
- `electron/app.cjs` — `set-overlay-height` IPC handler + lower `minHeight`. (manual)

---

## Task 1: `overlayView` reports card height via `onResize`

**Files:**
- Modify: `src/ui/overlayView.ts` (`OverlayOpts` interface ~line 61; `mountOverlay` body; `unmount()` ~line 245)
- Test: `tests/overlayView.test.ts`

- [ ] **Step 1: Write the failing tests**

Add `afterEach` to the existing vitest import at the top of `tests/overlayView.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
```

Append this block to the end of `tests/overlayView.test.ts`:

```ts
describe('window-hug resize reporting (onResize)', () => {
  class FakeRO {
    static instances: FakeRO[] = [];
    cb: ResizeObserverCallback;
    observed: Element[] = [];
    disconnected = false;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
      FakeRO.instances.push(this);
    }
    observe(el: Element) { this.observed.push(el); }
    unobserve() {}
    disconnect() { this.disconnected = true; }
    fire() { this.cb([], this as unknown as ResizeObserver); }
  }

  let originalRO: typeof globalThis.ResizeObserver;
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    FakeRO.instances = [];
    originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeRO as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = originalRO;
  });

  it('observes the card and reports its border-box height through onResize', () => {
    const engine = fakeEngine(runningState);
    const heights: number[] = [];
    mountOverlay(document, engine as never, {
      density: 'pill',
      onResize: (h) => heights.push(h),
    });
    const root = document.querySelector('.ov-root') as HTMLElement;
    Object.defineProperty(root, 'offsetHeight', { configurable: true, value: 142 });

    expect(FakeRO.instances).toHaveLength(1);
    expect(FakeRO.instances[0].observed).toContain(root);
    expect(heights).toEqual([]); // not reported until the observer fires

    FakeRO.instances[0].fire();
    expect(heights).toEqual([142]);
  });

  it('does not create an observer when onResize is omitted (PiP path untouched)', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'pill' });
    expect(FakeRO.instances).toHaveLength(0);
  });

  it('disconnects the observer on unmount', () => {
    const engine = fakeEngine(runningState);
    const mounted = mountOverlay(document, engine as never, {
      density: 'pill',
      onResize: () => {},
    });
    expect(FakeRO.instances[0].disconnected).toBe(false);
    mounted.unmount();
    expect(FakeRO.instances[0].disconnected).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: FAIL — the three new tests fail (no `ResizeObserver` is constructed, so `FakeRO.instances` is empty / `heights` stays `[]`). The pre-existing tests still pass.

- [ ] **Step 3: Add `onResize` to `OverlayOpts`**

In `src/ui/overlayView.ts`, in the `OverlayOpts` interface (after the `onDrag` field, ~line 67), add:

```ts
  /** Report the card's rendered border-box height (px) so an Electron host can
   *  resize its window to hug the content. Electron-only; omitted in the browser. */
  onResize?: (height: number) => void;
```

- [ ] **Step 4: Create the observer in `mountOverlay`**

In `src/ui/overlayView.ts`, immediately after `doc.body.appendChild(root);` (~line 112), add:

```ts
  // Electron host only: keep the overlay window hugging the card. The card height
  // changes on density toggle, hover-reveal of controls, and the paused tag — a
  // ResizeObserver catches them all. Countdown ticks don't change height, so this
  // stays quiet during normal running.
  let resizeObs: ResizeObserver | undefined;
  if (opts.onResize) {
    resizeObs = new ResizeObserver(() => opts.onResize!(root.offsetHeight));
    resizeObs.observe(root);
  }
```

- [ ] **Step 5: Disconnect the observer in `unmount`**

In `src/ui/overlayView.ts`, change the `unmount()` method (~line 245) from:

```ts
    unmount() {
      off();
      root.remove();
      style.remove();
    },
```

to:

```ts
    unmount() {
      resizeObs?.disconnect();
      off();
      root.remove();
      style.remove();
    },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: PASS — all tests in the file pass, including the three new ones.

- [ ] **Step 7: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "$(cat <<'EOF'
feat(overlay): report card height via optional onResize observer

A ResizeObserver on .ov-root reports the card's border-box height through
a new optional onResize callback, so an Electron host can hug the window to
the content. Gated on onResize so the browser/PiP path is untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire the Electron shell to hug the window

These are thin Electron wrappers (no unit tests, per AGENTS.md — verified manually). They are interdependent (renderer → preload bridge → IPC → main), so they land together.

**Files:**
- Modify: `src/electron.d.ts` (`ElectronAPI` interface)
- Modify: `electron/preload.cjs` (bridge)
- Modify: `src/overlay-entry.ts` (`mountOverlay` opts)
- Modify: `electron/app.cjs` (`OVERLAY_DEFAULTS` ~line 25; new IPC handler near the other `ipcMain.on` handlers ~line 130)

- [ ] **Step 1: Type the new bridge method**

In `src/electron.d.ts`, in the `ElectronAPI` interface, after the `moveOverlayBy` method, add:

```ts
  /** Overlay window → main: resize the overlay window's content height (px) so the window hugs the card. */
  setOverlayHeight(height: number): void;
```

- [ ] **Step 2: Expose the bridge method in preload**

In `electron/preload.cjs`, after the `moveOverlayBy` line, add:

```js
  setOverlayHeight: (h) => ipcRenderer.send('set-overlay-height', h),
```

- [ ] **Step 3: Wire `onResize` in the overlay entry**

In `src/overlay-entry.ts`, in the `mountOverlay({ ... })` options object, after the `onDrag` line, add:

```ts
    onResize: (h) => window.electronAPI?.setOverlayHeight(h),
```

- [ ] **Step 4: Lower `minHeight` so the pill can fully hug**

In `electron/app.cjs`, change the `OVERLAY_DEFAULTS` line (~line 25) from:

```js
const OVERLAY_DEFAULTS = { width: 250, height: 240, minWidth: 200, minHeight: 180 };
```

to:

```js
// minHeight is a small safety floor only — the card's measured height drives the
// real window height (see the 'set-overlay-height' handler). It must stay below the
// compact pill (~140px) or it would clamp the hug and leave a dead strip.
const OVERLAY_DEFAULTS = { width: 250, height: 240, minWidth: 200, minHeight: 80 };
```

- [ ] **Step 5: Add the `set-overlay-height` IPC handler**

In `electron/app.cjs`, after the existing `ipcMain.on('move-overlay-by', ...)` handler (~line 135), add:

```js
ipcMain.on('set-overlay-height', (_event, height) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return;
  // Keep current width + position (x/y); only the bottom edge moves so the card
  // stays anchored at the top-left.
  const [w] = overlayWin.getContentSize();
  overlayWin.setContentSize(w, Math.ceil(height));
});
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no type errors (`setOverlayHeight` is now declared on `ElectronAPI`, so `overlay-entry.ts`'s `window.electronAPI?.setOverlayHeight(h)` typechecks).

- [ ] **Step 7: Run the full unit suite**

Run: `npm test`
Expected: PASS — all tests pass.

- [ ] **Step 8: Manual verification (Electron)**

Run: `npm run electron:dev`
Then start a workout to open the overlay, and confirm:
- In pill mode at rest, there is **no transparent dead strip** below the card — clicking just below the visible card reaches the app/video underneath.
- Hovering the card grows the window downward to reveal the controls (play/skip/stop), and they are fully visible and clickable; leaving shrinks it back.
- Toggling to coach mode grows the window to fit the expanded card; toggling back to pill shrinks it.
- Pausing (showing the "PAUSED — click to resume" tag) grows the window to fit, with no clipping.
- Dragging the card still repositions the window; the overlay still floats over a native-app fullscreen video.

- [ ] **Step 9: Commit**

```bash
git add src/electron.d.ts electron/preload.cjs src/overlay-entry.ts electron/app.cjs
git commit -m "$(cat <<'EOF'
feat(electron): hug the overlay window to the card height

Forward the card's measured height over a new set-overlay-height IPC channel
and call setContentSize so the window tracks the card. Lower minHeight below
the compact pill so the hug isn't clamped. Removes the transparent dead zone
that was swallowing clicks meant for the video underneath.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- **Spec coverage:** ResizeObserver + `onResize` (Task 1); `setOverlayHeight` bridge across preload/`electron.d.ts`/`overlay-entry`/`app.cjs` IPC + lowered `minHeight` (Task 2); height-only / width user-controlled (Task 2 handler keeps width); grow-on-hover (automatic via the observer); persistence unchanged (no code touched); out-of-scope corners & width (not implemented). All covered.
- **Type consistency:** `setOverlayHeight` (camel) used identically in `electron.d.ts`, `preload.cjs`, and `overlay-entry.ts`; IPC channel `'set-overlay-height'` (kebab) used in `preload.cjs` and `app.cjs`; `onResize` used in `OverlayOpts` and `overlay-entry.ts`.
- **No placeholders:** every step has concrete code/commands and expected output.
