// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  Env,
  KEY_PREFIX,
  MAX_BODY_BYTES,
  MAX_ID_ATTEMPTS,
  handleRequest,
} from '../worker/handler';
import { MAX_SHARE_BYTES } from '../src/core/share';

const ORIGIN = 'https://rowalong.example.com';

class FakeKV {
  map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
}

/** Fixed-window per-key limiter standing in for the rate-limit binding. */
class FakeLimiter {
  counts = new Map<string, number>();
  constructor(private max: number) {}
  async limit({ key }: { key: string }) {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return { success: n <= this.max };
  }
}

function makeEnv(limit = 5) {
  const kv = new FakeKV();
  const limiter = new FakeLimiter(limit);
  const assetHits: string[] = [];
  const env: Env = {
    SHARES: kv,
    CREATE_LIMITER: limiter,
    ASSETS: {
      async fetch(req: Request) {
        assetHits.push(new URL(req.url).pathname);
        return new Response('asset', { status: 200 });
      },
    },
  };
  return { env, kv, limiter, assetHits };
}

const workout = {
  v: 1,
  name: '  Quick 20  ',
  segments: [
    { id: 'local-1', intensity: 'easy', durationSec: 300 },
    { id: 'local-2', intensity: 'hard', durationSec: 60, label: 'Push' },
  ],
};

function post(body: unknown, { ip = '1.2.3.4', raw }: { ip?: string; raw?: string } = {}) {
  return new Request(`${ORIGIN}/api/workouts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: raw ?? JSON.stringify(body),
  });
}

const get = (path: string, init?: RequestInit) => new Request(`${ORIGIN}${path}`, init);

async function bodyOf(res: Response) {
  return JSON.parse(await res.text());
}

describe('POST /api/workouts', () => {
  it('stores the normalized workout under an 8-char base62 id and returns { id, url }', async () => {
    const { env, kv } = makeEnv();
    const res = await handleRequest(post(workout), env);
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const { id, url } = await bodyOf(res);
    expect(id).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(url).toBe(`${ORIGIN}/w/${id}`);
    expect(JSON.parse(kv.map.get(KEY_PREFIX + id)!)).toEqual({
      v: 1,
      name: 'Quick 20',
      segments: [
        { intensity: 'easy', durationSec: 300 },
        { intensity: 'hard', durationSec: 60, label: 'Push' },
      ],
    });
  });

  it('retries on an id collision and never overwrites an existing workout', async () => {
    const { env, kv } = makeEnv();
    kv.map.set(KEY_PREFIX + 'AAAAAAAA', 'existing');
    const ids = ['AAAAAAAA', 'BBBBBBBB'];
    const res = await handleRequest(post(workout), env, { newId: () => ids.shift()! });
    expect(res.status).toBe(201);
    expect((await bodyOf(res)).id).toBe('BBBBBBBB');
    expect(kv.map.get(KEY_PREFIX + 'AAAAAAAA')).toBe('existing');
  });

  it('gives up with 500 after repeated collisions', async () => {
    const { env, kv } = makeEnv();
    kv.map.set(KEY_PREFIX + 'AAAAAAAA', 'existing');
    let calls = 0;
    const res = await handleRequest(post(workout), env, {
      newId: () => (calls++, 'AAAAAAAA'),
    });
    expect(res.status).toBe(500);
    expect(calls).toBe(MAX_ID_ATTEMPTS);
    expect(kv.map.size).toBe(1);
  });

  it('answers a KV failure (e.g. the daily write quota) with a CORS-readable 500', async () => {
    const { env, kv } = makeEnv();
    kv.put = async () => {
      throw new Error('KV put() limit exceeded for the day.');
    };
    const res = await handleRequest(post(workout), env);
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(typeof (await bodyOf(res)).error).toBe('string');
  });

  it.each([
    ['an unknown intensity', { ...workout, segments: [{ intensity: 'sprint', durationSec: 60 }] }],
    ['a duration not in 5-second steps', { ...workout, segments: [{ intensity: 'easy', durationSec: 62 }] }],
    ['a zero duration', { ...workout, segments: [{ intensity: 'easy', durationSec: 0 }] }],
    ['no segments', { ...workout, segments: [] }],
    ['an empty name', { ...workout, name: '   ' }],
    ['a wrong version', { ...workout, v: 2 }],
    ['a non-object', [1, 2, 3]],
  ])('rejects %s with 400 and stores nothing', async (_label, payload) => {
    const { env, kv } = makeEnv();
    const res = await handleRequest(post(payload), env);
    expect(res.status).toBe(400);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(typeof (await bodyOf(res)).error).toBe('string');
    expect(kv.map.size).toBe(0);
  });

  it('rejects a body that is not JSON with 400', async () => {
    const { env } = makeEnv();
    const res = await handleRequest(post(null, { raw: '{"v":1,' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects a workout over the size cap with 413', async () => {
    const { env, kv } = makeEnv();
    // 100 labelled segments: valid shape and count, but well over 8 KB normalized.
    const big = {
      v: 1,
      name: 'Big',
      segments: Array.from({ length: 100 }, () => ({
        intensity: 'easy',
        durationSec: 60,
        label: 'x'.repeat(80),
      })),
    };
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_SHARE_BYTES);
    expect(JSON.stringify(big).length).toBeLessThan(MAX_BODY_BYTES);
    const res = await handleRequest(post(big), env);
    expect(res.status).toBe(413);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(kv.map.size).toBe(0);
  });

  it('rejects an oversized raw body with 413 before parsing it', async () => {
    const { env } = makeEnv();
    const raw = JSON.stringify({ ...workout, pad: 'x'.repeat(MAX_BODY_BYTES) });
    const res = await handleRequest(post(null, { raw }), env);
    expect(res.status).toBe(413);
  });

  it('rate-limits creates per IP with 429, without affecting other IPs', async () => {
    const { env, kv } = makeEnv(2);
    expect((await handleRequest(post(workout, { ip: '9.9.9.9' }), env)).status).toBe(201);
    expect((await handleRequest(post(workout, { ip: '9.9.9.9' }), env)).status).toBe(201);
    const limited = await handleRequest(post(workout, { ip: '9.9.9.9' }), env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('access-control-allow-origin')).toBe('*');
    expect(kv.map.size).toBe(2);
    expect((await handleRequest(post(workout, { ip: '8.8.8.8' }), env)).status).toBe(201);
  });

  it('keys the limiter on CF-Connecting-IP', async () => {
    const { env, limiter } = makeEnv();
    await handleRequest(post(workout, { ip: '203.0.113.7' }), env);
    expect([...limiter.counts.keys()]).toEqual(['203.0.113.7']);
  });

  it('answers 405 for other methods on the collection', async () => {
    const { env } = makeEnv();
    const res = await handleRequest(get('/api/workouts'), env);
    expect(res.status).toBe(405);
  });
});

describe('GET /api/workouts/:id', () => {
  it('returns the stored workout as JSON with CORS headers', async () => {
    const { env } = makeEnv();
    const { id } = await bodyOf(await handleRequest(post(workout), env));
    const res = await handleRequest(
      get(`/api/workouts/${id}`, { headers: { origin: 'null' } }),
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect((await bodyOf(res)).name).toBe('Quick 20');
  });

  it('returns 404 for an unknown id', async () => {
    const { env } = makeEnv();
    const res = await handleRequest(get('/api/workouts/Zz9Zz9Zz'), env);
    expect(res.status).toBe(404);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns 404 for a malformed id without touching KV', async () => {
    const { env } = makeEnv();
    env.SHARES.get = async () => {
      throw new Error('should not be called');
    };
    for (const id of ['short', 'toolong123', 'bad-id!!', '']) {
      expect((await handleRequest(get(`/api/workouts/${id}`), env)).status).toBe(404);
    }
  });
});

describe('routing and CORS', () => {
  it('answers the preflight for POST /api/workouts', async () => {
    const { env } = makeEnv();
    const res = await handleRequest(
      get('/api/workouts', {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      }),
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type');
  });

  it('returns 404 JSON for unknown /api routes', async () => {
    const { env, assetHits } = makeEnv();
    const res = await handleRequest(get('/api/nope'), env);
    expect(res.status).toBe(404);
    expect(assetHits).toEqual([]);
  });

  it('hands everything else to the static assets', async () => {
    const { env, assetHits } = makeEnv();
    await handleRequest(get('/'), env);
    await handleRequest(get('/styles.css'), env);
    await handleRequest(get('/w/AbCd1234'), env); // the preview page, not an asset
    expect(assetHits).toEqual(['/', '/styles.css']);
  });
});

describe('worker entry module', () => {
  it('exports only the default handler (workerd rejects other named exports)', async () => {
    const mod = await import('../worker/index');
    expect(Object.keys(mod)).toEqual(['default']);
    expect(typeof mod.default.fetch).toBe('function');
  });
});
