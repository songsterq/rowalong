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
