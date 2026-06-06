# Push-Strategy Selector — Design

**Date:** 2026-06-05
**Status:** Approved

## Problem

Today the setup page's **Generate** picks a push style at random (and **Regenerate**
re-rolls). The user can't choose a specific push style. We want explicit control:
select a workout length, select a push strategy, then generate.

## Goal

Let the user pick the push strategy on the setup page. One strategy is **Random**,
which is when the push is randomly generated. Remember the last-used strategy.

## Non-goals

- No change to the core generator — `generate(totalMin, { pushStyle }, seed)` already
  accepts a forced style, and `PUSH_STYLES` is already exported.
- No new push styles; no segment-label changes.

## Design

Two files change: `src/core/storage.ts` and `src/ui/setupView.ts`.

### Prefs (`storage.ts`)

- Add `lastPushStyle: PushStyle` to `Prefs` and `DEFAULT_PREFS` (default `'random'`).
  `PushStyle` is imported from `./pushStyles`. `getPrefs()` already spreads
  `DEFAULT_PREFS`, so prefs stored before this change get `'random'`.

### Setup UI (`setupView.ts`)

- Add a **Push strategy** `<select class="setup-strategy">` next to the minutes
  dropdown, populated from `PUSH_STYLES` with capitalized labels
  (`long → Long`, …). Pre-select the remembered strategy: use `prefs.lastPushStyle`
  if it is one of `PUSH_STYLES`, else `'random'`.
- **Remove** the **Regenerate** button and its click handler. Keep one **Generate**.
- `doGenerate` becomes: increment an internal `seed`; read length + strategy; persist
  both (`{ lastTotalMin, lastPushStyle }`); call
  `generate(mins, { pushStyle: style }, seed)`.
  - Forced styles bypass the RNG style-pick, so incrementing `seed` on each Generate
    click **re-rolls only the Random strategy** (fixed styles regenerate identically).
    This delivers "click Generate again to re-roll Random" with no special-casing.
  - `seed` starts at `0` and is incremented to `1` on the first click.
- The strategy read at generate time always comes from the dropdown, so it is always a
  valid `PushStyle`; the only validation needed is the pre-select fallback above.

## Testing (TDD)

`tests/setupView.test.ts` (new tests; existing Generate/Start/Save keep working):

1. **Strategy options** — the `.setup-strategy` select offers exactly the five
   `PUSH_STYLES` values (`['long','steps','repeats','crazy','random']`).
2. **Strategy is applied** — select `crazy` + 10 minutes, click Generate, click Start;
   the segments handed to `onStart` include a `hard` `420s` segment and contain no
   `allout` segment (which only a crazy push produces, distinguishing it from the
   other styles).
3. **Strategy is remembered** — select `steps`, click Generate, re-mount `mountSetup`
   with the same storage; the `.setup-strategy` select pre-selects `steps`.

`tests/storage.test.ts`:

4. **Default** — `DEFAULT_PREFS.lastPushStyle === 'random'` (the existing
   "returns defaults when empty" test already covers shape equality).

`npm run typecheck`, `npm test`, `npm run build` all green.

## Risks / trade-offs

- Storing a `PushStyle` string in prefs could go stale if a style is ever renamed; the
  pre-select fallback to `'random'` keeps the UI safe, and the dropdown guarantees only
  valid values reach `generate`.
- Capitalized style ids (`Long`, `Steps`, …) are terse but clear; a nicer label map can
  be added later if desired (explicitly deferred).
