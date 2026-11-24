// @vitest-environment node
// The Worker runs on the Workers runtime, not in a page: use Node's own
// Request/Response/streams rather than jsdom's globals.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleRequest,
  loadSharedWorkout,
  type ShareStore,
  type WorkerEnv,
} from '../worker/handler';
import {
  MAX_SHARE_BYTES,
  SHARE_BASE_URL,
  type SharedWorkout,
  serializeSharedWorkout,
  shareIdFor,
} from '../src/core/share';

/** In-memory KV that records every write, with whatever arguments it got. */
class FakeKV implements ShareStore {
  readonly data = new Map<string, string>();
  readonly puts: unknown[][] = [];
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string, ...rest: unknown[]): Promise<void> {
    this.puts.push([key, value, ...rest]);
    this.data.set(key, value);
  }
}

/** Stands in for the site/ assets binding: answers with the path it was asked for. */
class FakeAssets {
  readonly requests: Request[] = [];
  async fetch(request: Request): Promise<Response> {
    this.requests.push(request);
    return new Response(`asset ${new URL(request.url).pathname}`, { status: 200 });
  }
}

const ORIGIN = 'https://rowalong.example';

const workout = (over: Partial<SharedWorkout> = {}): SharedWorkout => ({
  version: 1,
  name: 'Quick 20',
  segments: [
    { intensity: 'easy', durationSec: 120 },
    { intensity: 'allout', durationSec: 30, label: 'Sprint' },
    { intensity: 'medium', durationSec: 60 },
  ],
  ...over,
});

let kv: FakeKV;
let assets: FakeAssets;
let env: WorkerEnv;

beforeEach(() => {
  kv = new FakeKV();
  assets = new FakeAssets();
  env = { SHARES: kv, ASSETS: assets };
});

const call = (path: string, init?: RequestInit) => handleRequest(new Request(`${ORIGIN}${path}`, init), env);

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  call('/api/w', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
    // Node needs this for a streamed body; it's not in the DOM RequestInit type.
    ...({ duplex: 'half' } as object),
  });

const postJson = (value: unknown) => post(JSON.stringify(value));

describe('POST /api/w', () => {
  it('stores a valid workout and returns its content id and link', async () => {
    const res = await postJson(workout());
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string };
    const id = await shareIdFor(workout());
    expect(body).toEqual({ id, url: `${SHARE_BASE_URL}/w/${id}` });
    expect(kv.puts).toEqual([[id, serializeSharedWorkout(workout())]]);
  });

  it('writes with no options, so the link never expires', async () => {
    await postJson(workout());
    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0]).toHaveLength(2);
  });

  it('returns the same id for the same workout without writing again', async () => {
    const first = (await (await postJson(workout())).json()) as { id: string };
    const again = await postJson(workout());
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    expect(kv.puts).toHaveLength(1);
  });

  it('dedups on the normalized workout, not the raw body', async () => {
    const first = (await (await postJson(workout())).json()) as { id: string };
    const noisy = {
      ...workout({ name: '  Quick 20  ' }),
      id: 'tmpl-123',
      extra: true,
      segments: workout().segments.map((s, i) => ({ ...s, id: `seg-${i}` })),
    };
    const again = await postJson(noisy);
    expect(((await again.json()) as { id: string }).id).toBe(first.id);
    expect(kv.puts).toHaveLength(1);
    expect(kv.data.get(first.id)).toBe(serializeSharedWorkout(workout()));
  });

  it('gives a different workout a different id', async () => {
    const a = (await (await postJson(workout())).json()) as { id: string };
    const b = (await (await postJson(workout({ name: 'Quick 21' }))).json()) as { id: string };
    expect(b.id).not.toBe(a.id);
    expect(kv.puts).toHaveLength(2);
  });

  it.each<[string, string]>([
    ['empty body', ''],
    ['not JSON', 'not json'],
    ['a JSON array', '[]'],
    ['wrong version', JSON.stringify(workout({ version: 2 as 1 }))],
    ['missing name', JSON.stringify({ version: 1, segments: workout().segments })],
    ['no segments', JSON.stringify(workout({ segments: [] }))],
    [
      'unknown intensity',
      JSON.stringify(workout({ segments: [{ intensity: 'insane' as 'easy', durationSec: 60 }] })),
    ],
    [
      'a duration off the 5-second grid',
      JSON.stringify(workout({ segments: [{ intensity: 'easy', durationSec: 61 }] })),
    ],
    ['a name over the cap', JSON.stringify(workout({ name: 'x'.repeat(81) }))],
  ])('rejects %s with a 400 and stores nothing', async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toEqual(expect.any(String));
    expect(json.error.length).toBeGreaterThan(0);
    expect(kv.puts).toEqual([]);
  });

  it('passes the validation message through for the app to show', async () => {
    const res = await postJson(workout({ segments: [{ intensity: 'easy', durationSec: 61 }] }));
    expect(await res.json()).toEqual({
      error: 'Segment 1 duration must be a positive multiple of 5 seconds',
    });
  });

  it('rejects bytes that are not UTF-8', async () => {
    const res = await post(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]));
    expect(res.status).toBe(400);
    expect(kv.puts).toEqual([]);
  });

  it('accepts a body of exactly the size cap', async () => {
    const text = JSON.stringify(workout());
    const res = await post(text + ' '.repeat(MAX_SHARE_BYTES - text.length));
    expect(res.status).toBe(201);
  });

  it('rejects a body one byte over the cap with a 400 and stores nothing', async () => {
    const text = JSON.stringify(workout());
    const res = await post(text + ' '.repeat(MAX_SHARE_BYTES - text.length + 1));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Workout is too large to share' });
    expect(kv.puts).toEqual([]);
  });

  it('rejects a declared Content-Length over the cap without reading the body', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('the body should not be read');
      },
    });
    const res = await post(body, { 'Content-Length': String(MAX_SHARE_BYTES + 1) });
    expect(res.status).toBe(400);
    expect(kv.puts).toEqual([]);
  });

  it('stops reading an endless streamed body once it passes the cap', async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode(' '.repeat(1024));
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(chunk);
      },
    });
    const res = await post(endless);
    expect(res.status).toBe(400);
    expect(pulled).toBeLessThan(MAX_SHARE_BYTES / chunk.length + 5);
    expect(kv.puts).toEqual([]);
  });

  it('refuses to hand out an id already holding a different workout', async () => {
    const id = await shareIdFor(workout());
    kv.data.set(id, serializeSharedWorkout(workout({ name: 'Someone else' })));
    const res = await postJson(workout());
    expect(res.status).toBe(409);
    expect(kv.puts).toEqual([]);
    expect(kv.data.get(id)).toBe(serializeSharedWorkout(workout({ name: 'Someone else' })));
  });
});

describe('GET /api/w/<id>', () => {
  it('returns the stored workout', async () => {
    const { id } = (await (await postJson(workout())).json()) as { id: string };
    const res = await call(`/api/w/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual(workout());
  });

  it('returns 404 for an unknown id', async () => {
    const res = await call('/api/w/AAAAAAAAAA');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Shared workout not found' });
  });

  it.each(['short', 'AAAAAAAAAAA', 'AAAA%2FAAAAA', 'AAAAAAAAAA/extra', ''])(
    'returns 404 for the malformed id %j',
    async (id) => {
      const res = await call(`/api/w/${id}`);
      expect(res.status).toBe(404);
    },
  );
});

describe('CORS', () => {
  it('answers a preflight from the packaged app (Origin: null)', async () => {
    const res = await call('/api/w', {
      method: 'OPTIONS',
      headers: {
        Origin: 'null',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('content-type');
  });

  it('allows any origin to read successes and errors', async () => {
    const ok = await post(JSON.stringify(workout()), { Origin: 'null' });
    const bad = await post('nope', { Origin: 'http://localhost:5173' });
    const missing = await call('/api/w/AAAAAAAAAA');
    for (const res of [ok, bad, missing]) {
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    }
  });
});

describe('other requests', () => {
  it.each([
    ['GET', '/api/w', 405],
    ['PUT', '/api/w', 405],
    ['POST', '/api/w/AAAAAAAAAA', 405],
    ['DELETE', '/api/w/AAAAAAAAAA', 405],
    ['GET', '/api', 404],
    ['GET', '/api/other', 404],
  ])('%s %s gets a %i and touches nothing', async (method, path, status) => {
    const res = await call(path, { method });
    expect(res.status).toBe(status);
    expect(kv.puts).toEqual([]);
    expect(assets.requests).toEqual([]);
  });

  it.each(['/', '/index.html', '/styles.css', '/apiary'])(
    'passes %s through to the static site',
    async (path) => {
      const res = await call(path);
      expect(await res.text()).toBe(`asset ${path}`);
      expect(assets.requests).toHaveLength(1);
      expect(kv.puts).toEqual([]);
    },
  );
});

describe('loadSharedWorkout', () => {
  it('reads back a shared workout', async () => {
    const { id } = (await (await postJson(workout())).json()) as { id: string };
    expect(await loadSharedWorkout(kv, id)).toEqual(workout());
  });

  it('returns null for an unknown or malformed id', async () => {
    expect(await loadSharedWorkout(kv, 'AAAAAAAAAA')).toBeNull();
    expect(await loadSharedWorkout(kv, 'not an id')).toBeNull();
  });
});
