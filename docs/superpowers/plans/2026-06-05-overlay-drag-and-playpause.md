# Overlay drag-to-reposition + state-aware play/pause — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user drag the overlay body itself to reposition the Electron overlay window (distinguishing a drag from a click, which still pauses), and make the play/pause control show a state-aware glyph.

**Architecture:** Drag-vs-click detection lives in the host-agnostic, unit-tested `mountOverlay` (`src/ui/overlayView.ts`) and calls an injected `opts.onDrag(dx, dy)` callback. Only the Electron path wires `onDrag` (to a new `move-overlay-by` IPC that calls `win.setPosition`); PiP/in-page keep their existing click-only behavior. The play/pause button glyph is updated in the existing `apply(state)` render path.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest (jsdom, no globals), Electron (main `app.cjs` + `preload.cjs` + `contextBridge`).

---

## Reference

- Spec: `docs/superpowers/specs/2026-06-05-overlay-drag-and-playpause-design.md`
- `SessionStatus = 'idle' | 'running' | 'paused' | 'done'` (`src/core/types.ts:16`).

## File structure

- **Modify** `src/ui/overlayView.ts` — add `onDrag` to `OverlayOpts`; pointer-based drag-vs-click handling; state-aware play/pause glyph in `apply()`.
- **Modify** `tests/overlayView.test.ts` — drag/click and play/pause glyph tests.
- **Modify** `src/electron.d.ts` — add `moveOverlayBy` to `ElectronAPI`.
- **Modify** `electron/preload.cjs` — expose `moveOverlayBy`.
- **Modify** `electron/app.cjs` — handle `'move-overlay-by'`; persist bounds on `'close'`.
- **Modify** `src/overlay-entry.ts` — pass `onDrag` into `mountOverlay`.
- **Modify** `overlay.html` — remove the `#grip` element + its CSS + the `no-drag` rule.

---

## Task 1: State-aware play/pause glyph

**Files:**
- Modify: `src/ui/overlayView.ts`
- Test: `tests/overlayView.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `tests/overlayView.test.ts` (after the existing `density toggle button` block). It reuses the existing `fakeEngine` helper and `runningState` constant already defined in that file.

```ts
const pausedState: SessionState = { ...runningState, status: 'paused' };

describe('play/pause button is state-aware', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

  it('shows the pause glyph and title while running', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'coach' });
    const btn = document.querySelector('[data-act="pause"]') as HTMLElement;
    expect(btn.textContent).toBe('⏸');
    expect(btn.getAttribute('title')).toBe('Pause');
  });

  it('shows the play glyph and title while paused', () => {
    const engine = fakeEngine(pausedState);
    mountOverlay(document, engine as never, { density: 'coach' });
    const btn = document.querySelector('[data-act="pause"]') as HTMLElement;
    expect(btn.textContent).toBe('⏵');
    expect(btn.getAttribute('title')).toBe('Resume');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/overlayView.test.ts -t "state-aware"`
Expected: FAIL — the button currently renders the static `⏯` with title `Pause/Resume`.

- [ ] **Step 3: Implement the state-aware glyph**

In `src/ui/overlayView.ts`, add a reference to the pause button near the existing `densityBtn` lookup (after line ~93):

```ts
  const pauseBtn = root.querySelector('[data-act="pause"]') as HTMLButtonElement;
```

Then, inside `apply(state)`, after `root.dataset.status = state.status;`, update the button:

```ts
    const paused = state.status === 'paused';
    pauseBtn.textContent = paused ? '⏵' : '⏸';
    pauseBtn.title = paused ? 'Resume' : 'Pause';
```

(The static `⏯` in the `innerHTML` template can stay as-is — `apply()` runs on mount and overwrites it — but for clarity change the template button to `<button data-act="pause" title="Pause">⏸</button>`.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/overlayView.test.ts -t "state-aware"`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat(ui): state-aware play/pause glyph on overlay"
```

---

## Task 2: Drag-vs-click in mountOverlay

**Files:**
- Modify: `src/ui/overlayView.ts` (`OverlayOpts`, drag handling, CSS cursor)
- Test: `tests/overlayView.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `tests/overlayView.test.ts`. It dispatches `MouseEvent`s named like pointer events (jsdom has no real `PointerEvent`; `MouseEvent` carries `screenX`/`screenY`, which is all the handler reads). `pointerId` is therefore `undefined`, so the implementation must guard `setPointerCapture`/`releasePointerCapture` in try/catch.

```ts
function ptr(type: string, screenX: number, screenY: number) {
  return new MouseEvent(type, { screenX, screenY, button: 0, bubbles: true });
}

describe('drag vs click on the overlay body', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

  it('dragging past the threshold calls onDrag with deltas and does not pause', () => {
    const engine = fakeEngine(runningState);
    const deltas: Array<[number, number]> = [];
    mountOverlay(document, engine as never, {
      density: 'pill',
      onDrag: (dx, dy) => deltas.push([dx, dy]),
    });
    const root = document.querySelector('.ov-root') as HTMLElement;
    root.dispatchEvent(ptr('pointerdown', 100, 100));
    root.dispatchEvent(ptr('pointermove', 110, 105)); // 11.2px > 4px threshold
    root.dispatchEvent(ptr('pointermove', 120, 105)); // +10, +0
    root.dispatchEvent(ptr('pointerup', 120, 105));
    expect(deltas).toEqual([[10, 5], [10, 0]]);
    expect(engine.calls).not.toContain('pause');
  });

  it('a sub-threshold press is a click that toggles pause', () => {
    const engine = fakeEngine(runningState);
    const deltas: Array<[number, number]> = [];
    mountOverlay(document, engine as never, {
      density: 'pill',
      onDrag: (dx, dy) => deltas.push([dx, dy]),
    });
    const root = document.querySelector('.ov-root') as HTMLElement;
    root.dispatchEvent(ptr('pointerdown', 100, 100));
    root.dispatchEvent(ptr('pointermove', 102, 101)); // 2.2px < 4px threshold
    root.dispatchEvent(ptr('pointerup', 102, 101));
    expect(deltas).toEqual([]);
    expect(engine.calls).toContain('pause');
  });

  it('pointerdown on a control does not start a drag', () => {
    const engine = fakeEngine(runningState);
    const deltas: Array<[number, number]> = [];
    mountOverlay(document, engine as never, {
      density: 'coach',
      onDrag: (dx, dy) => deltas.push([dx, dy]),
    });
    const nextBtn = document.querySelector('[data-act="next"]') as HTMLElement;
    nextBtn.dispatchEvent(ptr('pointerdown', 100, 100));
    nextBtn.dispatchEvent(ptr('pointermove', 130, 130));
    nextBtn.dispatchEvent(ptr('pointerup', 130, 130));
    expect(deltas).toEqual([]);
    expect(engine.calls).not.toContain('pause');
  });

  it('without onDrag, a body click still toggles pause', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'pill' });
    (document.querySelector('.ov-root') as HTMLElement).click();
    expect(engine.calls).toContain('pause');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/overlayView.test.ts -t "drag vs click"`
Expected: FAIL — `onDrag` is not a recognized option and no pointer handling exists, so `deltas` stays empty and the drag case wrongly still toggles pause (the existing `click` listener fires).

- [ ] **Step 3: Add `onDrag` to the options type**

In `src/ui/overlayView.ts`, extend `OverlayOpts`:

```ts
export interface OverlayOpts {
  density: Density;
  onToggleDensity?: () => void;
  onStop?: () => void;
  /** Drag the overlay body to reposition the host window. dx/dy are screen-px
   *  deltas since the last move. When omitted, the body is click-only (no drag). */
  onDrag?: (dx: number, dy: number) => void;
}
```

- [ ] **Step 4: Replace the body click handler with drag-aware handling**

In `src/ui/overlayView.ts`, find the existing body click handler:

```ts
  root.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('.ov-ctrls')) return; // controls handled below
    const st = engine.getState();
    if (st.status === 'paused') engine.resume();
    else engine.pause();
  });
```

Replace it with a shared toggle helper plus drag-or-click handling. When `onDrag`
is provided, use pointer events with a 4px threshold; otherwise keep the simple
click listener (unchanged behavior):

```ts
  const DRAG_THRESHOLD_PX = 4;
  const togglePause = () => {
    const st = engine.getState();
    if (st.status === 'paused') engine.resume();
    else engine.pause();
  };

  if (opts.onDrag) {
    root.style.cursor = 'grab';
    let active = false;
    let dragging = false;
    let startX = 0, startY = 0, lastX = 0, lastY = 0;

    root.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement).closest('.ov-ctrls')) return;
      active = true;
      dragging = false;
      startX = lastX = ev.screenX;
      startY = lastY = ev.screenY;
      try { root.setPointerCapture(ev.pointerId); } catch { /* jsdom / no pointerId */ }
    });

    root.addEventListener('pointermove', (ev) => {
      if (!active) return;
      if (!dragging && Math.hypot(ev.screenX - startX, ev.screenY - startY) > DRAG_THRESHOLD_PX) {
        dragging = true;
        root.style.cursor = 'grabbing';
      }
      if (dragging) {
        opts.onDrag!(ev.screenX - lastX, ev.screenY - lastY);
        lastX = ev.screenX;
        lastY = ev.screenY;
      }
    });

    const finish = (ev: PointerEvent) => {
      if (!active) return;
      active = false;
      root.style.cursor = 'grab';
      try { root.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
      if (!dragging) togglePause(); // a press with no real movement is a click
    };
    root.addEventListener('pointerup', finish);
    root.addEventListener('pointercancel', finish);
  } else {
    root.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.ov-ctrls')) return;
      togglePause();
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/overlayView.test.ts -t "drag vs click"`
Expected: PASS (all four cases).

- [ ] **Step 6: Run the full overlay test file**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: PASS — existing tests (including the original "clicking the body toggles pause/resume") still pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat(ui): drag overlay body to reposition; distinguish drag from click"
```

---

## Task 3: Electron IPC to move the overlay window

**Files:**
- Modify: `src/electron.d.ts`
- Modify: `electron/preload.cjs`
- Modify: `electron/app.cjs`

This wiring crosses the contextBridge into the main process and is verified
manually (consistent with the project's "thin shells verified by hand"
convention) — there are no automated tests for it.

- [ ] **Step 1: Add `moveOverlayBy` to the typed bridge**

In `src/electron.d.ts`, add to the `ElectronAPI` interface (after `stopSession`):

```ts
  /** Overlay window → main: move the overlay window by a screen-px delta. */
  moveOverlayBy(dx: number, dy: number): void;
```

- [ ] **Step 2: Expose `moveOverlayBy` in the preload bridge**

In `electron/preload.cjs`, add to the `exposeInMainWorld('electronAPI', { ... })` object (alongside `stopSession`):

```js
  moveOverlayBy: (dx, dy) => ipcRenderer.send('move-overlay-by', { dx, dy }),
```

- [ ] **Step 3: Handle `move-overlay-by` in the main process**

In `electron/app.cjs`, add an IPC handler next to the existing
`ipcMain.on('stop-session', ...)`:

```js
ipcMain.on('move-overlay-by', (_event, { dx, dy }) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    const [x, y] = overlayWin.getPosition();
    overlayWin.setPosition(Math.round(x + dx), Math.round(y + dy));
  }
});
```

- [ ] **Step 4: Persist bounds on overlay close**

In `electron/app.cjs`, inside `openOverlay`, the `saveBounds` helper and its
`'moved'`/`'resized'` listeners already exist. Add a `'close'` listener so a
JS-moved position is remembered even if macOS doesn't fire `'moved'` for a
programmatic `setPosition`. Find:

```js
  overlayWin.on('moved', saveBounds);
  overlayWin.on('resized', saveBounds);
```

and add below it:

```js
  overlayWin.on('close', saveBounds); // JS-driven setPosition may not fire 'moved'
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — no type errors from the new `moveOverlayBy` signature.

- [ ] **Step 6: Commit**

```bash
git add src/electron.d.ts electron/preload.cjs electron/app.cjs
git commit -m "feat(electron): move-overlay-by IPC; persist bounds on close"
```

---

## Task 4: Wire onDrag in the Electron overlay entry

**Files:**
- Modify: `src/overlay-entry.ts`

- [ ] **Step 1: Pass `onDrag` into mountOverlay**

In `src/overlay-entry.ts`, find the `mountOverlay(document, engine, { ... })`
call and add an `onDrag` handler to the options object (alongside
`onToggleDensity` and `onStop`):

```ts
    onDrag: (dx, dy) => window.electronAPI?.moveOverlayBy(dx, dy),
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/overlay-entry.ts
git commit -m "feat(electron): drag the overlay body to move the native window"
```

---

## Task 5: Remove the grip from overlay.html

**Files:**
- Modify: `overlay.html`

- [ ] **Step 1: Remove the grip element**

In `overlay.html`, delete the grip div in `<body>`:

```html
    <div id="grip"><div></div></div>
```

so `<body>` contains only the `<script type="module" src="/src/overlay-entry.ts"></script>`.

- [ ] **Step 2: Remove the grip and no-drag CSS**

In `overlay.html`, delete these style rules (the grip comment block, `#grip`,
`#grip > div`, and the `.ov-root { -webkit-app-region: no-drag }` rule):

```css
      /* Frameless window has no title bar; this strip is the drag handle.
         The overlay body below stays clickable (no-drag) for pause/controls. */
      #grip {
        flex: 0 0 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        -webkit-app-region: drag;
      }
      #grip > div {
        width: 36px;
        height: 4px;
        border-radius: 2px;
        background: rgba(255, 255, 255, 0.45);
      }
      .ov-root {
        -webkit-app-region: no-drag;
      }
```

Leave the `html, body` and `body { display:flex; ... }` rules intact.

- [ ] **Step 3: Build to verify the entry still compiles**

Run: `npm run build`
Expected: PASS — Vite builds `index.html` + `overlay.html` with no errors.

- [ ] **Step 4: Commit**

```bash
git add overlay.html
git commit -m "feat(electron): remove grip strip now that the whole overlay drags"
```

---

## Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all Vitest files green.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual Electron check (cannot be automated)**

Run: `npm run electron:dev`, start a workout, then in the overlay window:
- Drag anywhere on the overlay body → the window moves and follows the cursor.
- A single click (no movement) → toggles pause/resume; the button glyph flips
  between `⏸` (running) and `⏵` (paused).
- Clicking `⏮ ⏭ ⏵/⏸ ⏹` and the density toggle still works (no drag triggered).
- Quit and relaunch → the overlay reopens at its last dragged position.

---

## Self-review notes

- **Spec coverage:** (1) drag body → Tasks 2/3/4; drag-vs-click threshold → Task 2;
  (2) state-aware glyph → Task 1; Electron IPC/`setPosition`/bounds-on-close →
  Task 3; `onDrag` wiring → Task 4; grip removal → Task 5; tests → Tasks 1–2;
  manual verification → Task 6. No gaps.
- **Type consistency:** `onDrag(dx, dy)` and `moveOverlayBy(dx, dy)` signatures
  match across `OverlayOpts`, `ElectronAPI`, preload, and the `overlay-entry.ts`
  call site. Glyphs `⏸`/`⏵` are used consistently in Task 1 and Task 6.
- **No placeholders:** every code/command step shows concrete content.
