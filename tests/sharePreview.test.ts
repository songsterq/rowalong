// The preview page at /w/<id>, rendered by the Worker. Runs in the default jsdom
// environment only to parse the HTML with DOMParser; the requests are plain GETs.
import { describe, it, expect, beforeEach } from 'vitest';
import { handleRequest, type ShareStore, type WorkerEnv } from '../worker/handler';
import { DOWNLOAD_URL, renderNotFoundPage, renderPreviewPage } from '../worker/previewPage';
import { type SharedWorkout, deepLinkFor, serializeSharedWorkout, shareIdFor } from '../src/core/share';
import { INTENSITY_META } from '../src/core/types';
import { readFileSync } from 'node:fs';

// Read from disk, relative to the project root Vitest runs in: Vitest blanks CSS
// imports (even with ?raw), and under jsdom import.meta.url isn't a file URL.
const siteFile = (name: string) => readFileSync(`site/${name}`, 'utf8');
const landingHtml = siteFile('index.html');
const siteCss = siteFile('styles.css');

class FakeKV implements ShareStore {
  readonly data = new Map<string, string>();
  readonly puts: string[] = [];
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.puts.push(key);
    this.data.set(key, value);
  }
}

class FakeAssets {
  readonly requests: Request[] = [];
  async fetch(request: Request): Promise<Response> {
    this.requests.push(request);
    return new Response(`asset ${new URL(request.url).pathname}`, { status: 200 });
  }
}

const ORIGIN = 'https://rowalong.example';

const workout: SharedWorkout = {
  version: 1,
  name: 'Quick 20',
  segments: [
    { intensity: 'easy', durationSec: 300 },
    { intensity: 'hard', durationSec: 420, label: 'Push' },
    { intensity: 'allout', durationSec: 30 },
    { intensity: 'medium', durationSec: 450 },
  ],
};
const TOTAL = '20:00'; // 300 + 420 + 30 + 450 s

const HOSTILE_NAME = `</title><script>alert("x")</script> & 'co' <b>bold</b>`;

let kv: FakeKV;
let assets: FakeAssets;
let env: WorkerEnv;

beforeEach(() => {
  kv = new FakeKV();
  assets = new FakeAssets();
  env = { SHARES: kv, ASSETS: assets };
});

/** Put a workout in the fake KV the way POST /api/w would, and return its id. */
async function store(w: SharedWorkout): Promise<string> {
  const id = await shareIdFor(w);
  kv.data.set(id, serializeSharedWorkout(w));
  return id;
}

const call = (path: string, init?: RequestInit) =>
  handleRequest(new Request(`${ORIGIN}${path}`, init), env);

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

const text = (root: ParentNode, selector: string) =>
  root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();

describe('GET /w/<id>', () => {
  it('renders the preview page for a shared workout', async () => {
    const id = await store(workout);
    const res = await call(`/w/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    const doc = parse(await res.text());
    expect(text(doc, 'h1')).toBe('Quick 20');
    expect(doc.title).toContain('Quick 20');
  });

  it('shows the total time and the number of blocks', async () => {
    const doc = parse(await (await call(`/w/${await store(workout)}`)).text());
    expect(text(doc, '.pv-total')).toBe(TOTAL);
    expect(text(doc, '.pv-stats')).toContain('4 blocks');
  });

  it('lists every block in order with its intensity, stroke rate and duration', async () => {
    const doc = parse(await (await call(`/w/${await store(workout)}`)).text());
    const rows = [...doc.querySelectorAll('.pv-blocks > li')];
    expect(rows).toHaveLength(4);
    const cells = rows.map((li) => ({
      name: text(li, '.pv-block-name'),
      spm: text(li, '.pv-block-spm'),
      dur: text(li, '.pv-block-dur'),
    }));
    expect(cells).toEqual([
      { name: 'Easy', spm: '24 spm', dur: '5:00' },
      { name: 'Hard · Push', spm: '28 spm', dur: '7:00' },
      { name: 'All-out', spm: '30–32 spm', dur: '0:30' },
      { name: 'Medium', spm: '26 spm', dur: '7:30' },
    ]);
    // Each block carries its intensity's color from INTENSITY_META.
    expect(rows.map((li) => (li as HTMLElement).style.getPropertyValue('--c'))).toEqual(
      workout.segments.map((s) => INTENSITY_META[s.intensity].color),
    );
  });

  it('draws the intensity timeline in the INTENSITY_META colors', async () => {
    const doc = parse(await (await call(`/w/${await store(workout)}`)).text());
    const timeline = doc.querySelector('.pv-timeline') as HTMLElement;
    expect(timeline).not.toBeNull();
    const bg = timeline.getAttribute('style') ?? '';
    expect(bg).toContain('linear-gradient(90deg');
    for (const s of workout.segments) expect(bg).toContain(INTENSITY_META[s.intensity].color);
  });

  it('has an Open in RowAlong button with the deep link', async () => {
    const id = await store(workout);
    const doc = parse(await (await call(`/w/${id}`)).text());
    const open = [...doc.querySelectorAll('a')].find((a) => /Open in RowAlong/.test(a.textContent ?? ''));
    expect(open?.getAttribute('href')).toBe(deepLinkFor(id));
    expect(open?.getAttribute('href')).toBe(`rowalong://w/${id}`);
  });

  it('has a Download RowAlong link to the DMG', async () => {
    const doc = parse(await (await call(`/w/${await store(workout)}`)).text());
    const dl = [...doc.querySelectorAll('a')].find((a) => /Download RowAlong/.test(a.textContent ?? ''));
    expect(dl?.getAttribute('href')).toBe(DOWNLOAD_URL);
    expect(DOWNLOAD_URL).toMatch(/^https:\/\/.+\.dmg$/);
  });

  it('uses the site stylesheet, with absolute paths so a trailing slash is harmless', async () => {
    const doc = parse(await (await call(`/w/${await store(workout)}`)).text());
    const sheets = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute('href'));
    expect(sheets).toContain('/styles.css');
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/icon.png');
  });

  it('accepts a trailing slash', async () => {
    const id = await store(workout);
    const res = await call(`/w/${id}/`);
    expect(res.status).toBe(200);
    expect(text(parse(await res.text()), 'h1')).toBe('Quick 20');
  });

  it('reads KV but never writes it, and never falls through to the static site', async () => {
    await call(`/w/${await store(workout)}`);
    await call('/w/AAAAAAAAAA');
    expect(kv.puts).toEqual([]);
    expect(assets.requests).toEqual([]);
  });

  it('sets the security headers itself (site/_headers does not cover the script)', async () => {
    const res = await call(`/w/${await store(workout)}`);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('lets browsers cache a found page briefly', async () => {
    const res = await call(`/w/${await store(workout)}`);
    expect(res.headers.get('Cache-Control')).toMatch(/^public, max-age=\d+$/);
  });

  it('answers HEAD with the headers and no body', async () => {
    const res = await call(`/w/${await store(workout)}`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toBe('');
  });

  it.each(['POST', 'PUT', 'DELETE'])('refuses %s with a 405', async (method) => {
    const res = await call(`/w/${await store(workout)}`, { method });
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, HEAD');
    expect(kv.puts).toEqual([]);
  });
});

describe('escaping', () => {
  it('escapes the workout name everywhere it appears', async () => {
    const id = await store({ ...workout, name: HOSTILE_NAME });
    const html = await (await call(`/w/${id}`)).text();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>bold');
    const doc = parse(html);
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelector('h1')?.children).toHaveLength(0);
    expect(text(doc, 'h1')).toBe(HOSTILE_NAME);
    expect(doc.title).toContain(HOSTILE_NAME);
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(HOSTILE_NAME);
  });

  it('escapes segment labels', async () => {
    const hostile: SharedWorkout = {
      ...workout,
      segments: [{ intensity: 'hard', durationSec: 60, label: '<img src=x onerror=alert(1)>' }],
    };
    const doc = parse(await (await call(`/w/${await store(hostile)}`)).text());
    expect(doc.querySelectorAll('img')).toHaveLength(0);
    expect(text(doc, '.pv-block-name')).toBe('Hard · <img src=x onerror=alert(1)>');
  });

  it('renders straight from the functions as well (no request needed)', () => {
    const html = renderPreviewPage('AAAAAAAAAA', { ...workout, name: HOSTILE_NAME });
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp;');
  });
});

describe('unknown ids', () => {
  it.each(['AAAAAAAAAA', 'short', 'AAAAAAAAAAA', 'AAAA%2FAAAAA', 'AAAAAAAAAA/extra', ''])(
    'serves the friendly not-found page with a 404 for %j',
    async (id) => {
      const res = await call(`/w/${id}`);
      expect(res.status).toBe(404);
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      const doc = parse(await res.text());
      expect(text(doc, 'h1')).toMatch(/workout/i);
      expect(doc.querySelector('a[href="/"]')).not.toBeNull();
      expect(doc.querySelector(`a[href="${DOWNLOAD_URL}"]`)).not.toBeNull();
      expect(doc.querySelector('a[href^="rowalong:"]')).toBeNull();
    },
  );

  it('is not cached, since a link can start working a moment after it is shared', async () => {
    const res = await call('/w/AAAAAAAAAA');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('treats a stored value that no longer validates as not found', async () => {
    kv.data.set('AAAAAAAAAA', '{"version":1,"name":"","segments":[]}');
    const res = await call('/w/AAAAAAAAAA');
    expect(res.status).toBe(404);
  });

  it('answers HEAD for an unknown id with a 404 and no body', async () => {
    const res = await call('/w/AAAAAAAAAA', { method: 'HEAD' });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });
});

describe('the rest of the site', () => {
  it.each(['/', '/index.html', '/styles.css', '/w', '/wx/AAAAAAAAAA'])(
    'still passes %s through to the static site',
    async (path) => {
      const res = await call(path);
      expect(await res.text()).toBe(`asset ${path}`);
    },
  );
});

describe('kept in step with site/', () => {
  it('links the same DMG as every download button on the landing page', () => {
    const hrefs = [...parse(landingHtml).querySelectorAll('a[href$=".dmg"]')].map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).toBe(DOWNLOAD_URL);
  });

  it('only uses classes that site/styles.css defines', async () => {
    const pages = [
      renderPreviewPage('AAAAAAAAAA', workout),
      renderPreviewPage('AAAAAAAAAA', { ...workout, segments: [workout.segments[0]] }),
      renderNotFoundPage(),
    ];
    const classes = new Set<string>();
    for (const html of pages)
      for (const el of parse(html).querySelectorAll('[class]')) for (const c of el.classList) classes.add(c);
    const missing = [...classes].filter((c) => !new RegExp(`\\.${c}(?![\\w-])`).test(siteCss));
    expect(missing).toEqual([]);
  });
});

describe('a one-block workout', () => {
  it('says "1 block"', async () => {
    const one: SharedWorkout = { ...workout, segments: [{ intensity: 'easy', durationSec: 65 }] };
    const doc = parse(await (await call(`/w/${await store(one)}`)).text());
    expect(text(doc, '.pv-stats')).toContain('1 block');
    expect(text(doc, '.pv-stats')).not.toContain('1 blocks');
    expect(text(doc, '.pv-total')).toBe('1:05');
  });
});
