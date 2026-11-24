import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountSetup, type MountedSetup } from '../src/ui/setupView';
import { Storage, type KeyValueStore } from '../src/core/storage';
import { createShareClient, type FetchLike } from '../src/core/shareClient';
import { SHARE_BASE_URL, serializeSharedWorkout, type SharedWorkout } from '../src/core/share';
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

const ID = 'AbC123_-xY';
const LINK = `${SHARE_BASE_URL}/w/${ID}`;

const shared: SharedWorkout = {
  version: 1,
  name: 'Friday <b>burner</b> & "co"',
  segments: [
    { intensity: 'easy', durationSec: 300 },
    { intensity: 'hard', durationSec: 120, label: 'Push' },
    { intensity: 'allout', durationSec: 30 },
    { intensity: 'easy', durationSec: 180 },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** The share API, stubbed: GET /api/w/<ID> returns `shared`, other ids 404, POST returns ID. */
function shareApi() {
  return vi.fn<FetchLike>(async (url, init) => {
    if (init?.method === 'POST') return json({ id: ID, url: LINK }, 201);
    if (url === `${SHARE_BASE_URL}/api/w/${ID}`) return new Response(serializeSharedWorkout(shared));
    return json({ error: 'Not found' }, 404);
  });
}

let container: HTMLElement;
let storage: Storage;
let fetch: ReturnType<typeof shareApi>;
let copyText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
let onStart: ReturnType<typeof vi.fn<(segments: Segment[], name: string) => void>>;

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  container = document.getElementById('app')!;
  storage = new Storage(new Mem());
  fetch = shareApi();
  copyText = vi.fn(async () => {});
  onStart = vi.fn();
});

const mount = (): MountedSetup =>
  mountSetup(container, {
    storage,
    onStart,
    shareClient: createShareClient({ fetch }),
    copyText,
  });

const $ = <T extends HTMLElement>(sel: string) => container.querySelector(sel) as T;

/** What the builder holds, without ids: intensity + duration per row. */
const builder = () =>
  Array.from(container.querySelectorAll<HTMLElement>('.seg-row')).map((row) => ({
    intensity: row.querySelector<HTMLSelectElement>('.seg-intensity')!.value,
    durationSec: Number(row.querySelector<HTMLInputElement>('.seg-dur')!.value),
  }));

const templateNames = () =>
  Array.from(container.querySelectorAll('.setup-tpl .t-name')).map((n) => n.textContent);

/** Let the stubbed fetch and the handlers' awaits settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

async function importViaBox(text: string) {
  $<HTMLInputElement>('.setup-import-link').value = text;
  $<HTMLButtonElement>('.setup-import').click();
  await settle();
}

describe('Import box (spec check 2)', () => {
  it('imports a pasted share link: saves a template under the sharer\'s name and loads it', async () => {
    mount();
    await importViaBox(LINK);

    expect(fetch).toHaveBeenCalledWith(`${SHARE_BASE_URL}/api/w/${ID}`, expect.anything());
    const saved = storage.listTemplates();
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe(shared.name);
    expect(saved[0].segments.map(({ intensity, durationSec }) => ({ intensity, durationSec }))).toEqual(
      shared.segments.map(({ intensity, durationSec }) => ({ intensity, durationSec })),
    );
    expect(templateNames()).toContain(shared.name);
    expect(builder()).toEqual(
      shared.segments.map(({ intensity, durationSec }) => ({ intensity, durationSec })),
    );
    expect($('.setup-import-msg').dataset.state).toBe('ok');
    expect($<HTMLInputElement>('.setup-import-link').value).toBe('');
  });

  it("carries the sharer's name as the program name into Start", async () => {
    mount();
    await importViaBox(LINK);
    $<HTMLButtonElement>('.setup-start').click();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][1]).toBe(shared.name);
    expect(onStart.mock.calls[0][0]).toHaveLength(shared.segments.length);
  });

  it('imports on Enter in the link box', async () => {
    mount();
    const input = $<HTMLInputElement>('.setup-import-link');
    input.value = LINK;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(storage.listTemplates()).toHaveLength(1);
  });

  it('renders a shared name as text, not HTML', async () => {
    mount();
    await importViaBox(LINK);
    expect(container.querySelector('.setup-tpl b')).toBeNull();
    expect(templateNames()).toContain(shared.name);
  });

  it('re-importing the same link replaces its template rather than duplicating it', async () => {
    mount();
    await importViaBox(LINK);
    await importViaBox(LINK);
    expect(storage.listTemplates()).toHaveLength(1);
    expect(templateNames().filter((n) => n === shared.name)).toHaveLength(1);
  });

  it('a loaded import gets fresh segment ids (never reused across loads)', async () => {
    mount();
    await importViaBox(LINK);
    const tplIds = storage.listTemplates()[0].segments.map((s) => s.id);
    const rowIds = Array.from(container.querySelectorAll<HTMLElement>('.seg-row')).map(
      (r) => r.dataset.id,
    );
    expect(rowIds.some((id) => tplIds.includes(id!))).toBe(false);
  });

  describe('a bad or unknown link shows an error and changes nothing', () => {
    const cases: [string, string][] = [
      ['an empty box', ''],
      ['text that is not a link', 'my favourite workout'],
      ['a link on another site', `https://example.com/w/${ID}`],
      ['an unknown id (404)', `${SHARE_BASE_URL}/w/ZZZZZZZZZZ`],
    ];
    for (const [what, text] of cases) {
      it(what, async () => {
        mount();
        const before = builder();
        const tplBefore = templateNames();
        await importViaBox(text);

        expect(storage.listTemplates()).toEqual([]);
        expect(templateNames()).toEqual(tplBefore);
        expect(builder()).toEqual(before);
        const msg = $('.setup-import-msg');
        expect(msg.dataset.state).toBe('error');
        expect(msg.hidden).toBe(false);
        expect(msg.textContent!.length).toBeGreaterThan(0);
        // The pasted text stays so it can be fixed.
        expect($<HTMLInputElement>('.setup-import-link').value).toBe(text);
      });
    }

    it('a bad link never hits the network', async () => {
      mount();
      await importViaBox('not a link');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('an unknown id says so', async () => {
      mount();
      await importViaBox(`${SHARE_BASE_URL}/w/ZZZZZZZZZZ`);
      expect($('.setup-import-msg').textContent).toMatch(/no shared workout/i);
    });

    it('an invalid payload from the server', async () => {
      fetch.mockImplementation(async () =>
        json({ version: 1, name: 'x', segments: [{ intensity: 'warp', durationSec: 5 }] }),
      );
      mount();
      const before = builder();
      await importViaBox(LINK);
      expect(storage.listTemplates()).toEqual([]);
      expect(builder()).toEqual(before);
      expect($('.setup-import-msg').dataset.state).toBe('error');
    });

    it('a network failure', async () => {
      fetch.mockImplementation(async () => {
        throw new TypeError('Failed to fetch');
      });
      mount();
      const before = builder();
      await importViaBox(LINK);
      expect(storage.listTemplates()).toEqual([]);
      expect(builder()).toEqual(before);
      expect($('.setup-import-msg').textContent).toMatch(/couldn't reach/i);
    });
  });
});

describe('importShareLink (the deep-link entry point)', () => {
  it('imports a bare id the same way as the box', async () => {
    const setup = mount();
    const r = await setup.importShareLink(ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.template.name).toBe(shared.name);
    expect(storage.listTemplates().map((t) => t.name)).toEqual([shared.name]);
    expect(builder()).toHaveLength(shared.segments.length);
    expect($('.setup-import-msg').dataset.state).toBe('ok');
  });

  it('accepts a rowalong:// deep link', async () => {
    const setup = mount();
    const r = await setup.importShareLink(`rowalong://w/${ID}`);
    expect(r.ok).toBe(true);
  });

  it('returns the error and changes nothing for an unknown id', async () => {
    const setup = mount();
    const before = builder();
    const r = await setup.importShareLink('ZZZZZZZZZZ');
    expect(r.ok).toBe(false);
    expect(storage.listTemplates()).toEqual([]);
    expect(builder()).toEqual(before);
    expect($('.setup-import-msg').dataset.state).toBe('error');
  });

  it("doesn't touch what's typed in the Import box", async () => {
    const setup = mount();
    $<HTMLInputElement>('.setup-import-link').value = 'half-typed';
    await setup.importShareLink(ID);
    expect($<HTMLInputElement>('.setup-import-link').value).toBe('half-typed');
  });
});

describe('Share button', () => {
  const posted = (): SharedWorkout => {
    const post = fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    if (!post) throw new Error('nothing was POSTed');
    return JSON.parse(post[1]!.body as string) as SharedWorkout;
  };

  it("posts the builder's workout under the name typed in the name field", async () => {
    mount();
    const segments = builder();
    $<HTMLInputElement>('.setup-name').value = '  Tuesday intervals ';
    $<HTMLButtonElement>('.setup-share').click();
    await settle();

    expect(fetch).toHaveBeenCalledWith(`${SHARE_BASE_URL}/api/w`, expect.objectContaining({ method: 'POST' }));
    expect(posted()).toEqual({ version: 1, name: 'Tuesday intervals', segments });
  });

  it('falls back to the current program name when the name field is empty', async () => {
    mount();
    $<HTMLButtonElement>('.setup-load').click(); // Quick 20
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    expect(posted().name).toBe('Quick 20');
  });

  it('copies the returned link to the clipboard and shows it', async () => {
    mount();
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    expect(copyText).toHaveBeenCalledWith(LINK);
    const link = $<HTMLInputElement>('.setup-share-link');
    expect(link.hidden).toBe(false);
    expect(link.value).toBe(LINK);
    expect($('.setup-share-msg').dataset.state).toBe('ok');
    expect($('.setup-share-msg').textContent).toMatch(/copied/i);
  });

  it('still shows the link when the clipboard refuses', async () => {
    copyText.mockRejectedValue(new Error('denied'));
    mount();
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    expect($<HTMLInputElement>('.setup-share-link').value).toBe(LINK);
    expect($('.setup-share-msg').dataset.state).toBe('ok');
    expect($('.setup-share-msg').textContent).not.toMatch(/copied/i);
  });

  it("doesn't save a template or clear the name field", async () => {
    mount();
    $<HTMLInputElement>('.setup-name').value = 'Mine';
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    expect(storage.listTemplates()).toEqual([]);
    expect($<HTMLInputElement>('.setup-name').value).toBe('Mine');
  });

  it('shows a clear error when the share service fails', async () => {
    fetch.mockImplementation(async () => new Response('', { status: 500 }));
    mount();
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    const msg = $('.setup-share-msg');
    expect(msg.dataset.state).toBe('error');
    expect(msg.textContent).toMatch(/couldn't share/i);
    expect($<HTMLInputElement>('.setup-share-link').hidden).toBe(true);
    expect(copyText).not.toHaveBeenCalled();
  });

  it('shows the validation error locally for a workout the API would reject', async () => {
    mount();
    const dur = $<HTMLInputElement>('.seg-dur');
    dur.value = '7';
    dur.dispatchEvent(new Event('input', { bubbles: true }));
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect($('.setup-share-msg').dataset.state).toBe('error');
    expect($('.setup-share-msg').textContent).toMatch(/multiple of 5 seconds/);
  });

  it('does nothing for an empty builder', async () => {
    mount();
    container.querySelectorAll<HTMLButtonElement>('.seg-del').forEach((b) => b.click());
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect($('.setup-share-msg').dataset.state).toBe('error');
  });

  it('ignores a second click while a share is in flight', async () => {
    mount();
    $<HTMLButtonElement>('.setup-share').click();
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('clears the shown link once the workout is edited', async () => {
    mount();
    $<HTMLButtonElement>('.setup-share').click();
    await settle();
    $<HTMLButtonElement>('.seg-del').click();
    expect($<HTMLInputElement>('.setup-share-link').hidden).toBe(true);
    expect($('.setup-share-msg').hidden).toBe(true);
  });
});
