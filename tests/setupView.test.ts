import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountSetup, summarize } from '../src/ui/setupView';
import { Storage, type KeyValueStore } from '../src/core/storage';
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

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Let the fake fetch's promise chain and the view's handlers settle. */
const flush = () => new Promise((r) => setTimeout(r, 0));

const BASE = 'https://share.test';
const SHARED = {
  v: 1,
  name: 'Friday pyramid',
  segments: [
    { intensity: 'easy', durationSec: 300 },
    { intensity: 'hard', durationSec: 120, label: 'Push' },
    { intensity: 'easy', durationSec: 180 },
  ],
};

const q = <T extends Element = HTMLElement>(sel: string) => container.querySelector(sel) as T;

describe('setup view share', () => {
  it('posts the editor workout and shows the link with a Copy button', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(201, { id: 'abcDEF12', url: `${BASE}/w/abcDEF12` }),
    );
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    q<HTMLInputElement>('.setup-name').value = 'My share';
    q<HTMLButtonElement>('.setup-share').click();
    await flush();

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/api/workouts`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe('My share');
    const editorRows = container.querySelectorAll('.seg-row').length;
    expect(body.segments).toHaveLength(editorRows);
    expect(body.segments[0].id).toBeUndefined();

    expect(q<HTMLInputElement>('.setup-share-link').value).toBe(`${BASE}/w/abcDEF12`);
    expect(q('.setup-share-result').hidden).toBe(false);
    expect(q('.setup-share-copy')).not.toBeNull();
  });

  it('falls back to the program name when the name box is empty', async () => {
    const fetch = vi.fn(async () => jsonResponse(201, { id: 'abcDEF12' }));
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    q<HTMLButtonElement>('.setup-load').click(); // Quick 20
    q<HTMLButtonElement>('.setup-share').click();
    await flush();
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).name).toBe('Quick 20');
    // No url in the response → built from the base URL.
    expect(q<HTMLInputElement>('.setup-share-link').value).toBe(`${BASE}/w/abcDEF12`);
  });

  it('Copy writes the link to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fetch = vi.fn(async () => jsonResponse(201, { id: 'abcDEF12' }));
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    q<HTMLButtonElement>('.setup-share').click();
    await flush();
    q<HTMLButtonElement>('.setup-share-copy').click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(`${BASE}/w/abcDEF12`);
    expect(q('.setup-share-copy').textContent).toContain('Copied');
  });

  it.each([
    [429, /too many/i],
    [413, /too big/i],
    [500, /went wrong/i],
  ])('shows a clear error for HTTP %i', async (status, msg) => {
    const fetch = vi.fn(async () => jsonResponse(status, { error: 'x' }));
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    q<HTMLButtonElement>('.setup-share').click();
    await flush();
    expect(q('.setup-share-msg').textContent).toMatch(msg);
    expect(q('.setup-share-msg').dataset.tone).toBe('error');
    expect(q('.setup-share-result').hidden).toBe(true);
  });

  it('shows an offline error when fetch throws', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    q<HTMLButtonElement>('.setup-share').click();
    await flush();
    expect(q('.setup-share-msg').textContent).toMatch(/connection/i);
  });

  it('does not post an empty workout', async () => {
    const fetch = vi.fn();
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    container.querySelectorAll<HTMLButtonElement>('.seg-del').forEach((b) => b.click());
    q<HTMLButtonElement>('.setup-share').click();
    await flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(q('.setup-share-msg').textContent).toMatch(/add a block/i);
  });
});

describe('setup view import', () => {
  const doImport = async (text: string) => {
    q<HTMLInputElement>('.setup-import-input').value = text;
    q<HTMLButtonElement>('.setup-import').click();
    await flush();
  };

  it('fetches a pasted link, saves it as a template and loads it into the editor', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, SHARED));
    let name = '';
    mountSetup(container, {
      storage,
      onStart: (_s: Segment[], programName: string) => (name = programName),
      share: { baseUrl: BASE, fetch },
    });
    await doImport('https://rowalong.endlessrainstudio.com/w/abcDEF12');

    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(`${BASE}/api/workouts/abcDEF12`);
    const saved = storage.listTemplates();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Friday pyramid');
    expect(saved[0].segments.map(({ intensity, durationSec, label }) => ({ intensity, durationSec, label }))).toEqual([
      { intensity: 'easy', durationSec: 300, label: undefined },
      { intensity: 'hard', durationSec: 120, label: 'Push' },
      { intensity: 'easy', durationSec: 180, label: undefined },
    ]);
    expect(container.querySelectorAll('.seg-row')).toHaveLength(3);
    expect(container.querySelector('.setup-tpl-list')!.textContent).toContain('Friday pyramid');
    expect(q<HTMLInputElement>('.setup-import-input').value).toBe('');
    expect(q('.setup-import-msg').textContent).toContain('Friday pyramid');

    q<HTMLButtonElement>('.setup-start').click();
    expect(name).toBe('Friday pyramid');
  });

  it('accepts a bare id', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, SHARED));
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    await doImport('  abcDEF12 ');
    expect((fetch.mock.calls[0] as unknown[])[0]).toBe(`${BASE}/api/workouts/abcDEF12`);
    expect(storage.listTemplates()).toHaveLength(1);
  });

  it('rejects a bad link without fetching', async () => {
    const fetch = vi.fn();
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    await doImport('https://example.com/not-a-share');
    expect(fetch).not.toHaveBeenCalled();
    expect(q('.setup-import-msg').textContent).toMatch(/doesn.t look like a RowAlong share link/i);
    expect(q('.setup-import-msg').dataset.tone).toBe('error');
    expect(storage.listTemplates()).toHaveLength(0);
  });

  it.each([
    [404, /no shared workout/i],
    [429, /too many/i],
    [500, /went wrong/i],
  ])('shows a clear error for HTTP %i', async (status, msg) => {
    const fetch = vi.fn(async () => jsonResponse(status, { error: 'x' }));
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    await doImport('abcDEF12');
    expect(q('.setup-import-msg').textContent).toMatch(msg);
    expect(storage.listTemplates()).toHaveLength(0);
  });

  it('shows an offline error when fetch throws', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    await doImport('abcDEF12');
    expect(q('.setup-import-msg').textContent).toMatch(/connection/i);
  });

  it('escapes an imported name in the templates list', async () => {
    const evil = { ...SHARED, name: '<img src=x onerror=alert(1)>' };
    const fetch = vi.fn(async () => jsonResponse(200, evil));
    mountSetup(container, { storage, onStart: () => {}, share: { baseUrl: BASE, fetch } });
    await doImport('abcDEF12');
    expect(container.querySelector('.setup-tpl-list img')).toBeNull();
    expect(container.querySelector('.setup-tpl-list')!.textContent).toContain('<img src=x');
  });
});
