# Stroke Pace Bar — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)
**Area:** Overlay UI (`src/ui/overlayView.ts`, `src/core/types.ts`)

## Summary

Add a slim, always-on-top **stroke pace indicator** to the running overlay,
placed in the empty area to the right of the countdown. It animates the rowing
**drive → recovery** cycle as a vertical bar that fills fast (the drive) and
drains slowly (the recovery), paced to the segment's recommended stroke rate.

The rower can glance at it peripherally to hold cadence without reading numbers.

## Motivation

A rowing stroke is one **drive** (the pull) followed by a longer **recovery**
(the glide back), in roughly a 1:2 time ratio — "1‑2‑3", where 1 is the drive
and 2‑3 is the recovery. The overlay already recommends a stroke rate (spm) per
intensity but gives no sense of the *rhythm within* a stroke. The pace bar makes
that rhythm visible and synced to the target spm.

## Decisions (resolved during brainstorming)

- **Form:** vertical "power bar" — fills on the drive, drains on the recovery.
  Chosen over a sliding seat / pulse ring / 1‑2‑3 beads for its compact size,
  strong peripheral read, and consistency with the existing progress bar.
- **All-out pace:** 30 spm (lower bound of the "30–32" range) → a clean 2.00s
  cycle.
- **Drive vs. recovery cue:** **speed only** — same solid color throughout; the
  fast-fill / slow-drain asymmetry alone signals the phase. Quietest option.
- **When shown:** **every block** (easy 24 → all-out 30), not just work blocks.
- **Caption:** a `DRIVE` / `RECOVER` label shown **only in coach mode**; pill
  mode stays pure numbers.

## Timing model

- A stroke cycle lasts `T = 60 / spm` seconds.
- The drive occupies the first **1/3** of the cycle; the recovery the remaining
  **2/3** (the 1:2 ratio).
- Per intensity (`T` rounded to 2 dp for display only):

  | Intensity | spm | cycle T | drive | recovery |
  |-----------|-----|---------|-------|----------|
  | easy      | 24  | 2.50s   | 0.83s | 1.67s    |
  | medium    | 26  | 2.31s   | 0.77s | 1.54s    |
  | hard      | 28  | 2.14s   | 0.71s | 1.43s    |
  | all-out   | 30  | 2.00s   | 0.67s | 1.33s    |

## Data model change

Add a numeric `spm` to `IntensityMeta` (`src/core/types.ts`). `spmLabel` stays
for display (it carries the EN-DASH `'30–32'` that existing tests assert — leave
it untouched).

```ts
export interface IntensityMeta {
  label: string;
  color: string;
  spmLabel: string;   // display, e.g. '30–32'
  spm: number;        // numeric pace target, e.g. 30
  kind: 'rest' | 'work';
}
```

Values: easy `24`, medium `26`, hard `28`, all-out `30`.

## Pure helper (unit-tested)

In `overlayView.ts`, exported alongside `spmLabel`:

```ts
export function strokePeriodSec(i: Intensity): number {
  return 60 / INTENSITY_META[i].spm;
}
```

This is the single testable seam. The animation itself is CSS and is verified
manually, consistent with how the rest of the overlay UI is treated.

## DOM

Wrap the existing countdown in a flex row and add the stroke widget beside it.
Today (`mountOverlay` innerHTML):

```html
<div class="ov-count"></div>
```

becomes:

```html
<div class="ov-count-row">
  <div class="ov-count"></div>
  <div class="ov-stroke" aria-hidden="true">
    <div class="ov-stroke-track"><span class="ov-stroke-fill"></span></div>
    <div class="ov-stroke-cap"><span class="ov-cap-drive">DRIVE</span><span class="ov-cap-recover">RECOVER</span></div>
  </div>
</div>
```

`aria-hidden` because it's a decorative pacing cue, not information a screen
reader needs (the spm number already conveys the target).

## CSS (injected via `OVERLAY_CSS`)

Layout — the row keeps the countdown's existing vertical margins so nothing
shifts:

```css
.ov-count-row { display:flex; align-items:flex-end; justify-content:space-between;
  gap:14px; margin:6px 0 10px; }
.ov-count { margin:0; }                 /* row now owns the margin */
.ov-stroke { display:flex; flex-direction:column; align-items:center; gap:6px; flex:0 0 auto; }
.ov-stroke-track { width:16px; height:46px; border-radius:8px;
  background:rgba(255,255,255,.15); overflow:hidden; display:flex; align-items:flex-end; }
/* top corners round the fill when the bar is short; bottom corners are clipped
   by the track's overflow:hidden. */
.ov-stroke-fill { display:block; width:100%; height:10%; border-radius:8px 8px 0 0;
  background:var(--stroke-color,#fff); animation: ov-stroke-bar var(--stroke-period,2s) infinite; }
```

Animation — drive (0→33%) quick-out, recovery (33→100%) smooth. (Keyframe name
is `ov-stroke-bar`, distinct from the `.ov-stroke` container class.):

```css
@keyframes ov-stroke-bar {
  0%   { height:10%;  animation-timing-function: cubic-bezier(.2,.7,.3,1); } /* drive */
  33%  { height:100%; animation-timing-function: cubic-bezier(.4,0,.6,1); }  /* recovery */
  100% { height:10%; }
}
```

Caption (coach-only) — two stacked spans cross-fade on the same period so it
reads `DRIVE` during the first third, `RECOVER` after, with no JS:

```css
.ov-stroke-cap { display:none; position:relative; height:11px;
  font-size:9px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; opacity:.6; }
.ov-root[data-density="coach"] .ov-stroke-cap { display:block; }
.ov-stroke-cap > span { position:absolute; left:50%; transform:translateX(-50%); white-space:nowrap; }
.ov-stroke-cap .ov-cap-drive { animation: ov-cap-d var(--stroke-period,2s) infinite steps(1); }
.ov-stroke-cap .ov-cap-recover { animation: ov-cap-r var(--stroke-period,2s) infinite steps(1); }
@keyframes ov-cap-d { 0%{opacity:1} 33.34%{opacity:0} 100%{opacity:0} }
@keyframes ov-cap-r { 0%{opacity:0} 33.34%{opacity:1} 100%{opacity:1} }
```

Pause — freeze the stroke wherever it is when the session pauses:

```css
.ov-root[data-status="paused"] .ov-stroke-fill,
.ov-root[data-status="paused"] .ov-stroke-cap > span { animation-play-state: paused; }
```

Reduced motion — hold static, no pulsing:

```css
@media (prefers-reduced-motion: reduce) {
  .ov-stroke-fill { animation: none; height: 55%; }
  /* repeat the coach selector so it ties the always-on coach rule on
     specificity and wins by source order — hides the caption even in coach. */
  .ov-stroke-cap,
  .ov-root[data-density="coach"] .ov-stroke-cap { display: none; }
}
```

## JS wiring (in `apply()`)

`apply()` already runs on every `tick`/`transition`. Add two lines next to the
existing progress-bar update:

```ts
root.style.setProperty('--stroke-period', `${strokePeriodSec(seg.intensity).toFixed(2)}s`);
root.style.setProperty('--stroke-color', meta.color);
```

The period is constant within a segment (same value re-set each tick is a no-op
for the running animation) and changes only at a transition, where the overlay
already flashes — any retiming is masked. The fill color follows the intensity,
like `.ov-bar > span`; it goes through the `--stroke-color` variable (rather than
a direct `background` set) so the test can assert it deterministically — jsdom
round-trips custom-property strings exactly but normalizes some color shorthands.

## Non-functional notes

- **No footprint change while running.** In pill mode the widget is just the
  46px track — shorter than the 54px countdown — so the row height is governed by
  the countdown and nothing shifts. In coach mode the column adds the 6px gap +
  11px caption (≈63px total), so a pill→coach toggle grows the card by ~9px — but
  that only happens on a density change, which the Electron `ResizeObserver` hug
  already catches. Countdown ticks never change height, so the observer stays
  quiet during normal running.
- **Host-agnostic.** Pure CSS keyframes run identically in the browser Document
  PiP overlay and the Electron overlay window. No new timers, no dependence on
  the engine tick rate.
- **Density toggle.** `setDensity` already flips `data-density`; the caption
  shows/hides via the existing CSS-only mechanism. No change to `setDensity`.

## Testing

Test-first (TDD), matching existing conventions (Vitest + jsdom, no globals):

- `tests/types.test.ts` — assert numeric `spm`: easy 24, medium 26, hard 28,
  all-out 30.
- `tests/overlayView.test.ts`:
  - `strokePeriodSec('easy')` → 2.5; `strokePeriodSec('allout')` → 2.
  - `mountOverlay` renders `.ov-stroke-fill`, and after a tick the root carries a
    `--stroke-period` of `2.00s` for an all-out segment and the fill background is
    the intensity color. (jsdom doesn't run the animation; we assert the inputs
    the CSS consumes.)
- Manual: `npm run dev` (browser PiP) and `npm run electron:dev` — confirm the
  bar fills fast / drains slow at each intensity, freezes on pause, swaps the
  coach caption, and hides motion under reduced-motion.

## Out of scope

- Audible per-stroke metronome (the bar is visual only; tone cues stay as-is).
- User-tunable drive:recovery ratio or spm (fixed 1:2; spm from intensity).
- Alternate indicator forms (seat track / ring / beads) — explored and set aside.
