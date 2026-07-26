# Stroke Phase Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a segment boundary changes the recommended stroke rate, the overlay's stroke pace bar keeps its place in the drive/recovery cycle and only changes rate, instead of jumping back to the catch.

**Architecture:** The bar stays a pure-CSS animation timed by the `--stroke-period` custom property. The only new behavior is *re-anchoring*: when the period changes, read the running animation's `currentTime` via the Web Animations API, convert it to a phase fraction, write the new period, then write the equivalent `currentTime` back onto the bar and both caption animations. All of the work lives in `src/ui/overlayView.ts`.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest in jsdom (no globals — import from `vitest`), Web Animations API (`Element.getAnimations()`, `Animation.currentTime`).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-26-stroke-phase-continuity-design.md`. Read it before starting.
- **What is preserved:** the **phase fraction** of the drive/recovery cycle. The change is **instant** at the boundary — no ramp or blend.
- **Rounding:** the period used for the phase math must be the same **rounded** value written into the CSS (`toFixed(2)`), so the JS never disagrees with what the browser is running. Existing tests assert the exact strings `'2.14s'` (hard) and `'2.00s'` (all-out) — do not change that formatting.
- **Degrade silently:** where `Element.getAnimations` is missing (jsdom) or returns nothing (`prefers-reduced-motion` sets `animation: none` on `.ov-stroke-fill`), write the property and return. No crash, and no branching on environment.
- **Do not touch** `src/core/sessionEngine.ts`, `src/core/generator.ts`, `electron/`, or `src/shell/`. The transition flash, the tone cues, and the fixed 33/67 drive:recovery split in `@keyframes ov-stroke-bar` are unchanged.
- **Never** replace the EN DASH (U+2013) in the all-out spm label `'30–32'` with a hyphen.
- `OVERLAY_CSS` is a template literal: a backtick or `${` inside a CSS comment silently ends the string. This plan does not change the CSS, so leave it alone.
- Run `npm test` and `npm run typecheck` before every commit. Both must be clean.
- Commit messages must **not** add any agent name as co-author.

---

### Task 1: The phase-math helper

Pure function, no DOM. It converts an animation's local time under an old period into the local time that lands on the same phase under a new period.

**Files:**
- Modify: `src/ui/overlayView.ts` (add an exported function directly below `strokePeriodSec`, which ends at line 20)
- Test: `tests/overlayView.test.ts` (add a `describe` block directly below the existing `describe('strokePeriodSec')`, which ends at line 30)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function retimedStrokeMs(currentMs: number, oldPeriodSec: number, newPeriodSec: number): number` — Task 2 calls this.

- [ ] **Step 1: Write the failing tests**

Add to `tests/overlayView.test.ts`, immediately after the `describe('strokePeriodSec', ...)` block. Also add `retimedStrokeMs` to the existing import from `'../src/ui/overlayView'` on line 2.

```ts
describe('retimedStrokeMs', () => {
  // The stroke cycle is drive 0→33%, recovery 33→100%, at any rate.
  it('keeps the same point in the cycle when the rate changes', () => {
    // half a stroke in at 24 spm (2.5s) → half a stroke in at 30 spm (2.0s)
    expect(retimedStrokeMs(1250, 2.5, 2)).toBe(1000);
  });

  it('keeps a mid-drive position mid-drive', () => {
    // 0.165 of the cycle = halfway through the 0→33% drive
    expect(retimedStrokeMs(0.165 * 2500, 2.5, 2)).toBeCloseTo(0.165 * 2000, 6);
  });

  it('lands exactly on the drive/recovery boundary', () => {
    expect(retimedStrokeMs(0.33 * 2500, 2.5, 2)).toBeCloseTo(0.33 * 2000, 6);
  });

  it('keeps the catch at the catch', () => {
    expect(retimedStrokeMs(0, 2.5, 2)).toBe(0);
  });

  it('reduces a local time that has run for many iterations', () => {
    // 40.5 cycles of 2.5s: the half-cycle is what carries over, not the 40
    expect(retimedStrokeMs(101250, 2.5, 2)).toBe(1000);
  });

  it('is the identity when the period does not change', () => {
    expect(retimedStrokeMs(1234, 2.5, 2.5)).toBeCloseTo(1234, 6);
  });

  it('normalises a negative local time into the cycle', () => {
    // -0.2 of a cycle is 0.8 of a cycle
    expect(retimedStrokeMs(-500, 2.5, 2)).toBeCloseTo(1600, 6);
  });

  it('returns 0 rather than NaN when there is no old period to divide by', () => {
    // the very first call on mount has no previous period
    expect(retimedStrokeMs(1000, 0, 2)).toBe(0);
    expect(retimedStrokeMs(1000, -1, 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/overlayView.test.ts -t "retimedStrokeMs"
```

Expected: FAIL. Vitest reports that `retimedStrokeMs` is not exported by `src/ui/overlayView.ts` (the whole file fails to import).

- [ ] **Step 3: Write the implementation**

In `src/ui/overlayView.ts`, directly below `strokePeriodSec`:

```ts
/** Local time (ms) that keeps a stroke animation at the same point in its cycle
 *  after its period changes: the phase fraction is preserved, only the rate moves.
 *  Returns 0 when there is no old period to divide by (the first call on mount). */
export function retimedStrokeMs(
  currentMs: number,
  oldPeriodSec: number,
  newPeriodSec: number,
): number {
  if (!(oldPeriodSec > 0)) return 0;
  // `% 1` keeps the sign, so a negative local time needs the extra wrap.
  const phase = (((currentMs / 1000 / oldPeriodSec) % 1) + 1) % 1;
  return phase * newPeriodSec * 1000;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/overlayView.test.ts -t "retimedStrokeMs"
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and the typechecker**

```bash
npm test && npm run typecheck
```

Expected: all test files pass; `tsc --noEmit` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat(overlay): add stroke phase re-anchoring math"
```

---

### Task 2: Re-anchor the running animations on a rate change

Wire the helper into `mountOverlay` so the bar and both captions are re-anchored whenever the period changes — on a natural transition and on a manual ⏮ / ⏭ skip alike.

**Files:**
- Modify: `src/ui/overlayView.ts` — add `setStrokePeriod` just above `const apply = ...` (line 199), and replace the `--stroke-period` write inside `apply` (line 222)
- Test: `tests/overlayView.test.ts` (add a new `describe` block at the end of the file, after `describe('stroke pace bar')`)

**Interfaces:**
- Consumes: `retimedStrokeMs(currentMs: number, oldPeriodSec: number, newPeriodSec: number): number` from Task 1; `strokePeriodSec(i: Intensity): number` (already exported).
- Produces: nothing new for other tasks — the change is internal to `mountOverlay`.

- [ ] **Step 1: Write the failing tests**

Add at the end of `tests/overlayView.test.ts`. Note the existing module-level `runningState` (line 62) is `hard` / 2.14s, and the existing `fakeEngine` (line 48) cannot emit events — this block needs its own emitting fake.

```ts
describe('stroke phase continuity across segments', () => {
  type FakeAnim = { currentTime: number | null };

  const STROKE_SELECTORS = ['.ov-stroke-fill', '.ov-cap-drive', '.ov-cap-recover'];

  // jsdom has no Web Animations API, so stand one up: every stroke element
  // reports a single fake animation whose currentTime the overlay can seek.
  function stubAnimations(): Map<string, FakeAnim> {
    const anims = new Map<string, FakeAnim>(
      STROKE_SELECTORS.map((sel) => [sel, { currentTime: 0 }]),
    );
    Element.prototype.getAnimations = function (this: Element) {
      for (const [sel, anim] of anims) {
        if (this.matches(sel)) return [anim as unknown as Animation];
      }
      return [];
    };
    return anims;
  }

  // The shared fakeEngine swallows listeners; this one can drive a tick.
  function tickingEngine(initial: SessionState) {
    let state = initial;
    const listeners: Array<(e: { type: string; state: SessionState }) => void> = [];
    return {
      on(fn: (e: { type: string; state: SessionState }) => void) {
        listeners.push(fn);
        return () => {};
      },
      getState: () => state,
      tickTo(next: SessionState) {
        state = next;
        for (const fn of listeners) fn({ type: 'tick', state: next });
      },
      pause: () => {}, resume: () => {}, skipNext: () => {}, skipPrev: () => {}, stop: () => {},
    };
  }

  const alloutState: SessionState = {
    ...runningState,
    currentIndex: 2,
    segment: { id: 'y', intensity: 'allout', durationSec: 60 },
  };

  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });
  afterEach(() => { delete (Element.prototype as Partial<Element>).getAnimations; });

  it('carries the stroke phase across a rate change instead of restarting it', () => {
    const anims = stubAnimations();
    const engine = tickingEngine(runningState); // hard → 2.14s
    mountOverlay(document, engine as never, { density: 'coach' });

    // Halfway through the cycle at 2.14s — i.e. deep in the recovery.
    for (const anim of anims.values()) anim.currentTime = 1070;

    engine.tickTo(alloutState); // all-out → 2.00s

    const root = document.querySelector('.ov-root') as HTMLElement;
    expect(root.style.getPropertyValue('--stroke-period')).toBe('2.00s');
    // still halfway through the cycle, now at the faster rate
    for (const sel of STROKE_SELECTORS) {
      expect(anims.get(sel)!.currentTime).toBeCloseTo(1000, 6);
    }
  });

  it('leaves the running animations alone when the rate is unchanged', () => {
    const anims = stubAnimations();
    const engine = tickingEngine(runningState);
    mountOverlay(document, engine as never, { density: 'coach' });

    for (const anim of anims.values()) anim.currentTime = 777;
    // a different segment, same intensity → same period → nothing to re-anchor
    engine.tickTo({
      ...runningState,
      currentIndex: 3,
      segment: { id: 'z', intensity: 'hard', durationSec: 60 },
    });

    for (const sel of STROKE_SELECTORS) {
      expect(anims.get(sel)!.currentTime).toBe(777);
    }
  });

  it('still paces the bar in a host with no Web Animations API', () => {
    // no stubAnimations() here: this is plain jsdom, and reduced motion
    // (animation: none) looks the same to the overlay.
    const engine = tickingEngine(runningState);
    mountOverlay(document, engine as never, { density: 'pill' });
    expect(() => engine.tickTo(alloutState)).not.toThrow();
    const root = document.querySelector('.ov-root') as HTMLElement;
    expect(root.style.getPropertyValue('--stroke-period')).toBe('2.00s');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/overlayView.test.ts -t "stroke phase continuity"
```

Expected: FAIL — the first test reports `currentTime` still `1070` (the overlay writes the property but never re-anchors). The third test should already pass.

- [ ] **Step 3: Add the re-anchoring step**

In `src/ui/overlayView.ts`, insert this directly **above** `const apply = (state: SessionState) => {`:

```ts
  // The stroke bar is a CSS animation, so writing --stroke-period alone would keep
  // the animation's elapsed time and drop it at an arbitrary phase — with segment
  // durations always a multiple of 5s, usually right back at the catch. Re-anchor
  // instead: a rate change mid-stroke keeps the rower's place in the cycle. Fires
  // on any period change, so manual skips get the same handoff as a transition.
  const strokeSelectors = ['.ov-stroke-fill', '.ov-cap-drive', '.ov-cap-recover'];
  const animationsOf = (sel: string): Animation[] => $(sel).getAnimations?.() ?? [];
  let strokePeriod = 0; // the rounded seconds last written to --stroke-period

  const setStrokePeriod = (next: number) => {
    if (next === strokePeriod) return; // the common case on every tick
    // Read the phase before the write, while the old period still applies.
    let currentMs: number | null = null;
    for (const anim of animationsOf('.ov-stroke-fill')) {
      if (typeof anim.currentTime === 'number') {
        currentMs = anim.currentTime;
        break;
      }
    }
    const prev = strokePeriod;
    strokePeriod = next;
    root.style.setProperty('--stroke-period', `${next.toFixed(2)}s`);
    if (currentMs === null) return; // reduced motion, or a host without getAnimations
    // One phase for all three, so the bar and its DRIVE/RECOVER caption stay locked.
    const at = retimedStrokeMs(currentMs, prev, next);
    for (const sel of strokeSelectors) {
      for (const anim of animationsOf(sel)) anim.currentTime = at;
    }
  };
```

- [ ] **Step 4: Route `apply` through it**

In `src/ui/overlayView.ts`, inside `apply`, replace these two lines:

```ts
    // Stroke bar: pace to this segment's spm and tint to its color.
    root.style.setProperty('--stroke-period', `${strokePeriodSec(seg.intensity).toFixed(2)}s`);
```

with:

```ts
    // Stroke bar: pace to this segment's spm and tint to its color. Round before
    // handing it over, so the phase math uses exactly the period the CSS runs at.
    setStrokePeriod(Number(strokePeriodSec(seg.intensity).toFixed(2)));
```

Leave the `--stroke-color` line directly below it untouched.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/overlayView.test.ts -t "stroke phase continuity"
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Run the full suite and the typechecker**

```bash
npm test && npm run typecheck
```

Expected: all test files pass — including the existing `describe('stroke pace bar')` tests, which still assert `'2.14s'` and `'2.00s'`; `tsc --noEmit` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat(overlay): keep the stroke phase across segment boundaries"
```

---

### Task 3: Verify the handoff in a real browser

jsdom cannot run a CSS animation and the harness renders static cards, so the actual smoothness needs eyes on a running session. This task writes no code.

**Files:** none.

**Interfaces:**
- Consumes: the finished behavior from Task 2.
- Produces: nothing.

- [ ] **Step 1: Build a short workout**

```bash
npm run dev
```

Open `http://localhost:5173` in Chrome and start a 10-minute workout. It opens a Document Picture-in-Picture overlay.

- [ ] **Step 2: Watch a boundary between two different intensities**

Use the ⏭ button to step to a boundary where the intensity changes (easy 24 spm → medium 26 → hard 28 → all-out 30 all have different periods; the bar's color changes when the intensity does).

Expected: at the moment the color and label change, the bar keeps travelling in the same direction from wherever it was — it does **not** snap to the bottom of the track and start a fresh drive. Only the speed changes. In coach density, the `DRIVE` / `RECOVER` caption stays consistent with which way the bar is moving.

- [ ] **Step 3: Check the paused case**

Pause (click the card) mid-stroke, press ⏭ to cross into a different intensity, then resume.

Expected: the bar stays frozen while paused, and on resume continues from the same point in the cycle at the new rate.

- [ ] **Step 4: Report**

Note anything that still looks like a jump — including *which* two intensities it was between — so it can be diagnosed against the phase math rather than guessed at.
