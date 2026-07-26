# Stroke Phase Continuity Across Segments — Design

**Date:** 2026-07-26
**Status:** Approved
**Area:** Overlay UI (`src/ui/overlayView.ts`)

## Summary

When a workout crosses a segment boundary and the recommended stroke rate
changes, the stroke pace bar currently jumps to an arbitrary point in the
drive–recovery cycle — the resulting phase is arbitrary. It should instead
**keep its place in the cycle and only change rate**: halfway through the drive
at 24 spm becomes halfway through the drive at 30 spm, and the rower rows the
second half of that drive at the new pace.

## Motivation

The bar exists so the rower can hold cadence peripherally without reading
numbers. A phase reset at a boundary breaks the stroke the rower is physically
in the middle of: they are told to catch again while their hands are still
coming away. The pace should change; the rhythm should not restart.

## Current behavior and its cause

The bar is pure CSS: `@keyframes ov-stroke-bar` on `.ov-stroke-fill`, plus two
`steps(1)` caption animations on `.ov-cap-drive` / `.ov-cap-recover`, all timed
by the `--stroke-period` custom property (`60 / spm`). `apply()` rewrites that
property on every tick (`src/ui/overlayView.ts`).

Changing `animation-duration` on a running CSS animation preserves the
animation's **elapsed local time**, not its phase. The phase after the change is
therefore `(elapsed / newPeriod) mod 1` — effectively arbitrary.

The 5-second-multiple arithmetic (`generator.ts` works in 5-second units, so
elapsed time at a boundary is always a multiple of 5) can explain a landing on
the catch, but only under two conditions that do not generally hold. First, it
requires the *incoming* period to be `2.5s` (easy, `60/24`) or `2.00s`
(all-out, `60/30`) — any multiple of 5 divided by 2.5 is a whole number of
cycles (phase 0), and divided by 2.00 lands on phase 0 or 0.5; medium
(`2.31s`, `60/26`) and hard (`2.14s`, `60/28`) land nowhere special. Second, it
assumes the animation's local time equals the workout's elapsed time, which it
does not: the animation starts at `mountOverlay`, and `engine.start()` runs
after it, so the two clocks are offset. So in general the jump lands at an
arbitrary phase, not reliably at the catch.

## Decisions (resolved during brainstorming)

- **What is preserved:** the **phase fraction** of the drive–recovery cycle. The
  drive:recovery split is a fixed 33/67 at every intensity, so preserving cycle
  phase and preserving progress *within* the current phase are the same thing.
  If the split ever became rate-dependent, this decision would need revisiting.
- **The change is instant** at the boundary — no ramp or blend across a stroke.
- **Mechanism: re-anchor the CSS animation via the Web Animations API.** The
  keyframes stay exactly as they are; only the anchoring is new. Rejected
  alternatives:
  - *Drive the bar from JS each frame* — re-implements what CSS does for free,
    needs its own pause and reduced-motion handling, adds a rAF loop to the PiP
    path, and breaks the harness's freeze/scrub control.
  - *Restart with a negative `animation-delay`* — needs our own paused-time
    bookkeeping to stay in lockstep with the CSS clock, and any drift shows up
    as a visible hitch. Strictly more state for the same result.

  `tools/overlay-harness.ts` already freezes and scrubs these same animations
  through `getAnimations()` / `currentTime`, so the technique is established in
  this codebase.

## Design

### Phase math (pure)

A small exported helper beside `strokePeriodSec` in `src/ui/overlayView.ts`:

```ts
/** Local time (ms) that keeps a stroke animation at the same point in its
 *  cycle after its period changes. */
export function retimedStrokeMs(
  currentMs: number,
  oldPeriodSec: number,
  newPeriodSec: number,
): number
```

It takes the animation's `currentTime` — total local time, which accumulates
across iterations — reduces it to a phase fraction
`(currentMs / 1000 / oldPeriodSec) mod 1`, normalized into `[0, 1)` so a
negative `currentTime` is handled, and returns `phase * newPeriodSec * 1000`.
A non-positive `oldPeriodSec` returns `0` rather than `NaN`.

### Re-anchoring in `mountOverlay`

`apply()` writes `--stroke-period` blind on every tick today. It gains a
`setStrokePeriod(next)` step instead, holding one closure variable for the
period last written:

1. If `next` equals the stored period, return. This is the common case on every
   tick, so the mechanism stays quiet during a segment.
2. Read the phase **before** touching the property: the first non-`null`
   `currentTime` among `.ov-stroke-fill`'s `getAnimations()`.
3. Write the new `--stroke-period`.
4. If a phase was found, write `retimedStrokeMs(...)` to the `currentTime` of
   the fill's animation **and** both caption animations, so the bar and the
   `DRIVE` / `RECOVER` caption stay locked together.

The stored period is the **rounded** value that actually goes into the CSS
(`toFixed(2)`), used for both the property and the phase math, so the JS never
disagrees with what the browser is running.

Setting `currentTime` explicitly makes the result deterministic regardless of
how the engine would have retimed the animation on its own.

Two properties fall out for free:

- The re-anchor fires on **any** period change, so manual ⏮ / ⏭ skips get the
  same smooth handoff as natural transitions.
- Setting `currentTime` on a paused animation is well-defined, so pausing
  mid-stroke across a boundary behaves.

### Degradation

Where `getAnimations` is missing or returns nothing — jsdom, and
`prefers-reduced-motion` where `.ov-stroke-fill` has `animation: none` — step 2
yields no phase and we simply write the property, exactly as today. No crash,
and no branching on environment.

## Testing

- **Pure helper:** halfway through the drive at 24 → 30 spm; exactly at the
  drive/recovery boundary; phase 0; a large multi-iteration `currentTime`;
  identical periods (identity); the non-positive-period guard.
- **`mountOverlay` in jsdom:** stub `getAnimations` on the stroke elements with
  fake animations exposing a settable `currentTime`; tick a fake engine into a
  segment of a different intensity; assert the property updated *and* every
  animation was re-anchored to the expected value. Plus: no writes when the
  period is unchanged, and no throw when `getAnimations` is absent.
- **Manual:** the harness renders static cards and cannot show a transition.
  Verify the handoff in a real run (`npm run dev`, short workout).

## Out of scope

- `sessionEngine`, the generator, and both shells are untouched.
- The transition flash, tone cues, and the fixed 33/67 drive:recovery split are
  unchanged.

## Reference

- Original bar design: `docs/superpowers/specs/2026-06-06-stroke-pace-bar-design.md`
