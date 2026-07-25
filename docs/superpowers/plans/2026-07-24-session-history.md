# Session History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every workout that runs and surface it as a heatmap, streak stats, and a reloadable list of past programs in the setup page's right rail.

**Architecture:** All date math and stats live in a new pure module `src/core/history.ts`, fully unit-tested with an injected "now". Persistence extends the existing `Storage` class over its injectable `KeyValueStore`. A small `createRecorder` helper writes exactly one record per session run and is called from both hosts that own an engine (browser `main.ts`, Electron `overlay-entry.ts`). The UI is one new `src/ui/historyPanel.ts` following the existing `renderX(container, data, opts)` pattern.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest + jsdom. No new dependencies.

**Spec:** [docs/superpowers/specs/2026-07-24-session-history-design.md](../specs/2026-07-24-session-history-design.md)

## Global Constraints

- Vanilla TypeScript, no UI framework. No new npm dependencies.
- Vitest runs in `jsdom`; tests `import { ... } from 'vitest'` — **no globals**.
- Test-first (TDD). Every task writes the failing test, watches it fail, then implements.
- All date bucketing uses **local** dates, never UTC.
- **Weeks start Monday** (ISO 8601), for both the heatmap grid and the `thisWeek*` stats.
- `STREAK_MIN_MINUTES = 5` — a day counts toward the streak at ≥ 5 total minutes.
- `MAX_SESSIONS = 500` — `recordSession` keeps only the newest 500 records.
- `HEATMAP_WEEKS = 13`.
- Heatmap accent color is the existing `#ff8c42`.
- New setup CSS is appended to `SETUP_CSS` in `src/ui/setupStyles.ts`, scoped under `.setup`.
- Run `npm test` and `npm run typecheck` before every commit; both must be clean.

---

### Task 1: `SessionRecord` type and the pure history module

**Files:**
- Modify: `src/core/types.ts` (append after `Template`)
- Create: `src/core/history.ts`
- Test: `tests/history.test.ts`

**Interfaces:**
- Consumes: `Segment` from `src/core/types.ts`.
- Produces:
  - `SessionRecord` — `{ id: string; startedAt: number; elapsedSec: number; plannedSec: number; completed: boolean; programName: string; segments: Segment[] }`
  - `STREAK_MIN_MINUTES: number` (5)
  - `DayCell` — `{ key: string; minutes: number; future: boolean }`
  - `HistoryStats` — `{ currentStreak: number; thisWeekSessions: number; thisWeekMin: number; totalSessions: number; totalMin: number }`
  - `dayKey(ms: number): string`
  - `heatmapDays(records: SessionRecord[], todayMs: number, weeks: number): DayCell[]`
  - `historyStats(records: SessionRecord[], todayMs: number): HistoryStats`

- [ ] **Step 1: Add the `SessionRecord` type**

Append to `src/core/types.ts`, after the `Template` interface:

```ts
/** One finished (or stopped-early) run of a workout. Segments are snapshotted,
 *  not referenced: templates can be deleted and generated workouts are never
 *  saved, so an id reference would leave most history un-rebuildable. */
export interface SessionRecord {
  id: string;
  startedAt: number; // epoch ms
  elapsedSec: number; // time actually trained
  plannedSec: number; // sum of segment durations
  completed: boolean; // reached natural end vs. stopped early
  programName: string; // 'Quick 20' or '20 min · random'
  segments: Segment[];
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  dayKey,
  heatmapDays,
  historyStats,
  STREAK_MIN_MINUTES,
} from '../src/core/history';
import { SessionRecord } from '../src/core/types';

// 2026-07-24 is a Friday; its ISO week runs Mon 2026-07-20 .. Sun 2026-07-26.
const TODAY = new Date(2026, 6, 24, 12, 0, 0).getTime();
const DAY_MS = 86_400_000;

/** A record `daysAgo` before TODAY, at local noon so DST shifts can't move the date. */
function rec(daysAgo: number, minutes: number): SessionRecord {
  const d = new Date(2026, 6, 24, 12, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `r${daysAgo}-${minutes}`,
    startedAt: d.getTime(),
    elapsedSec: minutes * 60,
    plannedSec: minutes * 60,
    completed: true,
    programName: 'Quick 20',
    segments: [{ id: 's', intensity: 'easy', durationSec: minutes * 60 }],
  };
}

describe('dayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30).getTime())).toBe('2026-01-05');
  });

  it('uses the local date, not the UTC date', () => {
    const ms = new Date(2026, 6, 24, 23, 30).getTime();
    expect(dayKey(ms)).toBe('2026-07-24');
  });
});

describe('heatmapDays', () => {
  it('returns exactly weeks * 7 cells', () => {
    expect(heatmapDays([], TODAY, 13)).toHaveLength(91);
  });

  it('starts on a Monday and ends on the Sunday closing this week', () => {
    const cells = heatmapDays([], TODAY, 13);
    expect(cells[0].key).toBe('2026-04-27');
    expect(cells[cells.length - 1].key).toBe('2026-07-26');
  });

  it('emits strictly consecutive calendar days', () => {
    const cells = heatmapDays([], TODAY, 13);
    for (let i = 1; i < cells.length; i++) {
      const prev = new Date(cells[i - 1].key + 'T12:00:00').getTime();
      const cur = new Date(cells[i].key + 'T12:00:00').getTime();
      expect(Math.round((cur - prev) / DAY_MS)).toBe(1);
    }
  });

  it('sums multiple sessions landing on the same day', () => {
    const cells = heatmapDays([rec(1, 20), rec(1, 10)], TODAY, 13);
    const cell = cells.find((c) => c.key === '2026-07-23');
    expect(cell!.minutes).toBe(30);
  });

  it('marks days after today as future and leaves them empty', () => {
    const cells = heatmapDays([], TODAY, 13);
    expect(cells.find((c) => c.key === '2026-07-24')!.future).toBe(false);
    expect(cells.find((c) => c.key === '2026-07-25')!.future).toBe(true);
    expect(cells.find((c) => c.key === '2026-07-25')!.minutes).toBe(0);
  });
});

describe('historyStats streak', () => {
  it('is zero with no records', () => {
    expect(historyStats([], TODAY).currentStreak).toBe(0);
  });

  it('counts consecutive active days ending today', () => {
    const recs = [rec(0, 20), rec(1, 20), rec(2, 20)];
    expect(historyStats(recs, TODAY).currentStreak).toBe(3);
  });

  it('still counts when the most recent day is yesterday', () => {
    const recs = [rec(1, 20), rec(2, 20)];
    expect(historyStats(recs, TODAY).currentStreak).toBe(2);
  });

  it('stops at a gap', () => {
    const recs = [rec(0, 20), rec(1, 20), rec(3, 20)];
    expect(historyStats(recs, TODAY).currentStreak).toBe(2);
  });

  it('ignores a day below the minute floor', () => {
    const recs = [rec(0, STREAK_MIN_MINUTES - 3), rec(1, 20)];
    expect(historyStats(recs, TODAY).currentStreak).toBe(1);
  });

  it('counts a day whose short sessions sum past the floor', () => {
    const recs = [rec(0, 3), rec(0, 3)];
    expect(historyStats(recs, TODAY).currentStreak).toBe(1);
  });
});

describe('historyStats totals', () => {
  it('counts this week from Monday', () => {
    // 4 days ago = Mon 2026-07-20 (in week); 5 days ago = Sun 2026-07-19 (previous week).
    const stats = historyStats([rec(4, 20), rec(5, 20)], TODAY);
    expect(stats.thisWeekSessions).toBe(1);
    expect(stats.thisWeekMin).toBe(20);
  });

  it('totals every record regardless of age', () => {
    const stats = historyStats([rec(4, 20), rec(200, 30)], TODAY);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalMin).toBe(50);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/history.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/history"`.

- [ ] **Step 4: Implement the history module**

Create `src/core/history.ts`:

```ts
import { SessionRecord } from './types';

/** A day counts toward the streak once its total reaches this many minutes, so a
 *  misfired start-then-stop can't earn credit. */
export const STREAK_MIN_MINUTES = 5;

export interface DayCell {
  key: string; // local YYYY-MM-DD
  minutes: number;
  future: boolean; // after today: pads the current week without reading as a missed day
}

export interface HistoryStats {
  currentStreak: number;
  thisWeekSessions: number;
  thisWeekMin: number;
  totalSessions: number;
  totalMin: number;
}

/** Local calendar date as YYYY-MM-DD. Bucketing on UTC would push an evening
 *  workout into the next day for anyone west of UTC, breaking columns and streaks. */
export function dayKey(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(ms: number): Date {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Midnight on the Monday of the week containing `ms` (ISO 8601 week start). */
function mondayOf(ms: number): Date {
  const d = startOfDay(ms);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // getDay: Sun=0 -> Mon=0..Sun=6
  return d;
}

function minutesByDay(records: SessionRecord[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of records) {
    const key = dayKey(r.startedAt);
    totals.set(key, (totals.get(key) ?? 0) + r.elapsedSec / 60);
  }
  return totals;
}

/** `weeks * 7` cells, Monday-aligned, ending on the Sunday that closes this week.
 *  Date stepping goes through setDate so DST transitions can't drop or repeat a day. */
export function heatmapDays(
  records: SessionRecord[],
  todayMs: number,
  weeks: number,
): DayCell[] {
  const totals = minutesByDay(records);
  const todayKey = dayKey(todayMs);
  const cursor = mondayOf(todayMs);
  cursor.setDate(cursor.getDate() - (weeks - 1) * 7);

  const cells: DayCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const key = dayKey(cursor.getTime());
    cells.push({
      key,
      minutes: Math.round(totals.get(key) ?? 0),
      future: key > todayKey, // YYYY-MM-DD sorts lexicographically
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

export function historyStats(records: SessionRecord[], todayMs: number): HistoryStats {
  const totals = minutesByDay(records);
  const isActive = (d: Date) => (totals.get(dayKey(d.getTime())) ?? 0) >= STREAK_MIN_MINUTES;

  // Anchor on today, or yesterday if today isn't logged yet — otherwise every
  // streak would look broken each morning until the user trains.
  const cursor = startOfDay(todayMs);
  if (!isActive(cursor)) cursor.setDate(cursor.getDate() - 1);
  let currentStreak = 0;
  while (isActive(cursor)) {
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const weekStart = mondayOf(todayMs).getTime();
  const thisWeek = records.filter((r) => r.startedAt >= weekStart);
  const minutes = (rs: SessionRecord[]) =>
    Math.round(rs.reduce((sum, r) => sum + r.elapsedSec, 0) / 60);

  return {
    currentStreak,
    thisWeekSessions: thisWeek.length,
    thisWeekMin: minutes(thisWeek),
    totalSessions: records.length,
    totalMin: minutes(records),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/history.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 6: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/core/history.ts tests/history.test.ts
git commit -m "feat(core): add SessionRecord type and history stats module"
```

---

### Task 2: Persist session records

**Files:**
- Modify: `src/core/storage.ts`
- Test: `tests/storage.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: `SessionRecord` (Task 1), existing `KeyValueStore`.
- Produces: `Storage.listSessions(): SessionRecord[]`, `Storage.recordSession(r: SessionRecord): void`, `MAX_SESSIONS: number`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/storage.test.ts`. Note the existing file already imports `Storage`, `DEFAULT_PREFS`, `KeyValueStore` and defines the `Mem` class and the `store` / `beforeEach` fixture — reuse them, and extend the existing imports rather than duplicating them:

```ts
// extend the existing import from '../src/core/storage' to include MAX_SESSIONS
// extend the existing import from '../src/core/types' to include SessionRecord

function sess(id: string, startedAt: number): SessionRecord {
  return {
    id,
    startedAt,
    elapsedSec: 600,
    plannedSec: 1200,
    completed: false,
    programName: '20 min · random',
    segments: [{ id: 'a', intensity: 'easy', durationSec: 60 }],
  };
}

describe('Storage sessions', () => {
  it('starts empty', () => {
    expect(store.listSessions()).toEqual([]);
  });

  it('round-trips a record', () => {
    store.recordSession(sess('a', 1000));
    const all = store.listSessions();
    expect(all).toHaveLength(1);
    expect(all[0].programName).toBe('20 min · random');
    expect(all[0].segments).toHaveLength(1);
  });

  it('appends across calls, oldest first', () => {
    store.recordSession(sess('a', 2000));
    store.recordSession(sess('b', 1000));
    expect(store.listSessions().map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('keeps only the newest MAX_SESSIONS records', () => {
    for (let i = 0; i < MAX_SESSIONS + 5; i++) store.recordSession(sess(`s${i}`, i * 1000));
    const all = store.listSessions();
    expect(all).toHaveLength(MAX_SESSIONS);
    expect(all[0].id).toBe('s5');
    expect(all[all.length - 1].id).toBe(`s${MAX_SESSIONS + 4}`);
  });

  it('falls back to empty on a corrupt payload', () => {
    const mem = new Mem();
    mem.setItem('wh.sessions', '{ not json');
    expect(new Storage(mem).listSessions()).toEqual([]);
  });

  it('falls back to empty when the payload is not an array', () => {
    const mem = new Mem();
    mem.setItem('wh.sessions', '{"nope":true}');
    expect(new Storage(mem).listSessions()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL — `MAX_SESSIONS` is not exported and `store.listSessions is not a function`.

- [ ] **Step 3: Implement persistence**

In `src/core/storage.ts`, extend the type import and add the key and cap beside the existing ones:

```ts
import { SessionRecord, Template } from './types';
```

```ts
const SESSIONS_KEY = 'wh.sessions';

/** Cap on stored history. At roughly a session a day this is over a year, and it
 *  stops localStorage growing without bound. */
export const MAX_SESSIONS = 500;
```

Then add these two methods to the `Storage` class, after `deleteTemplate`:

```ts
  listSessions(): SessionRecord[] {
    const raw = this.backend.getItem(SESSIONS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SessionRecord[]) : [];
    } catch {
      return [];
    }
  }

  recordSession(r: SessionRecord): void {
    const all = [...this.listSessions(), r]
      .sort((a, b) => a.startedAt - b.startedAt)
      .slice(-MAX_SESSIONS);
    this.backend.setItem(SESSIONS_KEY, JSON.stringify(all));
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/storage.ts tests/storage.test.ts
git commit -m "feat(core): persist session records with a 500-record cap"
```

---

### Task 3: The write-once session recorder

**Files:**
- Create: `src/core/sessionRecorder.ts`
- Test: `tests/sessionRecorder.test.ts`

**Interfaces:**
- Consumes: `Storage` (Task 2), `Segment` / `SessionRecord` / `makeId` from types.
- Produces:
  - `SessionContext` — `{ segments: Segment[]; programName: string; startedAt: number }`
  - `SessionRecorder` — `{ finish(elapsedSec: number, completed: boolean): void }`
  - `createRecorder(storage: Storage, ctx: SessionContext): SessionRecorder`

- [ ] **Step 1: Write the failing tests**

Create `tests/sessionRecorder.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, type KeyValueStore } from '../src/core/storage';
import { createRecorder } from '../src/core/sessionRecorder';
import { Segment } from '../src/core/types';

class Mem implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const segments: Segment[] = [
  { id: 'a', intensity: 'easy', durationSec: 600 },
  { id: 'b', intensity: 'hard', durationSec: 600 },
];

let store: Storage;
beforeEach(() => {
  store = new Storage(new Mem());
});

describe('createRecorder', () => {
  it('writes one record with the elapsed time and planned total', () => {
    const rec = createRecorder(store, { segments, programName: 'Quick 20', startedAt: 500 });
    rec.finish(725.4, false);

    const all = store.listSessions();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      startedAt: 500,
      elapsedSec: 725,
      plannedSec: 1200,
      completed: false,
      programName: 'Quick 20',
    });
  });

  it('marks a natural completion', () => {
    const rec = createRecorder(store, { segments, programName: 'Quick 20', startedAt: 500 });
    rec.finish(1200, true);
    expect(store.listSessions()[0].completed).toBe(true);
  });

  it('writes only once even when finish is called again', () => {
    const rec = createRecorder(store, { segments, programName: 'Quick 20', startedAt: 500 });
    rec.finish(600, true);
    rec.finish(600, true);
    rec.finish(900, false);
    expect(store.listSessions()).toHaveLength(1);
    expect(store.listSessions()[0].elapsedSec).toBe(600);
  });

  it('snapshots the segments so later edits cannot mutate history', () => {
    const live: Segment[] = [{ id: 'a', intensity: 'easy', durationSec: 60 }];
    const rec = createRecorder(store, { segments: live, programName: 'X', startedAt: 1 });
    rec.finish(60, true);
    live[0].durationSec = 999;
    expect(store.listSessions()[0].segments[0].durationSec).toBe(60);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sessionRecorder.test.ts`
Expected: FAIL — `Failed to resolve import "../src/core/sessionRecorder"`.

- [ ] **Step 3: Implement the recorder**

Create `src/core/sessionRecorder.ts`:

```ts
import { Storage } from './storage';
import { Segment, makeId } from './types';

export interface SessionContext {
  segments: Segment[];
  programName: string;
  startedAt: number; // epoch ms
}

export interface SessionRecorder {
  /** Write the record. Safe to call more than once — only the first call lands. */
  finish(elapsedSec: number, completed: boolean): void;
}

/** Both hosts can reach the end of a session twice (the engine's `complete`
 *  event *and* teardown), so writing is guarded to one record per run. */
export function createRecorder(storage: Storage, ctx: SessionContext): SessionRecorder {
  let written = false;
  return {
    finish(elapsedSec: number, completed: boolean): void {
      if (written) return;
      written = true;
      storage.recordSession({
        id: makeId(),
        startedAt: ctx.startedAt,
        elapsedSec: Math.round(elapsedSec),
        plannedSec: ctx.segments.reduce((sum, s) => sum + s.durationSec, 0),
        completed,
        programName: ctx.programName,
        segments: ctx.segments.map((s) => ({ ...s })),
      });
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sessionRecorder.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/sessionRecorder.ts tests/sessionRecorder.test.ts
git commit -m "feat(core): add write-once session recorder"
```

---

### Task 4: The history panel UI

**Files:**
- Create: `src/ui/historyPanel.ts`
- Modify: `src/ui/setupStyles.ts` (append to `SETUP_CSS`, before the closing backtick)
- Test: `tests/historyPanel.test.ts`

**Interfaces:**
- Consumes: `heatmapDays`, `historyStats`, `DayCell` (Task 1); `SessionRecord`, `Segment` from types; `formatClock` from `./format`.
- Produces:
  - `HEATMAP_WEEKS: number` (13)
  - `HistoryPanelOpts` — `{ onPick?: (segments: Segment[], programName: string) => void; now?: number }`
  - `renderHistory(container: HTMLElement, records: SessionRecord[], opts?: HistoryPanelOpts): void`

- [ ] **Step 1: Write the failing tests**

Create `tests/historyPanel.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHistory, HEATMAP_WEEKS } from '../src/ui/historyPanel';
import { SessionRecord } from '../src/core/types';

const TODAY = new Date(2026, 6, 24, 12, 0, 0).getTime();

function rec(daysAgo: number, minutes: number, name = 'Quick 20'): SessionRecord {
  const d = new Date(2026, 6, 24, 12, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return {
    id: `r${daysAgo}`,
    startedAt: d.getTime(),
    elapsedSec: minutes * 60,
    plannedSec: minutes * 60,
    completed: true,
    programName: name,
    segments: [{ id: `seg${daysAgo}`, intensity: 'hard', durationSec: minutes * 60 }],
  };
}

let container: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="c"></div>';
  container = document.getElementById('c')!;
});

describe('history panel', () => {
  it('renders one cell per day in the window', () => {
    renderHistory(container, [], { now: TODAY });
    expect(container.querySelectorAll('.hist-cell')).toHaveLength(HEATMAP_WEEKS * 7);
  });

  it('shows the empty state when there are no records', () => {
    renderHistory(container, [], { now: TODAY });
    expect(container.querySelector('.hist-empty')).not.toBeNull();
    expect(container.querySelectorAll('.hist-item')).toHaveLength(0);
  });

  it('shows the streak and this-week stats', () => {
    renderHistory(container, [rec(0, 20), rec(1, 20)], { now: TODAY });
    const values = Array.from(container.querySelectorAll('.hist-stat b')).map(
      (el) => el.textContent,
    );
    expect(values[0]).toBe('2'); // streak
    expect(values[1]).toBe('40'); // minutes this week
  });

  it('lists at most the three most recent sessions, newest first', () => {
    const records = [rec(0, 20, 'A'), rec(1, 20, 'B'), rec(2, 20, 'C'), rec(3, 20, 'D')];
    renderHistory(container, records, { now: TODAY });
    const names = Array.from(container.querySelectorAll('.hist-name')).map(
      (el) => el.textContent,
    );
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('shades a cell by minutes and leaves untrained days at level zero', () => {
    renderHistory(container, [rec(1, 30)], { now: TODAY });
    const cells = Array.from(container.querySelectorAll<HTMLElement>('.hist-cell'));
    const trained = cells.find((c) => c.dataset.key === '2026-07-23')!;
    const rest = cells.find((c) => c.dataset.key === '2026-07-22')!;
    expect(Number(trained.dataset.level)).toBeGreaterThan(0);
    expect(rest.dataset.level).toBe('0');
  });

  it('marks days after today as future', () => {
    renderHistory(container, [], { now: TODAY });
    const cells = Array.from(container.querySelectorAll<HTMLElement>('.hist-cell'));
    expect(cells.find((c) => c.dataset.key === '2026-07-25')!.dataset.future).toBe('true');
  });

  it('fires onPick with the clicked session segments and its program name', () => {
    const picked: Array<[string, string]> = [];
    renderHistory(container, [rec(0, 20, 'A'), rec(1, 20, 'B')], {
      now: TODAY,
      onPick: (segs, name) => picked.push([segs[0].id, name]),
    });
    container.querySelectorAll<HTMLButtonElement>('.hist-item')[1].click();
    expect(picked).toEqual([['seg1', 'B']]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/historyPanel.test.ts`
Expected: FAIL — `Failed to resolve import "../src/ui/historyPanel"`.

- [ ] **Step 3: Implement the panel**

Create `src/ui/historyPanel.ts`:

```ts
import { SessionRecord, Segment } from '../core/types';
import { heatmapDays, historyStats } from '../core/history';
import { formatClock } from './format';

export const HEATMAP_WEEKS = 13;
const RECENT_COUNT = 3;

export interface HistoryPanelOpts {
  /** Load a past workout back into the builder, carrying its provenance label. */
  onPick?: (segments: Segment[], programName: string) => void;
  /** Injectable clock so tests aren't tied to the wall clock. */
  now?: number;
}

/** Four shading steps so a 10-minute day still reads differently from a 30. */
function levelFor(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes < 10) return 1;
  if (minutes < 20) return 2;
  if (minutes < 30) return 3;
  return 4;
}

function weekdayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderHistory(
  container: HTMLElement,
  records: SessionRecord[],
  opts: HistoryPanelOpts = {},
): void {
  const now = opts.now ?? Date.now();
  const stats = historyStats(records, now);
  const cells = heatmapDays(records, now, HEATMAP_WEEKS);

  const grid = cells
    .map((c) => {
      const label = c.future ? c.key : `${c.key} · ${c.minutes} min`;
      return `<span class="hist-cell" data-key="${c.key}" data-level="${
        c.future ? 0 : levelFor(c.minutes)
      }" data-future="${c.future}" title="${label}"></span>`;
    })
    .join('');

  const recent = [...records].sort((a, b) => b.startedAt - a.startedAt).slice(0, RECENT_COUNT);
  const list = recent.length
    ? recent
        .map(
          (r) => `<button class="hist-item" type="button" data-id="${r.id}">
             <span class="hist-when">${weekdayLabel(r.startedAt)}</span>
             <span class="hist-name">${escapeHtml(r.programName)}</span>
             <span class="hist-dur">${formatClock(r.elapsedSec)}</span>
           </button>`,
        )
        .join('')
    : `<p class="hist-empty">Finish a session and it lands here — tap any past workout to load it again.</p>`;

  container.innerHTML = `
    <div class="hist">
      <div class="hist-stats">
        <div class="hist-stat"><b>${stats.currentStreak}</b><span>day streak</span></div>
        <div class="hist-stat"><b>${stats.thisWeekMin}</b><span>min this week</span></div>
        <div class="hist-stat"><b>${stats.totalSessions}</b><span>sessions</span></div>
      </div>
      <div class="hist-grid">${grid}</div>
      <div class="hist-recent">${list}</div>
    </div>`;

  container.querySelectorAll<HTMLButtonElement>('.hist-item').forEach((btn) =>
    btn.addEventListener('click', () => {
      const found = recent.find((r) => r.id === btn.dataset.id);
      if (found) opts.onPick?.(found.segments, found.programName);
    }),
  );
}
```

- [ ] **Step 4: Add the panel styles**

In `src/ui/setupStyles.ts`, append this block to the `SETUP_CSS` template literal, immediately before the closing backtick:

```
  /* ---------- history ---------- */
  .setup .hist-stats { display: flex; gap: 16px; margin-bottom: 14px; }
  .setup .hist-stat b { display: block; font-size: 18px; font-weight: 700;
    font-variant-numeric: tabular-nums; line-height: 1.15; }
  .setup .hist-stat span { font-size: 10.5px; color: var(--mute); }
  .setup .hist-grid { display: grid; grid-auto-flow: column;
    grid-template-rows: repeat(7, 9px); grid-auto-columns: 9px; gap: 2px; }
  .setup .hist-cell { border-radius: 2px; background: var(--border-2); }
  .setup .hist-cell[data-future="true"] { background: transparent; }
  .setup .hist-cell[data-level="1"] { background: color-mix(in oklab, #ff8c42 28%, transparent); }
  .setup .hist-cell[data-level="2"] { background: color-mix(in oklab, #ff8c42 50%, transparent); }
  .setup .hist-cell[data-level="3"] { background: color-mix(in oklab, #ff8c42 74%, transparent); }
  .setup .hist-cell[data-level="4"] { background: #ff8c42; }
  .setup .hist-recent { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
  .setup .hist-item { display: flex; align-items: baseline; gap: 9px; width: 100%;
    text-align: left; background: var(--inset); border: 1px solid var(--border-2);
    border-radius: 9px; padding: 7px 10px; color: var(--text); font: inherit;
    font-size: 12px; cursor: pointer; transition: border-color .15s, background .15s; }
  .setup .hist-item:hover { border-color: var(--border); background: oklch(0.2 0.006 70); }
  .setup .hist-when { color: var(--mute); font-size: 11px; min-width: 26px; }
  .setup .hist-name { flex: 1; font-weight: 650; overflow: hidden;
    text-overflow: ellipsis; white-space: nowrap; }
  .setup .hist-dur { color: var(--dim); font-variant-numeric: tabular-nums; }
  .setup .hist-empty { margin: 0; font-size: 12px; line-height: 1.5; color: var(--mute); }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/historyPanel.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/ui/historyPanel.ts src/ui/setupStyles.ts tests/historyPanel.test.ts
git commit -m "feat(ui): add history panel with heatmap, streak stats, and recent sessions"
```

---

### Task 5: Mount the panel in the setup page

**Files:**
- Modify: `src/ui/setupView.ts`
- Modify: `src/main.ts` (call-site signature only — all recording wiring is Task 6)
- Test: `tests/setupView.test.ts` (append; create the file with the imports shown if it does not exist)

**Interfaces:**
- Consumes: `renderHistory` (Task 4), `Storage.listSessions` (Task 2).
- Produces:
  - `SetupOpts.onStart` becomes `(segments: Segment[], programName: string) => void` — **Task 6 depends on this signature**.
  - `MountedSetup` gains `refreshHistory(): void`.

- [ ] **Step 1: Write the failing tests**

Create or append to `tests/setupView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mountSetup } from '../src/ui/setupView';
import { Storage, type KeyValueStore } from '../src/core/storage';
import { Segment, SessionRecord } from '../src/core/types';

class Mem implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function sess(id: string, name: string): SessionRecord {
  return {
    id,
    startedAt: Date.now() - 3600_000,
    elapsedSec: 600,
    plannedSec: 600,
    completed: true,
    programName: name,
    segments: [{ id: `${id}-seg`, intensity: 'hard', durationSec: 600 }],
  };
}

let container: HTMLElement;
let storage: Storage;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  document.head.innerHTML = '';
  container = document.getElementById('app')!;
  storage = new Storage(new Mem());
});

describe('setup view history panel', () => {
  it('renders the history panel on mount', () => {
    mountSetup(container, { storage, onStart: () => {} });
    expect(container.querySelector('.hist-grid')).not.toBeNull();
  });

  it('passes a generated program name to onStart', () => {
    let name = '';
    const setup = mountSetup(container, {
      storage,
      onStart: (_segments: Segment[], programName: string) => (name = programName),
    });
    expect(setup).toBeTruthy();
    container.querySelector<HTMLButtonElement>('.setup-start')!.click();
    expect(name).toMatch(/^\d+ min · \w+$/);
  });

  it('passes the template name to onStart after loading a template', () => {
    let name = '';
    mountSetup(container, {
      storage,
      onStart: (_segments: Segment[], programName: string) => (name = programName),
    });
    container.querySelector<HTMLButtonElement>('.setup-load')!.click();
    container.querySelector<HTMLButtonElement>('.setup-start')!.click();
    expect(name).toBe('Quick 20');
  });

  it('loads a past session into the editor when picked', () => {
    storage.recordSession(sess('h1', 'Past workout'));
    mountSetup(container, { storage, onStart: () => {} });
    container.querySelector<HTMLButtonElement>('.hist-item')!.click();
    expect(container.querySelectorAll('.seg-row')).toHaveLength(1);
  });

  it('refreshHistory picks up a record written after mount', () => {
    const setup = mountSetup(container, { storage, onStart: () => {} });
    expect(container.querySelectorAll('.hist-item')).toHaveLength(0);
    storage.recordSession(sess('h2', 'Later workout'));
    setup.refreshHistory();
    expect(container.querySelectorAll('.hist-item')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/setupView.test.ts`
Expected: FAIL — no `.hist-grid` element, and `setup.refreshHistory is not a function`.

- [ ] **Step 3: Wire the panel into `setupView.ts`**

Add the import beside the existing UI imports:

```ts
import { renderHistory } from './historyPanel';
```

Change the `onStart` signature in `SetupOpts`:

```ts
export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[], programName: string) => void;
  /** Called when the start button is clicked while a session is active. */
  onStop?: () => void;
}
```

Add `refreshHistory` to `MountedSetup`:

```ts
export interface MountedSetup {
  /** Flip the start button between "Start workout" and "Stop workout". */
  setSessionActive(active: boolean): void;
  /** Re-read history from storage and repaint the panel (call after a session ends). */
  refreshHistory(): void;
}
```

In the template literal, add a History panel **after** the Templates panel and before the Preferences panel:

```html
          <section class="panel">
            <div class="panel-head"><h2>History</h2></div>
            <div class="setup-history"></div>
          </section>
```

After the existing element lookups (near `const startbar = ...`), add:

```ts
  const historyEl = container.querySelector('.setup-history') as HTMLElement;
  // Provenance label for the workout currently in the editor: where it came from,
  // not what it now contains, so it survives manual block edits.
  let programName = '';
```

Replace `renderWorkout` with a version that carries the label:

```ts
  const renderWorkout = (segments: Segment[], name: string) => {
    programName = name;
    renderEditor(editor, segments, { onChange: refreshSummary });
    refreshSummary();
  };
```

Add the history renderer next to `renderTemplates`:

```ts
  const renderHistoryPanel = () => {
    renderHistory(historyEl, opts.storage.listSessions(), {
      onPick: (segments, name) =>
        renderWorkout(
          segments.map((s) => ({ ...s, id: makeId() })),
          name,
        ),
    });
  };
```

Update `doGenerate` to name the workout:

```ts
  const doGenerate = () => {
    // Re-rolls each call; only the random strategy varies (fixed styles ignore the seed).
    seed += 1;
    const mins = snapMinutes(Number(minutesEl.value) || 20);
    const style = strategyEl.value as PushStyle;
    opts.storage.setPrefs({ lastTotalMin: mins, lastPushStyle: style });
    renderWorkout(generate(mins, { pushStyle: style }, seed), `${mins} min · ${style}`);
  };
```

Update the template load handler inside `renderTemplates` to pass the template name:

```ts
        const t = templates.find((x) => x.id === b.dataset.id);
        if (t) renderWorkout(t.segments.map((s) => ({ ...s, id: makeId() })), t.name);
```

Update the start button handler to pass the name:

```ts
    opts.onStart(segments, programName);
```

Finally, update the bottom of `mountSetup` — render the panel on mount, seed the initial workout with a name, and return `refreshHistory`:

```ts
  renderTemplates();
  renderHistoryPanel();
  // Start with a ready-to-run workout so the page is never an empty form.
  renderWorkout(
    generate(initialMin, { pushStyle: initialStyle }, seed),
    `${initialMin} min · ${initialStyle}`,
  );

  return { setSessionActive, refreshHistory: renderHistoryPanel };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/setupView.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Keep the browser host compiling**

`onStart` now takes a second argument, which breaks the `src/main.ts` call site.
Update the signature only — the recorder wiring is Task 6's job. In `src/main.ts`,
change `startSession` to accept and ignore the name for now:

```ts
async function startSession(segments: Segment[], _programName: string) {
```

Do not change anything else in `src/main.ts` in this task.

- [ ] **Step 6: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: both clean — no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/setupView.ts src/main.ts tests/setupView.test.ts
git commit -m "feat(ui): mount history panel in the setup rail and track program provenance"
```

---

### Task 6: Record sessions from both hosts

**Files:**
- Modify: `src/electron.d.ts`
- Modify: `src/main.ts`
- Modify: `src/overlay-entry.ts`

**Interfaces:**
- Consumes: `createRecorder` (Task 3), `setup.refreshHistory` and the two-argument `onStart` (Task 5).
- Produces: nothing further; this is the final wiring.

- [ ] **Step 1: Add the program name to the Electron payload**

In `src/electron.d.ts`:

```ts
/** Payload handed from the setup window to the native overlay window. */
export interface SessionPayload {
  segments: Segment[];
  prefs: Prefs;
  /** Provenance label for history, e.g. 'Quick 20' or '20 min · random'. */
  name: string;
}
```

`electron/preload.cjs` and `electron/app.cjs` forward the payload opaquely and need no change.

- [ ] **Step 2: Record from the browser host**

In `src/main.ts`, add the import:

```ts
import { createRecorder, SessionRecorder } from './core/sessionRecorder';
```

Add a module-level handle beside the other session state:

```ts
let recorder: SessionRecorder | null = null;
```

Change `wireAudio` to also record on natural completion. Replace the `complete` branch:

```ts
    else if (e.type === 'complete') {
      tone.playComplete();
      recorder?.finish(engine.getState().totalElapsedSec, true);
      setup.refreshHistory();
    }
```

Change `startSession` to use the name (Task 5 left it as the ignored `_programName`) and build the recorder. Replace its signature and the Electron branch:

```ts
async function startSession(segments: Segment[], programName: string) {
  if (window.electronAPI) {
    window.electronAPI.startSession({ segments, prefs: storage.getPrefs(), name: programName });
    sessionActive = true;
    setup.setSessionActive(true);
    return;
  }
```

Then, immediately after `const engine = new SessionEngine(segments);`, add:

```ts
  recorder = createRecorder(storage, { segments, programName, startedAt: Date.now() });
```

In `endSession`, record the elapsed time for an early stop. The engine handle isn't in scope there, so capture it — add a module-level `let currentEngine: SessionEngine | null = null;` beside `recorder`, assign it in `startSession` right after the engine is constructed:

```ts
  currentEngine = engine;
```

and update `endSession`:

```ts
function endSession() {
  tearingDown = true;
  sessionActive = false;
  setup.setSessionActive(false);
  cancelAnimationFrame(rafId);
  // No-op if the session already completed naturally — the recorder writes once.
  if (currentEngine) recorder?.finish(currentEngine.getState().totalElapsedSec, false);
  recorder = null;
  currentEngine = null;
  setup.refreshHistory();
  mounted?.unmount();
  mounted = null;
  host?.close();
  host = null;
  fallbackEl?.remove();
  fallbackEl = null;
  document.querySelector('.reopen-bar')?.remove();
}
```

Finally, refresh history when Electron reports the session ended (the overlay window did the recording):

```ts
window.electronAPI?.onSessionEnded(() => {
  sessionActive = false;
  setup.setSessionActive(false);
  setup.refreshHistory();
});
```

- [ ] **Step 3: Record from the Electron overlay host**

In `src/overlay-entry.ts`, add the import:

```ts
import { createRecorder } from './core/sessionRecorder';
```

Inside `runSession`, after `const engine = new SessionEngine(segments);`, add:

```ts
  const recorder = createRecorder(storage, {
    segments,
    programName: payload.name,
    startedAt: Date.now(),
  });
```

Record on natural completion — update the `complete` branch of the engine listener:

```ts
    else if (e.type === 'complete') {
      tone.playComplete();
      recorder.finish(engine.getState().totalElapsedSec, true);
    }
```

Record on an early stop — update the overlay's `onStop`:

```ts
    onStop: () => {
      cancelAnimationFrame(rafId);
      recorder.finish(engine.getState().totalElapsedSec, false);
      window.electronAPI?.stopSession();
    },
```

- [ ] **Step 4: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: both clean.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, open http://localhost:5173 in Chrome.

1. The right rail shows a History panel with a 91-cell grid and the empty-state copy.
2. Click **Start workout**, let it run ~10 seconds, then stop it from the overlay.
3. The panel now shows one recent session, streak `0` (under the 5-minute floor), and today's cell shaded at level 1.
4. Click the recent session — its blocks load into the editor.

- [ ] **Step 6: Verify in Electron**

Run: `npm run electron:dev`.

1. Start a workout; the overlay window opens.
2. Stop it from the overlay's stop button.
3. The setup window's History panel updates without a reload (via `onSessionEnded`).

- [ ] **Step 7: Commit**

```bash
git add src/electron.d.ts src/main.ts src/overlay-entry.ts
git commit -m "feat: record sessions from both the browser and Electron hosts"
```

---

## Verification

After Task 6, the full feature is live. Final check:

```bash
npm test && npm run typecheck
```

Expected: all tests pass, no type errors.
