import { describe, it, expect, beforeEach } from 'vitest';
import { renderEditor, readEditor } from '../src/ui/segmentEditor';
import { Segment } from '../src/core/types';

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
});
