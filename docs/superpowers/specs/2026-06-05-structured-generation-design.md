# Structured Workout Generation — Design

**Date:** 2026-06-05
**Status:** Approved (pending spec review)

## Problem

The current `generate()` produces a continuous, seed-driven push/rest loop for any
whole-minute total. The output feels random and unstructured: there is no clear
warm-up/main/cool-down shape, no recognizable interval patterns, and no upper bound
on session shapes. We want generated rowing workouts to follow a deliberate,
repeatable structure built from recognizable "push" blocks.

## Goals

- Replace the freeform generator with a fixed skeleton: warm-up → main → cool-down.
- Organize the main set into repeated 7-minute **pushes** separated by 3-minute
  **bridges**.
- Support **only 10 / 20 / 30-minute** workouts (1 / 2 / 3 pushes).
- Offer recognizable push **styles** (named templates) plus a random generator.
- Keep the core pure, deterministic, and fully unit-tested (TDD), preserving the
  existing invariants (every duration a multiple of 5s; total stays exact;
  deterministic ids).

## Non-goals

- No per-segment display labels (overlay stays intensity-only for now).
- No new persistence/template changes beyond the duration selector.
- No change to the session engine, overlay, audio, or Electron shell.

## Structure

Every workout is assembled as:

```
[warm-up 120s] [push 420s] ( [bridge 180s] [push 420s] )×(n−1) [cool-down 60s]
```

| Duration | Pushes | Bridges | Total |
|----------|--------|---------|-------|
| 10 min   | 1      | 0       | 120 + 420 + 60 = 600 ✓ |
| 20 min   | 2      | 1       | 120 + 420 + 180 + 420 + 60 = 1200 ✓ |
| 30 min   | 3      | 2       | 120 + 420 + 180×2 + 420×3 + 60 = 1800 ✓ |

Fixed blocks (every duration is a multiple of 5s):

- **Warm-up (120s):** `easy 60` → `medium 60`.
- **Cool-down (60s):** `easy 60`.
- **Bridge (180s):** recovery, **medium is the ceiling** — `medium 60` → `easy 120`.
  Ends on easy so it flows into the next push.

`generate()` supports only 10 / 20 / 30. Any other `totalMin` **snaps to the nearest**
of those three, **ties rounding up** (so 25 → 30); values below 10 snap to 10 and above
30 snap to 30. This is purely defensive — the UI only offers the three.

## Push styles

A single style is chosen **per generation** (seeded) and **repeated** for every push
in that workout. Each style produces a segment list summing to **at most 420s**; if it
is short, a `medium` **"build"** segment equal to the remainder is **prepended** to the
push so every push is exactly 420s.

1. **long** — `hard 120`, `easy 30`, `medium 30`, `allout 120`, `easy 60` (360s)
   → build `medium 60`.
2. **steps** — `allout 20`, `easy 20`, `allout 40`, `easy 40`, `allout 60`, `easy 60`,
   `allout 80`, `easy 80` (400s) → build `medium 20`.
3. **repeats** — (`allout 20`, `easy 20`) × 10 (400s) → build `medium 20`.
4. **crazy** — `hard 420` (420s) → no build.
5. **random** — seed-driven `hard`/`allout` work blocks with `medium`/`easy` rests
   filling the 420s budget; the leftover (`< one block`) becomes the `medium` build at
   the start. For the `random` style, one push is generated and **repeated identically**
   across the workout's pushes (consistent with "same style repeated").

Rest pairing within the random generator mirrors today's logic: `medium` rest after a
`hard` push, `easy` rest after an `allout` push; `allout` less frequent than `hard`;
each rest is 0.5–1× its push; push length within 20–150s. All in 5-second units.

**Selection:** `Generate` derives the style from the seed; `Regenerate` increments the
seed, re-rolling the style and (for `random`) the generated push. Tests/UI may force a
style via `GeneratorOptions.pushStyle`.

Segments remain intensity-only (no labels). Ids stay deterministic
(`seg-${seed}-${idx}`); repeated pushes get distinct ids because the index keeps
incrementing. Consumers continue to re-id on load.

## Code structure

- **New `src/core/pushStyles.ts`**
  - `export type PushStyle = 'long' | 'steps' | 'repeats' | 'crazy' | 'random'`
  - `export const PUSH_STYLES: PushStyle[]` (selection pool).
  - `buildPush(style, rng): { intensity: Intensity; durationSec: number }[]` — returns
    the 420s block list with the `medium` build already prepended. Pure; no ids.
  - Named styles are fixed canonical patterns; `random` uses the injected `Rng`.
- **`src/core/generator.ts`** (rewritten)
  - `GeneratorOptions` slims to `{ pushStyle?: PushStyle }` (old cap options removed).
  - `generate(totalMin, opts?, seed?)` — signature unchanged. Snaps `totalMin` to
    10/20/30, derives push/bridge counts, picks a style (or uses `opts.pushStyle`),
    assembles warm-up + pushes/bridges + cool-down, assigns deterministic ids.
- **`src/ui/setupView.ts`**
  - The free-form "Total minutes" number input becomes a **10 / 20 / 30 selector**
    (a `<select>` with three options). `lastTotalMin` (default 20) snaps to the nearest
    supported value when preselecting.

## Testing (TDD)

Build test-first, in this order:

1. **`tests/pushStyles.test.ts`**
   - Each named style sums to exactly 420s after build.
   - `long`/`steps`/`repeats` prepend the expected `medium` build; `crazy` has none.
   - `random` sums to 420s, uses only `hard`/`allout` work + `medium`/`easy` rests,
     and is deterministic for a fixed seed.
   - Every duration is a multiple of 5.
2. **`tests/generator.test.ts`** (rewritten)
   - Total equals 600 / 1200 / 1800 for 10 / 20 / 30.
   - Correct push count (1/2/3) and bridge count (0/1/2).
   - Starts `easy` (warm-up) and ends `easy 60` (cool-down); warm-up is `easy 60` +
     `medium 60`.
   - Each push region sums to 420; each bridge sums to 180 and never exceeds `medium`.
   - A non-`crazy` push starts with a `medium` build when the style is short.
   - Unsupported totals snap to the nearest supported (e.g. `generate(2)` → 600s,
     `generate(25)` → 1800s with ties rounding up).
   - Deterministic per seed; varies across seeds. Every duration a multiple of 5.
3. **`tests/setupView.test.ts`** (updated)
   - Generate/Start/Save still work driven by the new 10/20/30 selector.

`npm run typecheck` and `npm test` green before completion.

## Risks / trade-offs

- **Less variety than before.** Named styles are fixed, so workout variety comes mainly
  from the `random` style and which style the seed picks. This is intentional —
  structure over randomness — and accepted.
- **Dropping arbitrary durations** is a deliberate product decision (only 10/20/30).
  The snap-to-nearest keeps `generate()` total-exact and crash-free for any input.
