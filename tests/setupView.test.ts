import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountSetup } from '../src/ui/setupView';
import { Storage, type KeyValueStore } from '../src/core/storage';
import type { Segment } from '../src/core/types';

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

let container: HTMLElement;
let storage: Storage;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  container = document.getElementById('app')!;
  storage = new Storage(new Mem());
});

describe('setup view', () => {
  it('lists starter templates', () => {
    mountSetup(container, { storage, onStart: () => {} });
    expect(container.textContent).toContain('Quick 20');
    expect(container.textContent).toContain('Short sprints');
  });

  it('Generate populates the editor with segments', () => {
    mountSetup(container, { storage, onStart: () => {} });
    (container.querySelector('.setup-minutes') as HTMLSelectElement).value = '20';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    expect(container.querySelectorAll('.seg-row').length).toBeGreaterThan(0);
  });

  it('Start hands the current segments to onStart', () => {
    const onStart = vi.fn();
    mountSetup(container, { storage, onStart });
    (container.querySelector('.setup-minutes') as HTMLSelectElement).value = '20';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    (container.querySelector('.setup-start') as HTMLButtonElement).click();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('Save persists the edited segments as a template', () => {
    mountSetup(container, { storage, onStart: () => {} });
    (container.querySelector('.setup-minutes') as HTMLSelectElement).value = '20';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    (container.querySelector('.setup-name') as HTMLInputElement).value = 'My session';
    (container.querySelector('.setup-save') as HTMLButtonElement).click();
    expect(storage.listTemplates().some((t) => t.name === 'My session')).toBe(true);
  });

  it('offers only 10/20/30-minute durations', () => {
    mountSetup(container, { storage, onStart: () => {} });
    const select = container.querySelector('.setup-minutes') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['10', '20', '30']);
    expect(select.value).toBe('20'); // default pref lastTotalMin=20 is pre-selected
  });

  it('offers all five push strategies', () => {
    mountSetup(container, { storage, onStart: () => {} });
    const select = container.querySelector('.setup-strategy') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['long', 'steps', 'repeats', 'crazy', 'random']);
    expect(select.value).toBe('random'); // default pref lastPushStyle=random is pre-selected
  });

  it('generates using the selected strategy', () => {
    const onStart = vi.fn();
    mountSetup(container, { storage, onStart });
    (container.querySelector('.setup-minutes') as HTMLSelectElement).value = '10';
    (container.querySelector('.setup-strategy') as HTMLSelectElement).value = 'crazy';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    (container.querySelector('.setup-start') as HTMLButtonElement).click();
    const segments = onStart.mock.calls[0][0] as Segment[];
    // A crazy push is a single 420s hard block with no all-outs — unique among styles.
    expect(segments.some((s) => s.intensity === 'hard' && s.durationSec === 420)).toBe(true);
    expect(segments.some((s) => s.intensity === 'allout')).toBe(false);
  });

  it('remembers the last-used strategy across mounts', () => {
    mountSetup(container, { storage, onStart: () => {} });
    (container.querySelector('.setup-strategy') as HTMLSelectElement).value = 'steps';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    // Re-mount with the same storage; the strategy should be pre-selected.
    document.body.innerHTML = '<div id="app"></div>';
    const remounted = document.getElementById('app')!;
    mountSetup(remounted, { storage, onStart: () => {} });
    expect((remounted.querySelector('.setup-strategy') as HTMLSelectElement).value).toBe('steps');
  });
});
