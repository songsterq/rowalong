import { describe, it, expect, vi } from 'vitest';
import {
  validateSharedWorkout,
  parseShareUrl,
  createShare,
  fetchShare,
  toSharedWorkout,
  fromSharedWorkout,
  generateShareId,
  shareUrl,
  ShareError,
  MAX_SHARE_BYTES,
  MAX_NAME_LENGTH,
  MAX_SEGMENTS,
  MAX_SEGMENT_SEC,
  SHARE_ID_LENGTH,
  type SharedWorkout,
} from '../src/core/share';

const good = (): SharedWorkout => ({
  v: 1,
  name: 'Quick 20',
  segments: [
    { intensity: 'easy', durationSec: 300 },
    { intensity: 'allout', durationSec: 45, label: 'Sprint' },
  ],
});

function expectInvalid(input: unknown, reason: 'invalid' | 'too_large' = 'invalid') {
  const r = validateSharedWorkout(input);
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.reason).toBe(reason);
    expect(typeof r.error).toBe('string');
  }
}

describe('validateSharedWorkout', () => {
  it('accepts a well-formed payload and returns a normalized copy', () => {
    const r = validateSharedWorkout(good());
    expect(r).toEqual({ ok: true, value: good() });
  });

  it('strips unknown keys (including segment ids) and trims the name', () => {
    const r = validateSharedWorkout({
      v: 1,
      name: '  Pyramid  ',
      extra: 'x',
      segments: [{ id: 'seg-1', intensity: 'hard', durationSec: 60, junk: true }],
    });
    expect(r).toEqual({
      ok: true,
      value: { v: 1, name: 'Pyramid', segments: [{ intensity: 'hard', durationSec: 60 }] },
    });
  });

  it('rejects non-objects, arrays and null', () => {
    for (const x of [null, undefined, 42, 'str', [], true]) expectInvalid(x);
  });

  it('rejects a missing or unknown version', () => {
    expectInvalid({ ...good(), v: 2 });
    const { v: _v, ...noV } = good();
    expectInvalid(noV);
  });

  it('rejects empty, non-string or over-long names', () => {
    expectInvalid({ ...good(), name: '' });
    expectInvalid({ ...good(), name: '   ' });
    expectInvalid({ ...good(), name: 7 });
    expectInvalid({ ...good(), name: 'x'.repeat(MAX_NAME_LENGTH + 1) });
    expect(validateSharedWorkout({ ...good(), name: 'x'.repeat(MAX_NAME_LENGTH) }).ok).toBe(true);
  });

  it('rejects an unknown intensity', () => {
    expectInvalid({ ...good(), segments: [{ intensity: 'insane', durationSec: 60 }] });
    expectInvalid({ ...good(), segments: [{ intensity: 'toString', durationSec: 60 }] });
  });

  it('rejects durations that are not positive multiples of 5 seconds', () => {
    for (const d of [0, -5, 7, 12.5, 5.0001, NaN, Infinity, '60', null]) {
      expectInvalid({ ...good(), segments: [{ intensity: 'easy', durationSec: d }] });
    }
    expect(
      validateSharedWorkout({ ...good(), segments: [{ intensity: 'easy', durationSec: 5 }] }).ok,
    ).toBe(true);
  });

  it('rejects a segment longer than the per-segment cap', () => {
    expectInvalid({
      ...good(),
      segments: [{ intensity: 'easy', durationSec: MAX_SEGMENT_SEC + 5 }],
    });
    expect(
      validateSharedWorkout({
        ...good(),
        segments: [{ intensity: 'easy', durationSec: MAX_SEGMENT_SEC }],
      }).ok,
    ).toBe(true);
  });

  it('rejects empty, missing, or too many segments', () => {
    expectInvalid({ ...good(), segments: [] });
    expectInvalid({ ...good(), segments: 'nope' });
    expectInvalid({ v: 1, name: 'x' });
    const many = Array.from({ length: MAX_SEGMENTS + 1 }, () => ({
      intensity: 'easy',
      durationSec: 5,
    }));
    expectInvalid({ ...good(), segments: many });
    expect(validateSharedWorkout({ ...good(), segments: many.slice(1) }).ok).toBe(true);
  });

  it('rejects non-object segments and bad labels', () => {
    expectInvalid({ ...good(), segments: [null] });
    expectInvalid({ ...good(), segments: [{ intensity: 'easy', durationSec: 5, label: 3 }] });
    expectInvalid({
      ...good(),
      segments: [{ intensity: 'easy', durationSec: 5, label: 'x'.repeat(MAX_NAME_LENGTH + 1) }],
    });
  });

  it('rejects a payload whose serialized size exceeds the cap with reason too_large', () => {
    // MAX_SEGMENTS segments with long labels blow past 8 KB.
    const segs = Array.from({ length: MAX_SEGMENTS }, () => ({
      intensity: 'medium',
      durationSec: 60,
      label: 'é'.repeat(MAX_NAME_LENGTH),
    }));
    expect(new TextEncoder().encode(JSON.stringify({ v: 1, name: 'x', segments: segs })).length)
      .toBeGreaterThan(MAX_SHARE_BYTES);
    expectInvalid({ v: 1, name: 'x', segments: segs }, 'too_large');
  });

  it('caps around 8 KB', () => {
    expect(MAX_SHARE_BYTES).toBe(8192);
  });
});

describe('toSharedWorkout / fromSharedWorkout', () => {
  it('drops ids on the way out', () => {
    const shared = toSharedWorkout('Mine', [
      { id: 'a', intensity: 'easy', durationSec: 60 },
      { id: 'b', intensity: 'hard', durationSec: 30, label: 'Go' },
    ]);
    expect(shared).toEqual({
      v: 1,
      name: 'Mine',
      segments: [
        { intensity: 'easy', durationSec: 60 },
        { intensity: 'hard', durationSec: 30, label: 'Go' },
      ],
    });
  });

  it('re-ids the template and every segment on import', () => {
    const t = fromSharedWorkout(good());
    expect(t.name).toBe('Quick 20');
    expect(t.segments.map(({ id: _id, ...rest }) => rest)).toEqual(good().segments);
    const ids = [t.id, ...t.segments.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const again = fromSharedWorkout(good());
    expect(again.segments[0].id).not.toBe(t.segments[0].id);
  });
});

describe('share ids and urls', () => {
  it('generates 8-char base62 ids', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateShareId();
      expect(id).toHaveLength(SHARE_ID_LENGTH);
      expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
    }
  });

  it('builds the public link from a base url, tolerating a trailing slash', () => {
    expect(shareUrl('https://example.com', 'abcDEF12')).toBe('https://example.com/w/abcDEF12');
    expect(shareUrl('https://example.com/', 'abcDEF12')).toBe('https://example.com/w/abcDEF12');
  });
});

describe('parseShareUrl', () => {
  it('accepts a bare id, trimming whitespace', () => {
    expect(parseShareUrl('abcDEF12')).toBe('abcDEF12');
    expect(parseShareUrl('  abcDEF12\n')).toBe('abcDEF12');
  });

  it('accepts a full /w/:id link on any host, with optional trailing slash, query or hash', () => {
    expect(parseShareUrl('https://rowalong.example.com/w/abcDEF12')).toBe('abcDEF12');
    expect(parseShareUrl('http://localhost:8787/w/abcDEF12/')).toBe('abcDEF12');
    expect(parseShareUrl('https://x.dev/w/abcDEF12?ref=chat#top')).toBe('abcDEF12');
  });

  it('rejects anything else', () => {
    for (const s of [
      '',
      '   ',
      'abc',
      'abcDEF123',
      'abc-EF12',
      'https://x.dev/abcDEF12',
      'https://x.dev/w/',
      'https://x.dev/w/abcDEF12/extra',
      'https://x.dev/api/workouts/abcDEF12',
      'https://x.dev/foo/w/abcDEF12',
      'ftp://x.dev/w/abcDEF12',
      'javascript:alert(1)//w/abcDEF12',
      'x.dev/w/abcDEF12',
    ]) {
      expect(parseShareUrl(s), s).toBeNull();
    }
  });
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function catchShareError(p: Promise<unknown>): Promise<ShareError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ShareError);
    return e as ShareError;
  }
  throw new Error('expected rejection');
}

describe('createShare', () => {
  it('POSTs the validated payload to /api/workouts and returns id + url', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(201, { id: 'abcDEF12', url: 'https://api.test/w/abcDEF12' }),
    );
    const r = await createShare(good(), { baseUrl: 'https://api.test/', fetch });
    expect(r).toEqual({ id: 'abcDEF12', url: 'https://api.test/w/abcDEF12' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/workouts');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(good());
  });

  it('builds the url from the id when the server omits it', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, { id: 'abcDEF12' }));
    const r = await createShare(good(), { baseUrl: 'https://api.test', fetch });
    expect(r.url).toBe('https://api.test/w/abcDEF12');
  });

  it('rejects an invalid workout locally without calling fetch', async () => {
    const fetch = vi.fn();
    const e = await catchShareError(
      createShare({ ...good(), segments: [] }, { baseUrl: 'https://api.test', fetch }),
    );
    expect(e.kind).toBe('invalid');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [400, 'invalid'],
    [413, 'too_large'],
    [429, 'rate_limited'],
    [500, 'server'],
    [503, 'server'],
  ] as const)('maps HTTP %i to kind %s', async (status, kind) => {
    const fetch = vi.fn(async () => jsonResponse(status, { error: 'nope' }));
    const e = await catchShareError(createShare(good(), { baseUrl: 'https://api.test', fetch }));
    expect(e.kind).toBe(kind);
    expect(e.status).toBe(status);
  });

  it('maps a thrown fetch to kind network', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const e = await catchShareError(createShare(good(), { baseUrl: 'https://api.test', fetch }));
    expect(e.kind).toBe('network');
  });

  it('treats a malformed success body as a server error', async () => {
    const fetch = vi.fn(async () => jsonResponse(201, { id: 'not valid!' }));
    const e = await catchShareError(createShare(good(), { baseUrl: 'https://api.test', fetch }));
    expect(e.kind).toBe('server');
  });
});

describe('fetchShare', () => {
  it('GETs /api/workouts/:id for a pasted link and returns the validated workout', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, { ...good(), extra: 1 }));
    const w = await fetchShare('https://elsewhere.test/w/abcDEF12', {
      baseUrl: 'https://api.test',
      fetch,
    });
    expect(w).toEqual(good());
    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://api.test/api/workouts/abcDEF12');
  });

  it('accepts a bare id', async () => {
    const fetch = vi.fn(async () => jsonResponse(200, good()));
    await fetchShare('abcDEF12', { baseUrl: 'https://api.test', fetch });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.test/api/workouts/abcDEF12',
    );
  });

  it('rejects a bad link without calling fetch', async () => {
    const fetch = vi.fn();
    const e = await catchShareError(
      fetchShare('https://x.test/nope', { baseUrl: 'https://api.test', fetch }),
    );
    expect(e.kind).toBe('bad_link');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps 404 to not_found', async () => {
    const fetch = vi.fn(async () => jsonResponse(404, { error: 'not found' }));
    const e = await catchShareError(fetchShare('abcDEF12', { baseUrl: 'https://api.test', fetch }));
    expect(e.kind).toBe('not_found');
  });

  it('maps a thrown fetch to network', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const e = await catchShareError(fetchShare('abcDEF12', { baseUrl: 'https://api.test', fetch }));
    expect(e.kind).toBe('network');
  });

  it('rejects a server payload that fails validation', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse(200, { v: 1, name: 'x', segments: [{ intensity: 'zzz', durationSec: 5 }] }),
    );
    const e = await catchShareError(fetchShare('abcDEF12', { baseUrl: 'https://api.test', fetch }));
    expect(e.kind).toBe('server');
  });

  it('rejects a non-JSON body as a server error', async () => {
    const fetch = vi.fn(async () => new Response('<html>', { status: 200 }));
    const e = await catchShareError(fetchShare('abcDEF12', { baseUrl: 'https://api.test', fetch }));
    expect(e.kind).toBe('server');
  });

  it('defaults to the global fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, good()));
    try {
      await fetchShare('abcDEF12', { baseUrl: 'https://api.test' });
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
