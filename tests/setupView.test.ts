import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountSetup, summarize } from '../src/ui/setupView';
import { Storage, type KeyValueStore } from '../src/core/storage';
import type { Segment, SessionRecord } from '../src/core/types';
import { parseWorkout } from '../src/core/shareFormat';
import { starterTemplates } from '../src/core/starters';

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

  it('toggles to Stop while a session is active and calls onStop instead of onStart', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const setup = mountSetup(container, { storage, onStart, onStop });
    const btn = container.querySelector('.setup-start') as HTMLButtonElement;
    expect(btn.textContent).toContain('Start workout');

    setup.setSessionActive(true);
    expect(btn.textContent).toContain('Stop workout');

    btn.click();
    expect(onStop).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('reverts to Start once the session ends', () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const setup = mountSetup(container, { storage, onStart, onStop });
    const btn = container.querySelector('.setup-start') as HTMLButtonElement;

    setup.setSessionActive(true);
    setup.setSessionActive(false);
    expect(btn.textContent).toContain('Start workout');

    btn.click();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStop).not.toHaveBeenCalled();
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

  it('starts with a ready-to-run workout (not an empty form)', () => {
    mountSetup(container, { storage, onStart: () => {} });
    expect(container.querySelectorAll('.seg-row').length).toBeGreaterThan(0);
    // Start bar reflects a non-empty workout.
    expect((container.querySelector('.setup-startbar') as HTMLElement).dataset.empty).toBe('false');
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

describe('setup view templates list with untrusted names', () => {
  // Template names (and, once imports land, ids) can come from a shared file, so
  // they must render as text and never as markup.
  const HOSTILE_NAME = '<img src=x onerror=alert(1)>';
  const HOSTILE_ID = 'tpl" onmouseover="alert(1)<b>';
  const hostileTemplate = () => ({
    id: HOSTILE_ID,
    name: HOSTILE_NAME,
    segments: [
      { id: 'h-1', intensity: 'easy' as const, durationSec: 60 },
      { id: 'h-2', intensity: 'hard' as const, durationSec: 120 },
    ],
  });
  const hostileRow = () =>
    Array.from(container.querySelectorAll<HTMLElement>('.setup-tpl')).find(
      (row) => row.dataset.id === HOSTILE_ID,
    );

  it('shows a name containing HTML as literal text, creating no elements', () => {
    storage.saveTemplate(hostileTemplate());
    mountSetup(container, { storage, onStart: () => {} });
    const list = container.querySelector('.setup-tpl-list')!;
    expect(list.querySelector('img')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
    const row = hostileRow();
    expect(row).toBeDefined();
    expect(row!.querySelector('.t-name')!.textContent).toBe(HOSTILE_NAME);
  });

  it('keeps a hostile id inside its data-id attributes', () => {
    storage.saveTemplate(hostileTemplate());
    mountSetup(container, { storage, onStart: () => {} });
    const row = hostileRow()!;
    for (const el of [row, row.querySelector('.setup-load')!, row.querySelector('.setup-del')!]) {
      expect(el.getAttribute('onmouseover')).toBeNull();
      expect((el as HTMLElement).dataset.id).toBe(HOSTILE_ID);
    }
  });

  it('Load still finds the template by its escaped id', () => {
    storage.saveTemplate(hostileTemplate());
    let name = '';
    let segments: Segment[] = [];
    mountSetup(container, {
      storage,
      onStart: (s: Segment[], programName: string) => {
        segments = s;
        name = programName;
      },
    });
    hostileRow()!.querySelector<HTMLButtonElement>('.setup-load')!.click();
    expect(container.querySelectorAll('.seg-row')).toHaveLength(2);
    container.querySelector<HTMLButtonElement>('.setup-start')!.click();
    expect(name).toBe(HOSTILE_NAME);
    expect(segments.map((s) => [s.intensity, s.durationSec])).toEqual([
      ['easy', 60],
      ['hard', 120],
    ]);
  });

  it('Delete still removes the template by its escaped id', () => {
    storage.saveTemplate(hostileTemplate());
    mountSetup(container, { storage, onStart: () => {} });
    hostileRow()!.querySelector<HTMLButtonElement>('.setup-del')!.click();
    expect(storage.listTemplates()).toHaveLength(0);
    expect(hostileRow()).toBeUndefined();
  });

  it('shows a name containing HTML typed into Save as literal text', () => {
    mountSetup(container, { storage, onStart: () => {} });
    (container.querySelector('.setup-name') as HTMLInputElement).value = HOSTILE_NAME;
    (container.querySelector('.setup-save') as HTMLButtonElement).click();
    const list = container.querySelector('.setup-tpl-list')!;
    expect(list.querySelector('img')).toBeNull();
    const names = Array.from(list.querySelectorAll('.t-name')).map((n) => n.textContent);
    expect(names).toContain(HOSTILE_NAME);
  });
});

describe('summarize', () => {
  it('totals duration, counts blocks, and counts work blocks', () => {
    const s = summarize([
      { id: 'a', intensity: 'easy', durationSec: 180 }, // rest
      { id: 'b', intensity: 'hard', durationSec: 120 }, // work
      { id: 'c', intensity: 'allout', durationSec: 60 }, // work
      { id: 'd', intensity: 'medium', durationSec: 40 }, // rest
    ]);
    expect(s.totalSec).toBe(400);
    expect(s.blocks).toBe(4);
    expect(s.workBlocks).toBe(2);
  });

  it('is all zeros for an empty workout', () => {
    expect(summarize([])).toEqual({ totalSec: 0, blocks: 0, workBlocks: 0 });
  });
});

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

  it('passes the picked session\'s original program name to onStart', () => {
    storage.recordSession(sess('h1', 'Past workout'));
    let name = '';
    mountSetup(container, {
      storage,
      onStart: (_segments: Segment[], programName: string) => (name = programName),
    });
    container.querySelector<HTMLButtonElement>('.hist-item')!.click();
    container.querySelector<HTMLButtonElement>('.setup-start')!.click();
    expect(name).toBe('Past workout');
  });

  it('regenerating via a duration button updates the onStart program name', () => {
    let name = '';
    mountSetup(container, {
      storage,
      onStart: (_segments: Segment[], programName: string) => (name = programName),
    });
    const btn = container.querySelector<HTMLButtonElement>(
      '.setup-minutes-group button[data-min="10"]',
    )!;
    btn.click();
    container.querySelector<HTMLButtonElement>('.setup-start')!.click();
    expect(name).toMatch(/^10 min · \w+$/);
  });

  it('refreshHistory picks up a record written after mount', () => {
    const setup = mountSetup(container, { storage, onStart: () => {} });
    expect(container.querySelectorAll('.hist-item')).toHaveLength(0);
    storage.recordSession(sess('h2', 'Later workout'));
    setup.refreshHistory();
    expect(container.querySelectorAll('.hist-item')).toHaveLength(1);
  });
});

describe('setup view export', () => {
  type FakeShare = {
    download: ReturnType<typeof vi.fn<(fileName: string, text: string) => void>>;
    copy: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
  };
  const fakeShare = (copyFails = false): FakeShare => ({
    download: vi.fn<(fileName: string, text: string) => void>(),
    copy: vi.fn<(text: string) => Promise<void>>(() =>
      copyFails ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(),
    ),
  });

  const q = <T extends Element = HTMLElement>(sel: string, root: ParentNode = container) =>
    root.querySelector(sel) as T;
  const toast = () => q('.setup-toast');
  const menu = () => q('.export-menu');
  const menuOpen = () => menu() !== null && !menu().hidden;
  const pick = (action: 'download' | 'copy') =>
    q<HTMLButtonElement>(`.export-menu [data-action="${action}"]`).click();
  const editorShape = () =>
    Array.from(container.querySelectorAll('.seg-row')).map((row) => [
      (row.querySelector('.seg-intensity') as HTMLSelectElement).value,
      Number((row.querySelector('.seg-dur') as HTMLInputElement).value),
    ]);
  const shapeOf = (text: string) => {
    const parsed = parseWorkout(text);
    if (!parsed.ok) throw new Error(parsed.error);
    return {
      name: parsed.workout.name,
      segments: parsed.workout.segments.map((s) => [s.intensity, s.durationSec]),
    };
  };
  const tplRow = (name: string) =>
    Array.from(container.querySelectorAll<HTMLElement>('.setup-tpl')).find(
      (row) => row.querySelector('.t-name')!.textContent === name,
    )!;

  it('puts an Export control next to Save', () => {
    mountSetup(container, { storage, onStart: () => {}, share: fakeShare() });
    const save = q('.setup-save');
    const exportBtn = q('.setup-export');
    expect(exportBtn).not.toBeNull();
    expect(save.parentElement!.contains(exportBtn)).toBe(true);
    expect(exportBtn.textContent).toContain('Export');
  });

  it('downloads the builder workout as <name>.json, named from the name field', () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    q<HTMLInputElement>('.setup-name').value = '  Leg day ';
    q<HTMLButtonElement>('.setup-export').click();
    expect(menuOpen()).toBe(true);
    pick('download');

    expect(share.download).toHaveBeenCalledOnce();
    const [fileName, text] = share.download.mock.calls[0];
    expect(fileName).toBe('Leg day.json');
    expect(JSON.parse(text)).toMatchObject({ format: 'rowalong-workout', version: 1 });
    expect(shapeOf(text)).toEqual({ name: 'Leg day', segments: editorShape() });
    expect(menuOpen()).toBe(false);
    expect(toast().textContent).toContain('Leg day.json');
  });

  it('falls back to the program name when the name field is empty', () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    tplRow('Short sprints').querySelector<HTMLButtonElement>('.setup-load')!.click();
    q<HTMLButtonElement>('.setup-export').click();
    pick('download');
    const [fileName, text] = share.download.mock.calls[0];
    expect(fileName).toBe('Short sprints.json');
    expect(shapeOf(text).name).toBe('Short sprints');
  });

  it('names a freshly generated workout after its program', () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    q<HTMLButtonElement>('.setup-minutes-group button[data-min="10"]').click();
    q<HTMLButtonElement>('.setup-export').click();
    pick('download');
    expect(shapeOf(share.download.mock.calls[0][1]).name).toMatch(/^10 min · \w+$/);
  });

  it('exports the blocks as edited, not as generated', () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    const dur = q<HTMLInputElement>('.seg-row .seg-dur');
    dur.value = '45';
    dur.dispatchEvent(new Event('input', { bubbles: true }));
    q<HTMLButtonElement>('.setup-export').click();
    pick('download');
    expect(shapeOf(share.download.mock.calls[0][1]).segments[0][1]).toBe(45);
  });

  it('copies the same text it would download, and confirms', async () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    q<HTMLInputElement>('.setup-name').value = 'Leg day';
    q<HTMLButtonElement>('.setup-export').click();
    pick('download');
    q<HTMLButtonElement>('.setup-export').click();
    pick('copy');

    expect(share.copy).toHaveBeenCalledOnce();
    expect(share.copy.mock.calls[0][0]).toBe(share.download.mock.calls[0][1]);
    await vi.waitFor(() => expect(toast().textContent).toMatch(/Copied .*Leg day.* to the clipboard/));
    expect(toast().dataset.tone).toBe('ok');
  });

  it('shows a message when copying fails', async () => {
    const share = fakeShare(true);
    mountSetup(container, { storage, onStart: () => {}, share });
    q<HTMLButtonElement>('.setup-export').click();
    pick('copy');
    await vi.waitFor(() => expect(toast().textContent).toContain("Couldn't copy"));
    expect(toast().dataset.tone).toBe('error');
  });

  it('hides the confirmation after a moment', () => {
    vi.useFakeTimers();
    try {
      mountSetup(container, { storage, onStart: () => {}, share: fakeShare() });
      q<HTMLButtonElement>('.setup-export').click();
      pick('download');
      expect(toast().dataset.show).toBe('true');
      vi.advanceTimersByTime(10_000);
      expect(toast().dataset.show).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('announces confirmations to assistive tech', () => {
    mountSetup(container, { storage, onStart: () => {}, share: fakeShare() });
    expect(toast().getAttribute('role')).toBe('status');
    expect(toast().getAttribute('aria-live')).toBe('polite');
  });

  it('refuses to export a workout that would not import, without opening the menu', () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    const dur = q<HTMLInputElement>('.seg-row .seg-dur');
    dur.value = '7'; // not a multiple of 5 s
    dur.dispatchEvent(new Event('input', { bubbles: true }));
    q<HTMLButtonElement>('.setup-export').click();

    expect(menuOpen()).toBe(false);
    expect(toast().dataset.tone).toBe('error');
    expect(toast().textContent).toContain("Can't export this workout");
    expect(share.download).not.toHaveBeenCalled();
    expect(share.copy).not.toHaveBeenCalled();
  });

  it('puts an export icon on every Templates row, starters included', () => {
    storage.saveTemplate({
      id: 'mine',
      name: 'Mine',
      segments: [{ id: 'm1', intensity: 'medium', durationSec: 300 }],
    });
    mountSetup(container, { storage, onStart: () => {}, share: fakeShare() });
    const rows = Array.from(container.querySelectorAll('.setup-tpl'));
    expect(rows.length).toBe(starterTemplates().length + 1);
    for (const row of rows) expect(row.querySelector('.setup-export-tpl')).not.toBeNull();
  });

  it('exports a starter template by its name, with its segments', () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    tplRow('Quick 20').querySelector<HTMLButtonElement>('.setup-export-tpl')!.click();
    expect(menuOpen()).toBe(true);
    pick('download');

    const starter = starterTemplates().find((t) => t.name === 'Quick 20')!;
    const [fileName, text] = share.download.mock.calls[0];
    expect(fileName).toBe('Quick 20.json');
    expect(shapeOf(text)).toEqual({
      name: 'Quick 20',
      segments: starter.segments.map((s) => [s.intensity, s.durationSec]),
    });
  });

  it('exports a template without loading it into the builder or touching storage', async () => {
    const share = fakeShare();
    storage.saveTemplate({
      id: 'mine',
      name: 'Mine',
      segments: [{ id: 'm1', intensity: 'medium', durationSec: 300, label: 'Steady' }],
    });
    mountSetup(container, { storage, onStart: () => {}, share });
    const before = editorShape();
    const stored = JSON.stringify(storage.listTemplates());
    tplRow('Mine').querySelector<HTMLButtonElement>('.setup-export-tpl')!.click();
    pick('copy');

    const payload = JSON.parse(share.copy.mock.calls[0][0]);
    expect(payload).toMatchObject({
      name: 'Mine',
      segments: [{ intensity: 'medium', durationSec: 300, label: 'Steady' }],
    });
    expect(editorShape()).toEqual(before);
    expect(JSON.stringify(storage.listTemplates())).toBe(stored);
    await vi.waitFor(() => expect(toast().textContent).toContain('Mine'));
  });

  it('shows a template name containing HTML as text in the confirmation', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const share = fakeShare();
    storage.saveTemplate({
      id: 'h',
      name: hostile,
      segments: [{ id: 'h1', intensity: 'easy', durationSec: 60 }],
    });
    mountSetup(container, { storage, onStart: () => {}, share });
    tplRow(hostile).querySelector<HTMLButtonElement>('.setup-export-tpl')!.click();
    pick('copy');
    await vi.waitFor(() => expect(toast().textContent).toContain(hostile));
    expect(container.querySelector('img')).toBeNull();
    expect(shapeOf(share.copy.mock.calls[0][0]).name).toBe(hostile);
  });

  it('closes the menu on Escape, returning focus to its button', () => {
    mountSetup(container, { storage, onStart: () => {}, share: fakeShare() });
    const btn = q<HTMLButtonElement>('.setup-export');
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(q('.export-menu [data-action="download"]'));
    (document.activeElement as HTMLElement).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(menuOpen()).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });

  it('closes the menu on a click elsewhere, and toggles from its own button', () => {
    mountSetup(container, { storage, onStart: () => {}, share: fakeShare() });
    const btn = q<HTMLButtonElement>('.setup-export');
    btn.click();
    q('.panel-head').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menuOpen()).toBe(false);
    btn.click();
    expect(menuOpen()).toBe(true);
    btn.click();
    expect(menuOpen()).toBe(false);
  });

  it('moves the menu to whichever export control opened it', () => {
    const share = fakeShare();
    mountSetup(container, { storage, onStart: () => {}, share });
    q<HTMLButtonElement>('.setup-export').click();
    tplRow('Short sprints').querySelector<HTMLButtonElement>('.setup-export-tpl')!.click();
    expect(container.querySelectorAll('.export-menu')).toHaveLength(1);
    expect(tplRow('Short sprints').contains(menu())).toBe(true);
    expect(q('.setup-export').getAttribute('aria-expanded')).toBe('false');
    pick('download');
    expect(share.download.mock.calls[0][0]).toBe('Short sprints.json');
  });

  it('downloads and copies through the browser APIs by default', async () => {
    const clicked: string[] = [];
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/2');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      mountSetup(container, { storage, onStart: () => {} });
      tplRow('Quick 20').querySelector<HTMLButtonElement>('.setup-export-tpl')!.click();
      pick('download');
      expect(clicked).toEqual(['Quick 20.json']);
      tplRow('Quick 20').querySelector<HTMLButtonElement>('.setup-export-tpl')!.click();
      pick('copy');
      await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      expect(shapeOf(writeText.mock.calls[0][0]).name).toBe('Quick 20');
    } finally {
      vi.restoreAllMocks();
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
});
