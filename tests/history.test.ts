import { describe, it, expect } from 'vitest';
import {
  dayKey,
  heatmapDays,
  historyStats,
  STREAK_MIN_MINUTES,
  DayCell,
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

describe('DST transitions', () => {
  // Vitest runs pinned to America/Los_Angeles (see vite.config.ts `test.env.TZ`).
  // 2026 spring-forward is Sun 2026-03-08 (2:00am -> 3:00am); fall-back is
  // Sun 2026-11-01 (2:00am -> 1:00am). A day-stepping bug (e.g. adding a fixed
  // 24h instead of using setDate) would drop or duplicate the transition day.

  /** A record `daysAgo` before `base`, at local noon so DST shifts can't move
   *  the calendar date the record lands on. */
  function recBefore(base: Date, daysAgo: number, minutes: number): SessionRecord {
    const d = new Date(base);
    d.setDate(d.getDate() - daysAgo);
    return {
      id: `dst-${base.getTime()}-${daysAgo}-${minutes}`,
      startedAt: d.getTime(),
      elapsedSec: minutes * 60,
      plannedSec: minutes * 60,
      completed: true,
      programName: 'Quick 20',
      segments: [{ id: 's', intensity: 'easy', durationSec: minutes * 60 }],
    };
  }

  function expectConsecutiveNoDupes(cells: DayCell[], expectedLength: number) {
    expect(cells).toHaveLength(expectedLength);
    expect(new Set(cells.map((c) => c.key)).size).toBe(expectedLength);
    for (let i = 1; i < cells.length; i++) {
      const prev = new Date(cells[i - 1].key + 'T12:00:00').getTime();
      const cur = new Date(cells[i].key + 'T12:00:00').getTime();
      expect(Math.round((cur - prev) / DAY_MS)).toBe(1);
    }
  }

  describe('spring-forward (2026-03-08)', () => {
    // Mon 2026-03-09; the prior week (weeks=2) covers Mon 03-02 .. Sun 03-08,
    // so the window straddles the transition night of 03-07 -> 03-08.
    const TODAY_SPRING = new Date(2026, 2, 9, 12, 0, 0).getTime();

    it('heatmapDays still yields weeks * 7 consecutive, non-duplicated days', () => {
      const cells = heatmapDays([], TODAY_SPRING, 2);
      expectConsecutiveNoDupes(cells, 14);
      expect(cells[0].key).toBe('2026-03-02');
      expect(cells[cells.length - 1].key).toBe('2026-03-15');
      expect(cells.some((c) => c.key === '2026-03-08')).toBe(true);
    });

    it('historyStats streak counts each day once across the transition', () => {
      const base = new Date(2026, 2, 10, 12, 0, 0); // Tue, after the transition
      const recs = [0, 1, 2, 3].map((daysAgo) => recBefore(base, daysAgo, 20));
      // daysAgo 0..3 => Mar 10, 9, 8, 7 -> 4 consecutive active days.
      expect(historyStats(recs, base.getTime()).currentStreak).toBe(4);
    });
  });

  describe('fall-back (2026-11-01)', () => {
    // Mon 2026-11-02; the prior week (weeks=2) covers Mon 10-26 .. Sun 11-01,
    // so the window straddles the transition night of 11-01 -> 11-02.
    const TODAY_FALL = new Date(2026, 10, 2, 12, 0, 0).getTime();

    it('heatmapDays still yields weeks * 7 consecutive, non-duplicated days', () => {
      const cells = heatmapDays([], TODAY_FALL, 2);
      expectConsecutiveNoDupes(cells, 14);
      expect(cells[0].key).toBe('2026-10-26');
      expect(cells[cells.length - 1].key).toBe('2026-11-08');
      expect(cells.some((c) => c.key === '2026-11-01')).toBe(true);
    });

    it('historyStats streak counts each day once across the transition', () => {
      const base = new Date(2026, 10, 3, 12, 0, 0); // Tue, after the transition
      const recs = [0, 1, 2, 3].map((daysAgo) => recBefore(base, daysAgo, 20));
      // daysAgo 0..3 => Nov 3, 2, 1, Oct 31 -> 4 consecutive active days.
      expect(historyStats(recs, base.getTime()).currentStreak).toBe(4);
    });
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
