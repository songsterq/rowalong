// Request handling for the `rowalong` Worker (entry: worker/index.ts). Static
// assets (site/) are still served by the assets layer; wrangler.jsonc routes only
// /api/* and /w/* here first (assets.run_worker_first), and anything else this
// sees is handed back to env.ASSETS.
//
// Payload rules come from src/core/share.ts, the same module the app uses, so
// the client and server can't disagree about what a valid workout is.
import {
  MAX_SHARE_BYTES,
  generateShareId,
  isShareId,
  shareUrl,
  utf8Length,
  validateSharedWorkout,
} from '../src/core/share';

// Minimal shapes of the Cloudflare bindings we use, so the Worker typechecks
// without @cloudflare/workers-types (and tests can pass plain fakes).
export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** The Workers rate-limit binding (wrangler.jsonc `ratelimits`). */
export interface RateLimiterLike {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

export interface AssetsLike {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  SHARES: KVLike;
  CREATE_LIMITER: RateLimiterLike;
  ASSETS: AssetsLike;
}

/** KV key prefix for stored workouts (leaves room for other key kinds later). */
export const KEY_PREFIX = 'w:';
/** Raw request bodies above this are rejected unread-ish with 413. The cap is
 *  looser than MAX_SHARE_BYTES because the validator measures the normalized
 *  payload (ids and whitespace dropped), and that is the size that counts. */
export const MAX_BODY_BYTES = MAX_SHARE_BYTES * 2;
/** Attempts at finding an unused id before giving up with 500. */
export const MAX_ID_ATTEMPTS = 5;

// The app calls from http://localhost:5173 (dev) and file:// (packaged Electron,
// Origin "null"); the data is public and no credentials are sent, so allow all.
const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS, ...extra },
  });
}

const error = (status: number, message: string) => json(status, { error: message });

export interface HandlerDeps {
  /** Id source; injectable so tests can force collisions. */
  newId?: () => string;
}

export async function handleRequest(
  request: Request,
  env: Env,
  deps: HandlerDeps = {},
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/api/workouts' || path.startsWith('/api/workouts/')) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (path === '/api/workouts') {
      if (request.method !== 'POST') return methodNotAllowed('POST, OPTIONS');
      return createWorkout(request, env, url, deps.newId ?? generateShareId);
    }
    const id = path.slice('/api/workouts/'.length);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return methodNotAllowed('GET, OPTIONS');
    }
    return getWorkout(id, env);
  }

  if (path.startsWith('/api/')) return error(404, 'Not found');

  // /w/:id (the browser preview, ROW-3) and anything else: the static site.
  return env.ASSETS.fetch(request);
}

function methodNotAllowed(allow: string): Response {
  return json(405, { error: 'Method not allowed' }, { allow });
}

async function getWorkout(id: string, env: Env): Promise<Response> {
  if (!isShareId(id)) return error(404, 'Not found');
  const stored = await env.SHARES.get(KEY_PREFIX + id);
  if (stored === null) return error(404, 'Not found');
  return new Response(stored, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Links are immutable, so a found workout can be cached hard.
      'cache-control': 'public, max-age=31536000, immutable',
      ...CORS_HEADERS,
    },
  });
}

async function createWorkout(
  request: Request,
  env: Env,
  url: URL,
  newId: () => string,
): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const { success } = await env.CREATE_LIMITER.limit({ key: ip });
  if (!success) return error(429, 'Too many shares; try again in a minute');

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return error(413, 'Workout is too large');
  }
  const text = await request.text();
  if (utf8Length(text) > MAX_BODY_BYTES) return error(413, 'Workout is too large');

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return error(400, 'Body is not valid JSON');
  }
  const v = validateSharedWorkout(body);
  if (!v.ok) return error(v.reason === 'too_large' ? 413 : 400, v.error);

  const value = JSON.stringify(v.value);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const id = newId();
    const key = KEY_PREFIX + id;
    if ((await env.SHARES.get(key)) !== null) continue;
    await env.SHARES.put(key, value);
    return json(201, { id, url: shareUrl(url.origin, id) });
  }
  return error(500, 'Could not allocate a share id');
}
