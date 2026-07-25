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
