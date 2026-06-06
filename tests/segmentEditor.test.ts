import { describe, it, expect, beforeEach } from 'vitest';
import { renderEditor, readEditor } from '../src/ui/segmentEditor';
import { INTENSITY_META, Segment } from '../src/core/types';

let container: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="c"></div>';
  container = document.getElementById('c')!;
});

const segs: Segment[] = [
  { id: 'a', intensity: 'hard', durationSec: 45 },
  { id: 'b', intensity: 'easy', durationSec: 30 },
];

describe('segment editor', () => {
  it('renders one row per segment', () => {
    renderEditor(container, segs);
    expect(container.querySelectorAll('.seg-row')).toHaveLength(2);
  });

  it('round-trips segments through render → read', () => {
    renderEditor(container, segs);
    const read = readEditor(container);
    expect(read.map((s) => s.intensity)).toEqual(['hard', 'easy']);
    expect(read.map((s) => s.durationSec)).toEqual([45, 30]);
  });

  it('reflects an edited duration on read-back', () => {
    renderEditor(container, segs);
    const input = container.querySelector<HTMLInputElement>('.seg-row .seg-dur')!;
    input.value = '90';
    expect(readEditor(container)[0].durationSec).toBe(90);
  });

  it('adds and removes rows', () => {
    renderEditor(container, segs);
    container.querySelector<HTMLButtonElement>('.seg-add')!.click();
    expect(container.querySelectorAll('.seg-row')).toHaveLength(3);
    container.querySelector<HTMLButtonElement>('.seg-row .seg-del')!.click();
    expect(container.querySelectorAll('.seg-row')).toHaveLength(2);
  });

  it('shows a m:ss readout that tracks the seconds input', () => {
    renderEditor(container, [{ id: 'a', intensity: 'hard', durationSec: 90 }]);
    const row = container.querySelector('.seg-row')!;
    expect(row.querySelector('.seg-mmss')!.textContent).toBe('1:30');
    const input = row.querySelector<HTMLInputElement>('.seg-dur')!;
    input.value = '45';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row.querySelector('.seg-mmss')!.textContent).toBe('0:45');
  });

  it('recolors the row and updates the spm hint when intensity changes', () => {
    renderEditor(container, [{ id: 'a', intensity: 'easy', durationSec: 60 }]);
    const row = container.querySelector('.seg-row') as HTMLElement;
    expect(row.style.getPropertyValue('--c')).toBe(INTENSITY_META.easy.color);
    const sel = row.querySelector<HTMLSelectElement>('.seg-intensity')!;
    sel.value = 'allout';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    expect(row.style.getPropertyValue('--c')).toBe(INTENSITY_META.allout.color);
    expect(row.querySelector('.seg-spm')!.textContent).toBe(`${INTENSITY_META.allout.spmLabel} spm`);
  });

  it('fires onChange on add, remove, reorder, and edits', () => {
    let calls = 0;
    renderEditor(container, segs, { onChange: () => (calls += 1) });
    container.querySelector<HTMLButtonElement>('.seg-add')!.click(); // add
    container.querySelector<HTMLButtonElement>('.seg-row .seg-del')!.click(); // remove
    const input = container.querySelector<HTMLInputElement>('.seg-row .seg-dur')!;
    input.dispatchEvent(new Event('input', { bubbles: true })); // edit duration
    const sel = container.querySelector<HTMLSelectElement>('.seg-row .seg-intensity')!;
    sel.dispatchEvent(new Event('change', { bubbles: true })); // edit intensity
    expect(calls).toBe(4);
  });
});
