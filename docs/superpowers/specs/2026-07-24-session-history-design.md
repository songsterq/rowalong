# Session History — Design

**Date:** 2026-07-24
**Status:** Approved (pending spec review)

## 1. Overview

Record every workout that runs, present the history as a motivating heatmap in
the setup page's right rail, and let the user reload a past workout into the
builder.

This closes the "workout history / stats" item deferred in §15 of the
[original design](2026-06-05-workout-helper-design.md).

### Goals

- Record when each session happened, how long it actually ran, and which program
  it used.
- Show a GitHub-style heatmap plus streak / volume stats that make consistency
  visible at a glance.
- Let the user reload any past workout into the editor to run or adapt it.

### Non-goals

- Editing or deleting individual history entries (the list is append-only; only
  the 500-record cap prunes it).
- Syncing or exporting history off-device.
- Per-segment performance data (actual stroke rate, heart rate, splits). Only
  planned-vs-elapsed time is recorded.
- Charts beyond the heatmap and the three stat tiles.

## 2. Placement

A third panel in the **right rail**, below Templates, on the setup page.

Considered and rejected: a dedicated History tab (a streak you have to navigate
to is a streak you forget about) and a full-width hero strip above the builder
(most motivating, but it pushes the build tool — the thing you actually came
for — down on every launch).

The rail placement also puts "reload a past workout" directly next to "load a
template", which is the same gesture with the same outcome.

## 3. Data model

```ts
export interface SessionRecord {
  id: string;
  startedAt: number;    // epoch ms
  elapsedSec: number;   // time actually trained
  plannedSec: number;   // sum of segment durations
  completed: boolean;   // reached natural end vs. stopped early
  programName: string;  // "Quick 20" or "20 min · random"
  segments: Segment[];  // snapshot
}
```

**Segments are snapshotted, not referenced.** Templates can be deleted and
generated workouts were never persisted anywhere, so an id reference would leave
most of the history un-rebuildable.

**Partial sessions are recorded with the time actually elapsed.** A 20-minute
program stopped at 12 minutes records `elapsedSec: 720`, `plannedSec: 1200`,
`completed: false`. Discarding it would throw away genuine work; recording it as
a full session would be a lie.

### 3.1 Program name

`programName` records provenance. `setupView` tracks the current program's label
and passes it through `onStart`:

- Loaded from a template → that template's name.
- Generated → `` `${mins} min · ${style}` `` (e.g. `20 min · random`).

The label survives manual block edits — it describes where the workout came
from, not what it currently contains.

## 4. Storage

Extends the existing `Storage` class in `src/core/storage.ts`, using the same
injectable `KeyValueStore`:

- `listSessions(): SessionRecord[]`
- `recordSession(r: SessionRecord): void`

Key: `wh.sessions`. Same defensive JSON parsing as `listTemplates` — a corrupt
or non-array payload yields `[]` rather than throwing.

`recordSession` keeps only the **most recent 500 records** (sorted by
`startedAt`), so localStorage can't grow without bound. At roughly one session a
day that is well over a year of history.

## 5. Pure history math — `src/core/history.ts`

All non-trivial logic lives here, framework-free and fully unit-tested, matching
the `core/` convention.

- `dayKey(ms: number): string` → local `YYYY-MM-DD`.
- `heatmapDays(records, todayMs, weeks): DayCell[]` → one bucket per day with
  total minutes.
- `historyStats(records, todayMs): HistoryStats` →
  `{ currentStreak, thisWeekSessions, thisWeekMin, totalSessions, totalMin }`.

**Weeks start Monday** (ISO 8601). This governs both the heatmap's column
alignment and the `thisWeek*` stats; they must agree or the panel contradicts
itself.

`heatmapDays` returns **exactly `weeks * 7` cells**, ending on the Sunday that
closes the current week. Days after today are included as empty cells so the
final column keeps its shape, and each cell is flagged so the UI can render
future days differently from genuine rest days.

**Bucketing is by local date, never UTC.** This is the one genuine trap: an
evening workout for anyone west of UTC lands on the following UTC day, which
would put cells in the wrong column and silently break streaks.

### 5.1 Streak rules

- A day counts as active when its **total** minutes across all sessions is
  **≥ 5** (`STREAK_MIN_MINUTES`). This stops an accidental start-then-stop from
  earning credit, while still counting a genuine short session.
- The streak counts back from **today or yesterday**. Anchoring strictly on
  today would show every user a broken streak each morning until they train.
- Gaps end the streak. Multiple sessions in one day count once toward the
  streak, but their minutes sum for the heatmap and volume stats.

## 6. Recording

Sessions run in two places — the browser PiP path (`src/main.ts` owns the
engine) and the Electron overlay window (`src/overlay-entry.ts` owns it). Both
call one shared helper so the logic exists once:

```ts
finishSession(storage, ctx, state): void
```

It is **idempotent per session run** — both hosts can reach it via the `complete`
event *and* via teardown, and only the first call writes.

- `elapsedSec` ← `engine.getState().totalElapsedSec`
- `completed` ← whether the engine emitted `complete` (natural end) rather than
  ending via `stop()`, which by design emits nothing.

Call sites:

| Host | Natural completion | Early stop |
| --- | --- | --- |
| Browser (`main.ts`) | engine `complete` event | `endSession()` |
| Electron (`overlay-entry.ts`) | engine `complete` event | overlay `onStop` |

### 6.1 Electron payload

`SessionPayload` in `src/electron.d.ts` gains `name: string`. `preload.cjs` and
`electron/app.cjs` forward the payload opaquely and need no change.

## 7. UI — `src/ui/historyPanel.ts`

Follows the existing `renderX(container, data, opts)` pattern; CSS is appended
to `SETUP_CSS` in `setupStyles.ts` under the existing `.setup` scope.

- **Three stat tiles** — current streak, this week, all time.
- **13-week heatmap** (~90 days). At 9px cells with 2px gaps that is ~130px
  wide, comfortable inside the ~300px rail. Cells shade over a 4-step ramp of
  the existing orange accent (`#ff8c42`); zero-minute days use the panel's
  border tone. Each cell carries a `title` with the date and minutes.
- **Last 3 sessions** — weekday, program name, duration. Clicking one calls
  `onPick(segments)`.
- **Empty state** — an invitation to run the first session, so the panel is
  never a blank box.

`setupView` wires `onPick` to the same `renderWorkout` path template loading
already uses, re-iding segments via `makeId()` so the editor never holds two
blocks with the same id.

## 8. Testing

Test-first (TDD), Vitest + jsdom, no globals — matching existing conventions.

- `tests/history.test.ts` — the real coverage:
  - `dayKey` buckets on local date, including across a DST shift.
  - Streak: consecutive days; a gap ends it; the 5-minute floor excludes a
    2-minute day; two short sessions summing past the floor count; anchoring
    works from both today and yesterday; empty input yields zero.
  - `heatmapDays` returns exactly `weeks * 7` cells, sums multiple sessions per
    day, aligns columns to Monday, and marks post-today cells as future.
  - `historyStats` week boundaries (a Sunday session counts in the week that
    started the preceding Monday) and totals.
- `tests/storage.test.ts` — session round-trip, corrupt-payload fallback, and
  the 500-record cap keeping the newest.
- `tests/historyPanel.test.ts` — renders the expected cell count and stat
  values, fires `onPick` with the clicked session's segments, and shows the
  empty state with no records.
- Manual: `npm run dev` and `npm run electron:dev` — confirm a completed session
  and an early-stopped session both land in the panel with the right minutes,
  and that clicking one loads it into the builder.

## 9. Out of scope

- History editing / deletion UI.
- Export, sync, or backup of history.
- Heatmap tooltips beyond the native `title` attribute.
- Month or weekday axis labels on the heatmap (no room in the rail; revisit if
  the panel ever moves to a full-width surface).
