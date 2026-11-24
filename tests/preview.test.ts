// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Env, KEY_PREFIX, handleRequest } from '../worker/handler';
import {
  DOWNLOAD_URL,
  escapeHtml,
  formatTotal,
  renderNotFoundPage,
  renderPreviewPage,
} from '../worker/preview';
import { SharedWorkout } from '../src/core/share';
import { INTENSITY_META } from '../src/core/types';

const ORIGIN = 'https://rowalong.example.com';
const ID = 'AbCd1234';

const workout: SharedWorkout = {
  v: 1,
  name: 'Quick 20',
  segments: [
    { intensity: 'easy', durationSec: 300 },
    { intensity: 'hard', durationSec: 420, label: 'Push' },
    { intensity: 'allout', durationSec: 60 },
    { intensity: 'easy', durationSec: 420 },
  ],
};

function makeEnv(entries: Record<string, string> = {}) {
  const map = new Map(Object.entries(entries));
  const assetHits: string[] = [];
  const env: Env = {
    SHARES: {
      async get(key) {
        return map.get(key) ?? null;
      },
      async put(key, value) {
        map.set(key, value);
      },
    },
    CREATE_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: {
      async fetch(req) {
        assetHits.push(new URL(req.url).pathname);
        return new Response('asset');
      },
    },
  };
  return { env, assetHits };
}

const get = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);
const render = (w: SharedWorkout) =>
  renderPreviewPage(w, { shareUrl: `${ORIGIN}/w/${ID}`, nonce: 'n0nce' });

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('formatTotal', () => {
  it('formats minutes and leftover seconds', () => {
    expect(formatTotal(1200)).toBe('20 min');
    expect(formatTotal(1290)).toBe('21 min 30 s');
    expect(formatTotal(45)).toBe('45 s');
  });
});

describe('renderPreviewPage', () => {
  const html = render(workout);

  it('shows the name, total time and block count', () => {
    expect(html).toContain('<h1>Quick 20</h1>');
    expect(html).toContain('<title>Quick 20 · RowAlong workout</title>');
    expect(html).toContain('<b>20 min</b> · 4 blocks');
  });

  it('draws a timeline with one bar per segment, sized and colored by intensity', () => {
    const bars = html.match(/<span style="flex-grow: (\d+); background: (#[0-9a-f]+)"/g) ?? [];
    expect(bars).toEqual([
      `<span style="flex-grow: 300; background: ${INTENSITY_META.easy.color}"`,
      `<span style="flex-grow: 420; background: ${INTENSITY_META.hard.color}"`,
      `<span style="flex-grow: 60; background: ${INTENSITY_META.allout.color}"`,
      `<span style="flex-grow: 420; background: ${INTENSITY_META.easy.color}"`,
    ]);
  });

  it('lists every segment with intensity, label, spm and duration', () => {
    expect(html).toContain('<span class="pv-name">Easy</span><span class="pv-spm">24 spm</span><span class="pv-dur">5:00</span>');
    expect(html).toContain('<span class="pv-name">Hard<small>Push</small></span>');
    expect(html).toContain('<span class="pv-spm">30–32 spm</span><span class="pv-dur">1:00</span>');
    expect(html.match(/<li style="--c:/g)).toHaveLength(4);
  });

  it('has the link with a Copy link button, import steps and the download button', () => {
    expect(html).toContain(`value="${ORIGIN}/w/${ID}"`);
    expect(html).toContain('>Copy link</button>');
    expect(html).toMatch(/Paste the link into <b>Import<\/b>/);
    expect(html).toContain(`<a class="btn-dl" href="${DOWNLOAD_URL}">`);
    expect(html).toContain('<script nonce="n0nce">');
  });

  it('reuses the landing site stylesheet', () => {
    expect(html).toContain('<link rel="stylesheet" href="/styles.css" />');
  });

  it('says "1 block" for a single segment', () => {
    expect(render({ ...workout, segments: [workout.segments[0]] })).toContain('<b>5 min</b> · 1 block');
  });

  it('escapes the name and segment labels', () => {
    const evil = render({
      v: 1,
      name: '<script>alert(1)</script> & "co"',
      segments: [{ intensity: 'easy', durationSec: 60, label: '<img src=x onerror=alert(2)>' }],
    });
    expect(evil).not.toContain('<script>alert(1)');
    expect(evil).not.toContain('<img src=x');
    expect(evil).toContain('<h1>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;</h1>');
    expect(evil).toContain('<small>&lt;img src=x onerror=alert(2)&gt;</small>');
    expect(evil).toContain('title="&lt;img src=x onerror=alert(2)&gt; · 1:00"');
    // the only script tag is ours
    expect(evil.match(/<script/g)).toHaveLength(1);
  });

  it('has no script on the not-found page', () => {
    const missing = renderNotFoundPage();
    expect(missing).toContain('Workout not found');
    expect(missing).toContain(DOWNLOAD_URL);
    expect(missing).not.toContain('<script');
  });
});

describe('GET /w/:id', () => {
  const stored = { [KEY_PREFIX + ID]: JSON.stringify(workout) };

  it('renders the preview page for a stored workout', async () => {
    const { env, assetHits } = makeEnv(stored);
    const res = await handleRequest(get(`/w/${ID}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const html = await res.text();
    expect(html).toContain('<h1>Quick 20</h1>');
    expect(html).toContain(`value="${ORIGIN}/w/${ID}"`);
    expect(assetHits).toEqual([]);
  });

  it('sends a CSP whose script nonce matches the inline script', async () => {
    const { env } = makeEnv(stored);
    const res = await handleRequest(get(`/w/${ID}`), env);
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(await res.text()).toContain(`<script nonce="${nonce}">`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns a 404 page for an unknown id', async () => {
    const { env } = makeEnv(stored);
    const res = await handleRequest(get('/w/Zzzz9999'), env);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toContain('Workout not found');
  });

  it('returns 404 for malformed ids without touching KV', async () => {
    const { env } = makeEnv();
    let reads = 0;
    const kvGet = env.SHARES.get.bind(env.SHARES);
    env.SHARES.get = (k) => {
      reads++;
      return kvGet(k);
    };
    for (const p of ['/w/', '/w/short', '/w/AbCd1234/extra', '/w/AbCd12%3C']) {
      const res = await handleRequest(get(p), env);
      expect(res.status).toBe(404);
    }
    expect(reads).toBe(0);
  });

  it('returns 404 for a corrupt stored value', async () => {
    const { env } = makeEnv({ [KEY_PREFIX + ID]: '{"v":1,"name":"x","segments":[{"intensity":"zzz"' });
    expect((await handleRequest(get(`/w/${ID}`), env)).status).toBe(404);
  });

  it('answers HEAD with headers only and rejects other methods', async () => {
    const { env } = makeEnv(stored);
    const head = await handleRequest(get(`/w/${ID}`, { method: 'HEAD' }), env);
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    const post = await handleRequest(get(`/w/${ID}`, { method: 'POST' }), env);
    expect(post.status).toBe(405);
  });
});
