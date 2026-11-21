import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountSetup, summarize } from '../src/ui/setupView';
import { readEditor } from '../src/ui/segmentEditor';
import { Storage, type KeyValueStore } from '../src/core/storage';
import { exportWorkout, parseWorkout, SHARE_LIMITS } from '../src/core/shareFormat';
import { starterTemplates } from '../src/core/starters';
import type { Segment, SessionRecord } from '../src/core/types';

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
let mem: Mem;
let storage: Storage;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  container = document.getElementById('app')!;
  mem = new Mem();
  storage = new Storage(mem);
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

describe('setup view templates list', () => {
  const tpl = (id: string, name: string) => ({
    id,
    name,
    segments: [{ id: `${id}-seg`, intensity: 'hard' as const, durationSec: 60 }],
  });
  const rowFor = (id: string) =>
    Array.from(container.querySelectorAll<HTMLElement>('.setup-tpl')).find(
      (el) => el.dataset.id === id,
    )!;

  it('renders a template name containing HTML as plain text, not markup', () => {
    const hostile = '<img src=x onerror=alert(1)><b>bold</b> & "q"';
    storage.saveTemplate(tpl('t1', hostile));
    mountSetup(container, { storage, onStart: () => {} });
    const list = container.querySelector('.setup-tpl-list')!;
    expect(list.querySelector('img')).toBeNull();
    expect(list.querySelector('b')).toBeNull();
    expect(rowFor('t1').querySelector('.t-name')!.textContent).toBe(hostile);
  });

  it('keeps a hostile template id inside its data-id attribute', () => {
    const id = 'x" onmouseover="alert(1)';
    storage.saveTemplate(tpl(id, 'Sneaky'));
    mountSetup(container, { storage, onStart: () => {} });
    const row = rowFor(id);
    expect(row).toBeTruthy();
    for (const el of [row, row.querySelector('.setup-load')!, row.querySelector('.setup-del')!]) {
      expect(el.getAttribute('onmouseover')).toBeNull();
      expect((el as HTMLElement).dataset.id).toBe(id);
    }
  });

  it('still loads and deletes a template whose name and id contain HTML', () => {
    const id = '<i>"t2"</i>';
    const name = '<script>alert(1)</script>';
    storage.saveTemplate(tpl(id, name));
    let started = '';
    mountSetup(container, { storage, onStart: (_s, programName) => (started = programName) });

    rowFor(id).querySelector<HTMLButtonElement>('.setup-load')!.click();
    container.querySelector<HTMLButtonElement>('.setup-start')!.click();
    expect(started).toBe(name);

    rowFor(id).querySelector<HTMLButtonElement>('.setup-del')!.click();
    expect(storage.listTemplates().some((t) => t.id === id)).toBe(false);
    expect(container.querySelector('.setup-tpl-list')!.textContent).not.toContain(name);
  });
});

describe('setup view import', () => {
  const shared: Segment[] = [
    { id: 'x1', intensity: 'easy', durationSec: 120, label: 'Warm-up' },
    { id: 'x2', intensity: 'allout', durationSec: 30 },
    { id: 'x3', intensity: 'medium', durationSec: 90, label: 'Float' },
  ];
  const payload = exportWorkout('Friday pyramid', shared);
  const withoutIds = (segs: Segment[]) => segs.map(({ id: _id, ...rest }) => rest);

  const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)!;
  const editorSegments = () => readEditor(q<HTMLElement>('.setup-editor'));
  const nameField = () => q<HTMLInputElement>('.setup-name');
  const message = () => q<HTMLElement>('.setup-import-msg');
  const paste = (text: string) => {
    q<HTMLTextAreaElement>('.setup-import-text').value = text;
    q<HTMLButtonElement>('.setup-import-paste').click();
  };
  const chooseFile = (file: File) => {
    const input = q<HTMLInputElement>('.setup-import-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const jsonFile = (text: string) => new File([text], 'workout.json', { type: 'application/json' });
  /** Start hands over the builder's segments and program name; capture them. */
  const mountCapturingStart = () => {
    const started: { segments: Segment[]; programName: string }[] = [];
    mountSetup(container, {
      storage,
      onStart: (segments, programName) => started.push({ segments, programName }),
    });
    return () => {
      q<HTMLButtonElement>('.setup-start').click();
      return started[started.length - 1];
    };
  };

  it('offers a file input for .json files and a box for pasted text', () => {
    mountSetup(container, { storage, onStart: () => {} });
    const input = q<HTMLInputElement>('.setup-import-file');
    expect(input.type).toBe('file');
    expect(input.accept).toContain('.json');
    expect(q('.setup-import-text').tagName).toBe('TEXTAREA');
  });

  it('loads pasted text into the builder: same segments and labels, fresh ids, name filled in', () => {
    const start = mountCapturingStart();
    paste(payload);

    const segs = editorSegments();
    expect(withoutIds(segs)).toEqual(withoutIds(shared));
    expect(new Set(segs.map((s) => s.id)).size).toBe(3);
    for (const s of segs) expect(['x1', 'x2', 'x3']).not.toContain(s.id);
    expect(nameField().value).toBe('Friday pyramid');
    expect(start().programName).toBe('Friday pyramid');
    expect(message().hidden).toBe(false);
    expect(message().dataset.kind).toBe('ok');
  });

  it('round-trips: re-exporting what an import loaded gives back the same payload', () => {
    const start = mountCapturingStart();
    paste(payload);
    const { segments, programName } = start();
    expect(exportWorkout(programName, segments)).toBe(payload);
    expect(exportWorkout(nameField().value, editorSegments())).toBe(payload);
  });

  it('loads a chosen .json file into the builder', async () => {
    const start = mountCapturingStart();
    chooseFile(jsonFile(payload));
    await vi.waitFor(() => expect(nameField().value).toBe('Friday pyramid'));
    expect(withoutIds(editorSegments())).toEqual(withoutIds(shared));
    expect(start().programName).toBe('Friday pyramid');
  });

  it('writes nothing to storage, from a paste or a file', async () => {
    mountSetup(container, { storage, onStart: () => {} });
    const before = new Map(mem.m);
    paste(payload);
    chooseFile(jsonFile(exportWorkout('Other', shared)));
    await vi.waitFor(() => expect(nameField().value).toBe('Other'));
    expect(mem.m).toEqual(before);
    expect(storage.listTemplates()).toEqual([]);
  });

  it('clears the paste box after a successful import', () => {
    mountSetup(container, { storage, onStart: () => {} });
    paste(payload);
    expect(q<HTMLTextAreaElement>('.setup-import-text').value).toBe('');
  });

  it('falls back to a generic program name when the imported name is blank', () => {
    const start = mountCapturingStart();
    paste(exportWorkout('', shared));
    expect(nameField().value).toBe('');
    expect(start().programName).toBe('Imported workout');
  });

  const tooMany = exportWorkout(
    'Long',
    Array.from({ length: SHARE_LIMITS.maxSegments + 1 }, (_, i) => ({
      id: `s${i}`,
      intensity: 'easy' as const,
      durationSec: 5,
    })),
  );
  const bad: [string, string][] = [
    ['not JSON', '{ nope'],
    ['not a RowAlong workout', JSON.stringify({ format: 'something-else', version: 1 })],
    ['a newer version', payload.replace('"version": 1', '"version": 2')],
    ['an unknown intensity', payload.replace('"allout"', '"turbo"')],
    ['a duration off the 5-second grid', payload.replace('"durationSec": 30', '"durationSec": 32')],
    ['too many segments', tooMany],
    ['a name over 80 characters', exportWorkout('n'.repeat(81), shared)],
  ];

  it.each(bad)('rejects pasted %s with parseWorkout’s message and leaves the builder as it was', (_, text) => {
    const start = mountCapturingStart();
    nameField().value = 'My draft';
    const before = start();
    const rowsBefore = editorSegments();

    paste(text);

    const expected = parseWorkout(text);
    expect(expected.ok).toBe(false);
    expect(message().hidden).toBe(false);
    expect(message().dataset.kind).toBe('error');
    expect(message().textContent).toBe(!expected.ok && expected.error);
    expect(editorSegments()).toEqual(rowsBefore);
    expect(nameField().value).toBe('My draft');
    expect(start()).toEqual(before);
    // The rejected text stays in the box so it can be fixed.
    expect(q<HTMLTextAreaElement>('.setup-import-text').value).toBe(text);
  });

  it('rejects an invalid file with parseWorkout’s message and leaves the builder as it was', async () => {
    mountSetup(container, { storage, onStart: () => {} });
    const rowsBefore = editorSegments();
    const text = payload.replace('"version": 1', '"version": 0');
    chooseFile(jsonFile(text));
    await vi.waitFor(() => expect(message().hidden).toBe(false));
    const expected = parseWorkout(text);
    expect(message().textContent).toBe(!expected.ok && expected.error);
    expect(message().dataset.kind).toBe('error');
    expect(editorSegments()).toEqual(rowsBefore);
    expect(nameField().value).toBe('');
  });

  it('rejects a file of 100 KB or more without reading it', async () => {
    mountSetup(container, { storage, onStart: () => {} });
    const rowsBefore = editorSegments();
    const file = jsonFile(' '.repeat(SHARE_LIMITS.maxInputBytes));
    const read = vi.spyOn(file, 'text');
    chooseFile(file);
    await vi.waitFor(() => expect(message().hidden).toBe(false));
    expect(read).not.toHaveBeenCalled();
    expect(message().dataset.kind).toBe('error');
    expect(message().textContent).toContain('100 KB');
    expect(editorSegments()).toEqual(rowsBefore);
  });

  it('asks for text when Import is pressed on an empty box, and changes nothing', () => {
    mountSetup(container, { storage, onStart: () => {} });
    const rowsBefore = editorSegments();
    paste('   ');
    expect(message().dataset.kind).toBe('error');
    expect(message().textContent).toMatch(/paste/i);
    expect(editorSegments()).toEqual(rowsBefore);
  });

  it('clears a shown error once the pasted text is edited, and on a later good import', () => {
    mountSetup(container, { storage, onStart: () => {} });
    paste('{ nope');
    const box = q<HTMLTextAreaElement>('.setup-import-text');
    box.value = '{ nope }';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    expect(message().hidden).toBe(true);

    paste('{ nope');
    paste(payload);
    expect(message().dataset.kind).toBe('ok');
  });

  it('shows an imported name and labels containing HTML as plain text, never as markup', () => {
    const name = '<img src=x onerror=alert(1)>';
    const label = '<b>bold</b> & "q"';
    mountSetup(container, { storage, onStart: () => {} });
    paste(exportWorkout(name, [{ id: 'a', intensity: 'hard', durationSec: 60, label }]));

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.setup-editor b')).toBeNull();
    expect(nameField().value).toBe(name);
    expect(q('.seg-row .seg-label').textContent).toBe(label);
    expect(message().textContent).toContain(name);
    expect(message().children).toHaveLength(0);

    // Saved, it shows as plain text in the Templates list too.
    q<HTMLButtonElement>('.setup-save').click();
    const names = Array.from(container.querySelectorAll('.setup-tpl .t-name'), (el) => el.textContent);
    expect(names).toContain(name);
    expect(container.querySelector('.setup-tpl-list img')).toBeNull();
  });

  it('after an import, Save stores the workout under its imported name', () => {
    mountSetup(container, { storage, onStart: () => {} });
    paste(payload);
    q<HTMLButtonElement>('.setup-save').click();
    const saved = storage.listTemplates();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Friday pyramid');
    expect(withoutIds(saved[0].segments)).toEqual(withoutIds(shared));
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
  let blobs: Map<string, Blob>;
  let downloads: { href: string; download: string }[];
  let writeText: ReturnType<typeof vi.fn>;

  const setClipboard = (clipboard: unknown) =>
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

  beforeEach(() => {
    blobs = new Map();
    downloads = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      const url = `blob:test/${blobs.size + 1}`;
      blobs.set(url, b);
      return url;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push({ href: this.href, download: this.download });
    });
    writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  const exportBtn = () => container.querySelector<HTMLButtonElement>('.setup-export')!;
  const menu = () => container.querySelector<HTMLElement>('.setup-export-menu')!;
  const toast = () => container.querySelector<HTMLElement>('.setup-toast')!;
  const nameEl = () => container.querySelector<HTMLInputElement>('.setup-name')!;
  const tplRow = (name: string) =>
    Array.from(container.querySelectorAll<HTMLElement>('.setup-tpl')).find(
      (el) => el.querySelector('.t-name')!.textContent === name,
    )!;
  const choose = (action: 'download' | 'copy') =>
    container.querySelector<HTMLButtonElement>(`.setup-export-${action}`)!.click();
  const lastDownload = async () => {
    expect(downloads).toHaveLength(1);
    const { href, download } = downloads[0];
    return { fileName: download, text: await blobs.get(href)!.text() };
  };
  const shape = (segments: { intensity: string; durationSec: number; label?: string }[]) =>
    segments.map(({ intensity, durationSec, label }) => ({ intensity, durationSec, label }));

  it('puts an Export control next to Save', () => {
    mountSetup(container, { storage, onStart: () => {} });
    const save = container.querySelector('.setup-save')!;
    expect(save.nextElementSibling).toBe(exportBtn());
    expect(exportBtn().textContent).toContain('Export');
  });

  it('opens and closes a menu offering Download and Copy', () => {
    mountSetup(container, { storage, onStart: () => {} });
    expect(menu().hidden).toBe(true);
    exportBtn().click();
    expect(menu().hidden).toBe(false);
    expect(exportBtn().getAttribute('aria-expanded')).toBe('true');
    expect(menu().textContent).toContain('Download');
    expect(menu().textContent).toContain('Copy');
    exportBtn().click();
    expect(menu().hidden).toBe(true);
    expect(exportBtn().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the menu on Escape and on a click elsewhere', () => {
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu().hidden).toBe(true);
    exportBtn().click();
    container.querySelector('h1')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu().hidden).toBe(true);
  });

  it('moves through the menu with the arrow keys and leaves it on Tab', () => {
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    const download = container.querySelector('.setup-export-download')!;
    const copy = container.querySelector('.setup-export-copy')!;
    expect(menu().getAttribute('role')).toBe('menu');
    expect(download.getAttribute('role')).toBe('menuitem');
    expect(document.activeElement).toBe(download);
    const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k }));
    key('ArrowDown');
    expect(document.activeElement).toBe(copy);
    key('ArrowDown');
    expect(document.activeElement).toBe(download);
    key('ArrowUp');
    expect(document.activeElement).toBe(copy);
    key('Tab');
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(exportBtn());
  });

  it('keeps the menu open while the page scrolls', () => {
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    document.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(menu().hidden).toBe(false);
  });

  it('closes the menu when the Templates list is redrawn under it', () => {
    mountSetup(container, { storage, onStart: () => {} });
    tplRow('Quick 20').querySelector<HTMLButtonElement>('.setup-tpl-export')!.click();
    expect(menu().hidden).toBe(false);
    container.querySelector<HTMLButtonElement>('.setup-save')!.click();
    expect(menu().hidden).toBe(true);
  });

  it('downloads the builder workout as <name>.json, named from the name field', async () => {
    let started: Segment[] = [];
    mountSetup(container, { storage, onStart: (s) => (started = s) });
    nameEl().value = '  Tuesday pyramid ';
    exportBtn().click();
    choose('download');

    const { fileName, text } = await lastDownload();
    expect(fileName).toBe('Tuesday pyramid.json');
    const payload = JSON.parse(text);
    expect(payload).toMatchObject({ format: 'rowalong-workout', version: 1, name: 'Tuesday pyramid' });
    container.querySelector<HTMLButtonElement>('.setup-start')!.click();
    expect(started.length).toBeGreaterThan(0);
    expect(shape(payload.segments)).toEqual(shape(started));
    expect(menu().hidden).toBe(true);
    expect(toast().hidden).toBe(false);
    expect(toast().textContent).toContain('Tuesday pyramid.json');
  });

  it('falls back to the program name when the name field is empty', async () => {
    mountSetup(container, { storage, onStart: () => {} });
    tplRow('Short sprints').querySelector<HTMLButtonElement>('.setup-load')!.click();
    exportBtn().click();
    choose('download');
    const { fileName, text } = await lastDownload();
    expect(fileName).toBe('Short sprints.json');
    expect(JSON.parse(text).name).toBe('Short sprints');
  });

  it('names a freshly generated workout after its program', async () => {
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    choose('download');
    const { fileName } = await lastDownload();
    expect(fileName).toMatch(/^\d+ min · \w+\.json$/);
  });

  it('copies the same text it downloads, and confirms', async () => {
    mountSetup(container, { storage, onStart: () => {} });
    nameEl().value = 'Copy me';
    exportBtn().click();
    choose('download');
    const { text } = await lastDownload();

    exportBtn().click();
    choose('copy');
    await vi.waitFor(() => expect(toast().textContent).toContain('Copied'));
    expect(writeText).toHaveBeenCalledWith(text);
    expect(toast().textContent).toContain('Copy me');
    expect(toast().dataset.kind).toBe('ok');
  });

  it('shows a message when copying fails', async () => {
    writeText.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    choose('copy');
    await vi.waitFor(() => expect(toast().dataset.kind).toBe('error'));
    expect(toast().hidden).toBe(false);
    expect(toast().textContent).toMatch(/couldn’t copy/i);
  });

  it('shows a message when there is no clipboard to copy to', async () => {
    setClipboard(undefined);
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    choose('copy');
    await vi.waitFor(() => expect(toast().dataset.kind).toBe('error'));
    expect(toast().textContent).toMatch(/couldn’t copy/i);
  });

  it('hides the confirmation after a moment', async () => {
    vi.useFakeTimers();
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    choose('download');
    expect(toast().hidden).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(toast().hidden).toBe(true);
  });

  it('keeps the confirmation from covering the menu or taking its clicks', () => {
    // The toast stays up for a few seconds after Download. In the Electron window the
    // menu reopened in that time landed under it, so Copy as text never got the click.
    mountSetup(container, { storage, onStart: () => {} });
    exportBtn().click();
    choose('download');
    exportBtn().click();
    expect(toast().hidden).toBe(false);
    expect(menu().hidden).toBe(false);
    const toastStyle = getComputedStyle(toast());
    expect(toastStyle.pointerEvents).toBe('none');
    expect(Number(getComputedStyle(menu()).zIndex)).toBeGreaterThan(Number(toastStyle.zIndex));
  });

  it('puts an export icon on every Templates row, starters included', () => {
    storage.saveTemplate({
      id: 'mine',
      name: 'Mine',
      segments: [{ id: 's', intensity: 'hard', durationSec: 60 }],
    });
    mountSetup(container, { storage, onStart: () => {} });
    const rows = container.querySelectorAll('.setup-tpl');
    expect(rows.length).toBeGreaterThan(2);
    rows.forEach((row) => {
      const btn = row.querySelector<HTMLButtonElement>('.setup-tpl-export');
      expect(btn).not.toBeNull();
      expect(btn!.getAttribute('aria-label')).toMatch(/export/i);
    });
  });

  it('exports a starter template from its row', async () => {
    const [quick20] = starterTemplates();
    mountSetup(container, { storage, onStart: () => {} });
    nameEl().value = 'Ignored for templates';
    tplRow('Quick 20').querySelector<HTMLButtonElement>('.setup-tpl-export')!.click();
    expect(menu().hidden).toBe(false);
    choose('download');
    const { fileName, text } = await lastDownload();
    expect(fileName).toBe('Quick 20.json');
    const parsed = parseWorkout(text);
    expect(parsed.ok && parsed.workout.name).toBe('Quick 20');
    expect(parsed.ok && shape(parsed.workout.segments)).toEqual(shape(quick20.segments));

    tplRow('Quick 20').querySelector<HTMLButtonElement>('.setup-tpl-export')!.click();
    choose('copy');
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(text));
  });

  it('keeps segment labels when exporting a saved template', async () => {
    storage.saveTemplate({
      id: 'lab',
      name: 'Labelled',
      segments: [
        { id: 'a', intensity: 'easy', durationSec: 120, label: 'Warm up' },
        { id: 'b', intensity: 'allout', durationSec: 30 },
      ],
    });
    mountSetup(container, { storage, onStart: () => {} });
    tplRow('Labelled').querySelector<HTMLButtonElement>('.setup-tpl-export')!.click();
    choose('download');
    const { text } = await lastDownload();
    expect(JSON.parse(text).segments).toEqual([
      { intensity: 'easy', durationSec: 120, label: 'Warm up' },
      { intensity: 'allout', durationSec: 30 },
    ]);
  });

  it('shows a template name containing HTML as plain text in the confirmation', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    storage.saveTemplate({
      id: 'h',
      name: hostile,
      segments: [{ id: 's', intensity: 'hard', durationSec: 60 }],
    });
    mountSetup(container, { storage, onStart: () => {} });
    tplRow(hostile).querySelector<HTMLButtonElement>('.setup-tpl-export')!.click();
    choose('copy');
    await vi.waitFor(() => expect(toast().textContent).toContain(hostile));
    expect(toast().querySelector('img')).toBeNull();
  });

  it('refuses to export a workout that would not import, and says why', async () => {
    mountSetup(container, { storage, onStart: () => {} });
    const dur = container.querySelector<HTMLInputElement>('.seg-dur')!;
    dur.value = '7';
    exportBtn().click();
    choose('download');
    expect(downloads).toHaveLength(0);
    expect(toast().dataset.kind).toBe('error');
    expect(toast().textContent).toMatch(/can’t export/i);
    expect(toast().textContent).toContain('multiple of 5');

    exportBtn().click();
    choose('copy');
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('refuses to export an empty builder', () => {
    mountSetup(container, { storage, onStart: () => {} });
    container.querySelectorAll<HTMLButtonElement>('.seg-del').forEach((b) => b.click());
    exportBtn().click();
    choose('download');
    expect(downloads).toHaveLength(0);
    expect(toast().dataset.kind).toBe('error');
  });

  it('downloads exactly the payload an import loaded, labels included', async () => {
    const payload = exportWorkout('Friday pyramid', [
      { id: 'x', intensity: 'easy', durationSec: 120, label: 'Warm <i>up</i>' },
      { id: 'y', intensity: 'allout', durationSec: 30 },
    ]);
    mountSetup(container, { storage, onStart: () => {} });
    container.querySelector<HTMLTextAreaElement>('.setup-import-text')!.value = payload;
    container.querySelector<HTMLButtonElement>('.setup-import-paste')!.click();
    exportBtn().click();
    choose('download');
    const { fileName, text } = await lastDownload();
    expect(fileName).toBe('Friday pyramid.json');
    expect(text).toBe(payload);
  });

  it('writes nothing to storage', async () => {
    const mem = new Mem();
    storage = new Storage(mem);
    mountSetup(container, { storage, onStart: () => {} });
    const before = new Map(mem.m);
    exportBtn().click();
    choose('download');
    tplRow('Quick 20').querySelector<HTMLButtonElement>('.setup-tpl-export')!.click();
    choose('copy');
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(mem.m).toEqual(before);
  });
});
