# Stroke Pace Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a slim vertical "stroke pace bar" to the running overlay, right of the countdown, that animates the rowing drive→recovery cycle (fast fill / slow drain) paced to the segment's recommended stroke rate.

**Architecture:** A numeric `spm` is added to `INTENSITY_META`. The overlay gains a CSS-keyframe bar whose cycle length is one CSS variable (`--stroke-period = 60/spm`s) and whose color is another (`--stroke-color = intensity color`), both set in the existing `apply()` on every tick. No per-frame JS, no new timers — the animation runs on the compositor and inherits pause via `animation-play-state`. A coach-only `DRIVE`/`RECOVER` caption cross-fades on the same period.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest + jsdom (no globals), CSS keyframes.

**Spec:** `docs/superpowers/specs/2026-06-06-stroke-pace-bar-design.md`

---

### Task 1: Numeric `spm` on `INTENSITY_META`

**Files:**
- Modify: `src/core/types.ts:18-30`
- Test: `tests/types.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe('INTENSITY_META', ...)` in `tests/types.test.ts` (after the `spmLabel` test, before the `kind` test):

```ts
  it('carries a numeric spm for pacing (all-out uses the 30 lower bound)', () => {
    expect(INTENSITY_META.easy.spm).toBe(24);
    expect(INTENSITY_META.medium.spm).toBe(26);
    expect(INTENSITY_META.hard.spm).toBe(28);
    expect(INTENSITY_META.allout.spm).toBe(30);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — `spm` is not a property of the meta objects (TS error / `undefined`).

- [ ] **Step 3: Add the field and values**

In `src/core/types.ts`, add `spm` to the interface:

```ts
export interface IntensityMeta {
  label: string; // 'Easy', 'Medium', 'Hard', 'All-out'
  color: string; // hex used by the overlay
  spmLabel: string; // recommended stroke rate, e.g. '24' or '30–32'
  spm: number; // numeric pace target for the stroke bar, e.g. 30
  kind: 'rest' | 'work';
}
```

And populate each entry (keep `spmLabel` exactly as-is — it holds the EN-DASH):

```ts
export const INTENSITY_META: Record<Intensity, IntensityMeta> = {
  easy: { label: 'Easy', color: '#34d399', spmLabel: '24', spm: 24, kind: 'rest' },
  medium: { label: 'Medium', color: '#fbbf24', spmLabel: '26', spm: 26, kind: 'rest' },
  hard: { label: 'Hard', color: '#ff8c42', spmLabel: '28', spm: 28, kind: 'work' },
  allout: { label: 'All-out', color: '#ff4d4f', spmLabel: '30–32', spm: 30, kind: 'work' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS (all INTENSITY_META tests green).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/types.test.ts
git commit -m "feat(types): add numeric spm to INTENSITY_META"
```

---

### Task 2: `strokePeriodSec` helper

**Files:**
- Modify: `src/ui/overlayView.ts` (add exported helper near `spmLabel`, ~line 12-15)
- Test: `tests/overlayView.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/overlayView.test.ts`, add `strokePeriodSec` to the existing import on line 2:

```ts
import { formatCountdown, spmLabel, comingUpLabel, mountOverlay, densityIcon, strokePeriodSec } from '../src/ui/overlayView';
```

Then add this describe block after the `spmLabel` describe (around line 21):

```ts
describe('strokePeriodSec', () => {
  it('is 60 / spm seconds for one full stroke', () => {
    expect(strokePeriodSec('easy')).toBe(2.5);     // 60/24
    expect(strokePeriodSec('hard')).toBeCloseTo(2.142857, 5); // 60/28
    expect(strokePeriodSec('allout')).toBe(2);      // 60/30
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/overlayView.test.ts -t strokePeriodSec`
Expected: FAIL — `strokePeriodSec` is not exported / not a function.

- [ ] **Step 3: Add the helper**

In `src/ui/overlayView.ts`, add directly below the `spmLabel` function (after line 15):

```ts
/** Seconds for one full stroke (drive + recovery) at the intensity's pace. */
export function strokePeriodSec(i: Intensity): number {
  return 60 / INTENSITY_META[i].spm;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/overlayView.test.ts -t strokePeriodSec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat(overlay): add strokePeriodSec pacing helper"
```

---

### Task 3: Render and wire the stroke bar

**Files:**
- Modify: `src/ui/overlayView.ts` — `OVERLAY_CSS` (lines 27-59), `mountOverlay` innerHTML (line 97-114), `apply()` (lines 137-161)
- Test: `tests/overlayView.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/overlayView.test.ts`, extend the types import on line 4 to include `INTENSITY_META`:

```ts
import { INTENSITY_META, type Segment } from '../src/core/types';
```

Add this describe block at the end of the file:

```ts
describe('stroke pace bar', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

  it('renders the stroke fill and paces it to the segment spm + color', () => {
    // runningState.segment.intensity === 'hard' → 60/28 = 2.142.. → "2.14s"
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'coach' });
    expect(document.querySelector('.ov-stroke-fill')).not.toBeNull();
    const root = document.querySelector('.ov-root') as HTMLElement;
    expect(root.style.getPropertyValue('--stroke-period')).toBe('2.14s');
    expect(root.style.getPropertyValue('--stroke-color')).toBe(INTENSITY_META.hard.color);
  });

  it('keeps the countdown in a row beside the stroke widget', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'pill' });
    const row = document.querySelector('.ov-count-row') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.querySelector('.ov-count')).not.toBeNull();
    expect(row.querySelector('.ov-stroke-fill')).not.toBeNull();
  });

  it('paces an all-out segment to a clean 2.00s', () => {
    const state: SessionState = {
      ...runningState,
      segment: { id: 'a', intensity: 'allout', durationSec: 60 },
    };
    const engine = fakeEngine(state);
    mountOverlay(document, engine as never, { density: 'pill' });
    const root = document.querySelector('.ov-root') as HTMLElement;
    expect(root.style.getPropertyValue('--stroke-period')).toBe('2.00s');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/overlayView.test.ts -t "stroke pace bar"`
Expected: FAIL — `.ov-stroke-fill` / `.ov-count-row` not found; `--stroke-period` empty.

- [ ] **Step 3: Add the CSS**

In `src/ui/overlayView.ts`, change the existing `.ov-count` rule (line 35-36) to drop its vertical margin (the new row owns it):

```css
  .ov-count { font-weight:800; line-height:1; font-variant-numeric:tabular-nums;
    font-size:54px; margin:0; }
```

Then, immediately before the closing backtick of `OVERLAY_CSS` (after the `.ov-flash` rule on line 58), insert:

```css
  /* Stroke pace bar — fills fast on the drive (0→33%), drains slowly on the
     recovery (33→100%). Period = 60/spm via --stroke-period; pure CSS so it
     runs the same in PiP and Electron and pauses with the card. */
  .ov-count-row { display:flex; align-items:flex-end; justify-content:space-between;
    gap:14px; margin:6px 0 10px; }
  .ov-stroke { display:flex; flex-direction:column; align-items:center; gap:6px; flex:0 0 auto; }
  .ov-stroke-track { width:16px; height:46px; border-radius:8px; background:rgba(255,255,255,.15);
    overflow:hidden; display:flex; align-items:flex-end; }
  .ov-stroke-fill { display:block; width:100%; height:10%; border-radius:8px;
    background:var(--stroke-color,#fff); animation: ov-stroke var(--stroke-period,2s) infinite; }
  @keyframes ov-stroke {
    0%   { height:10%;  animation-timing-function: cubic-bezier(.2,.7,.3,1); }
    33%  { height:100%; animation-timing-function: cubic-bezier(.4,0,.6,1); }
    100% { height:10%; }
  }
  .ov-stroke-cap { display:none; position:relative; height:11px; width:100%; text-align:center;
    font-size:9px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; opacity:.6; }
  .ov-root[data-density="coach"] .ov-stroke-cap { display:block; }
  .ov-stroke-cap > span { position:absolute; left:50%; transform:translateX(-50%); white-space:nowrap; }
  .ov-stroke-cap .sd { animation: ov-cap-d var(--stroke-period,2s) infinite steps(1); }
  .ov-stroke-cap .sr { animation: ov-cap-r var(--stroke-period,2s) infinite steps(1); }
  @keyframes ov-cap-d { 0%{opacity:1} 33.34%{opacity:0} 100%{opacity:0} }
  @keyframes ov-cap-r { 0%{opacity:0} 33.34%{opacity:1} 100%{opacity:1} }
  .ov-root[data-status="paused"] .ov-stroke-fill,
  .ov-root[data-status="paused"] .ov-stroke-cap > span { animation-play-state: paused; }
  @media (prefers-reduced-motion: reduce) {
    .ov-stroke-fill { animation: none; height: 55%; }
    .ov-stroke-cap,
    .ov-root[data-density="coach"] .ov-stroke-cap { display: none; }
  }
```

- [ ] **Step 4: Add the DOM**

In `mountOverlay`'s `root.innerHTML` (line 97-114), replace the single count line:

```html
    <div class="ov-count"></div>
```

with the count row + stroke widget:

```html
    <div class="ov-count-row">
      <div class="ov-count"></div>
      <div class="ov-stroke" aria-hidden="true">
        <div class="ov-stroke-track"><span class="ov-stroke-fill"></span></div>
        <div class="ov-stroke-cap"><span class="sd">DRIVE</span><span class="sr">RECOVER</span></div>
      </div>
    </div>
```

- [ ] **Step 5: Wire the period + color in `apply()`**

In `apply()`, just after the existing progress-bar block (after line 158 `bar.style.background = meta.color;`), add:

```ts
    // Stroke bar: pace to this segment's spm and tint to its color.
    root.style.setProperty('--stroke-period', `${strokePeriodSec(seg.intensity).toFixed(2)}s`);
    root.style.setProperty('--stroke-color', meta.color);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: PASS — new `stroke pace bar` tests green AND every pre-existing overlayView test still green (the `.ov-count` text/countdown queries still resolve through the nested element).

- [ ] **Step 7: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat(overlay): stroke pace bar right of the countdown"
```

---

### Task 4: Full verification

**Files:** none (verification + manual check only)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: PASS — all files, no failures.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Manual — browser (Document PiP)**

Run: `npm run dev`, open in Chrome, start a workout, pop out the overlay.
Confirm: the bar fills fast then drains slowly; cadence visibly slows from all-out (≈2.0s) to easy (≈2.5s); clicking to pause freezes the bar; coach mode shows the `DRIVE`/`RECOVER` caption swapping, pill mode hides it.

- [ ] **Step 4: Manual — Electron**

Run: `npm run electron:dev`, start a workout.
Confirm: the bar animates the same in the native always-on-top window and the window still hugs the card (no height jump on density toggle).

- [ ] **Step 5: Final commit (only if Steps 3–4 surfaced tweaks)**

```bash
git add -A
git commit -m "fix(overlay): stroke bar manual-verification tweaks"
```

---

## Notes for the implementer

- **Do not touch `spmLabel`** — `tests/types.test.ts` asserts the exact EN-DASH `'30–32'`. The numeric `spm` is a separate field.
- **`strokePeriodSec` is the only unit-tested logic.** The animation is CSS and is verified manually, consistent with the rest of the overlay UI.
- **Why CSS vars, not direct style** — the color goes through `--stroke-color` (not `fill.style.background`) so the test can assert it deterministically; jsdom round-trips custom-property strings exactly but normalizes some color shorthands.
- **No new height** — the widget is shorter than the 54px countdown, so the Electron `ResizeObserver` hug is unaffected during running.
