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

  it('escapes a hostile program name instead of injecting markup', () => {
    const hostile = rec(0, 20, '<img src=x onerror=alert(1)>');
    renderHistory(container, [hostile], { now: TODAY });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.hist-name')!.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('escapes a hostile session id instead of breaking out of the data-id attribute', () => {
    const hostile = rec(0, 20, 'A');
    hostile.id = 'x" onmouseover="alert(1)';
    renderHistory(container, [hostile], { now: TODAY });
    const btn = container.querySelector<HTMLButtonElement>('.hist-item')!;
    expect(btn.getAttribute('onmouseover')).toBeNull();
    expect(btn.dataset.id).toBe('x" onmouseover="alert(1)');
  });
});
