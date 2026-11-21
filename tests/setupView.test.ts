import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountSetup, summarize } from '../src/ui/setupView';
import { readEditor } from '../src/ui/segmentEditor';
import { Storage, type KeyValueStore } from '../src/core/storage';
import { exportWorkout, parseWorkout, SHARE_LIMITS } from '../src/core/shareFormat';
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
