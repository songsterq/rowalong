import {
  MAX_SHARE_BYTES,
  SHARE_API_PATH,
  type SharedWorkout,
  isShareId,
  parseSharedWorkout,
  serializeSharedWorkout,
  shareIdFor,
  shareUrlFor,
} from '../src/core/share';

/** Request handling for the `rowalong` Worker: the share API under /api, and a
 *  fall-through to the static site (site/) for everything else. Written against
 *  the standard Request/Response and the structural bindings below rather than
 *  the Workers types, so tests drive it with a fake KV and fake assets; index.ts
 *  checks at compile time that the real bindings fit these shapes. */

/** The slice of a Workers KV namespace the share API uses. Share ids are content
 *  hashes and links never expire, so there's no delete and no put options. */
export interface ShareStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/** The static-assets binding that serves site/. */
export interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

/** The Worker's bindings, as declared in /wrangler.jsonc. */
export interface WorkerEnv {
  SHARES: ShareStore;
  ASSETS: AssetsFetcher;
}

// Open to every origin: the packaged app loads over file:// (Origin: null) and
// the dev app from localhost. Nothing here uses cookies or credentials.
const CORS_HEADERS: Record<string, string> = { 'Access-Control-Allow-Origin': '*' };

const PREFLIGHT_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

// A stored workout never changes under its id (links are snapshots), so a
// fetched one can be cached; a day keeps a by-hand KV delete effective.
const CACHE_FOUND = 'public, max-age=86400';

const TOO_LARGE = 'Workout is too large to share';
const NOT_JSON = 'Not valid JSON';

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
      ...headers,
    },
  });
}

const error = (message: string, status: number, headers?: Record<string, string>) =>
  json({ error: message }, status, headers);

const methodNotAllowed = (allow: string) =>
  error('Method not allowed', 405, { Allow: `${allow}, OPTIONS` });

/** Route one request. Only /api/* and /w/* reach the script in production
 *  (run_worker_first in /wrangler.jsonc); anything else that does is passed to
 *  the static site unchanged. */
export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === '/api' || path.startsWith('/api/')) return handleApi(request, env.SHARES, path);
  return env.ASSETS.fetch(request);
}

async function handleApi(request: Request, store: ShareStore, path: string): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: PREFLIGHT_HEADERS });

  if (path === SHARE_API_PATH) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    return createShare(request, store);
  }

  const idPrefix = `${SHARE_API_PATH}/`;
  if (path.startsWith(idPrefix)) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return getShare(path.slice(idPrefix.length), store);
  }

  return error('Not found', 404);
}

/** POST /api/w: validate, then store the canonical form under its content id,
 *  writing only if the id is new. 201 for a new link, 200 for an existing one. */
async function createShare(request: Request, store: ShareStore): Promise<Response> {
  let body: string | null;
  try {
    body = await readCappedText(request, MAX_SHARE_BYTES);
  } catch {
    return error(NOT_JSON, 400); // not UTF-8, so not JSON text either
  }
  if (body === null) return error(TOO_LARGE, 400);

  const result = parseSharedWorkout(body);
  if (!result.ok) return error(result.error, 400);

  // Hash and store the validated, normalized workout, never the raw body.
  const id = await shareIdFor(result.workout);
  const canonical = serializeSharedWorkout(result.workout);
  const existing = await store.get(id);
  if (existing === null) {
    await store.put(id, canonical); // no expiry: links last forever
  } else if (existing !== canonical) {
    // Two workouts with the same 60-bit id. Vanishingly rare, but handing out
    // the other workout's link would be wrong; any edit gives a different id.
    return error(
      'This workout clashes with another shared workout. Change anything, such as the name, and share again.',
      409,
    );
  }
  return json({ id, url: shareUrlFor(id) }, existing === null ? 201 : 200);
}

/** GET /api/w/<id>: the stored workout, or 404. */
async function getShare(id: string, store: ShareStore): Promise<Response> {
  const workout = await loadSharedWorkout(store, id);
  if (workout === null) return error('Shared workout not found', 404);
  return json(serializeSharedWorkout(workout), 200, { 'Cache-Control': CACHE_FOUND });
}

/** The workout stored under a share id, or null when the id is malformed or
 *  unknown. Re-validates what it reads, so callers get a well-formed workout. */
export async function loadSharedWorkout(
  store: ShareStore,
  id: string,
): Promise<SharedWorkout | null> {
  if (!isShareId(id)) return null;
  const stored = await store.get(id);
  if (stored === null) return null;
  const result = parseSharedWorkout(stored);
  return result.ok ? result.workout : null;
}

/** Read a body as UTF-8 text, giving up (null) once it passes maxBytes, so an
 *  oversized POST is never buffered whole. Throws if the bytes aren't UTF-8. */
async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get('Content-Length')) > maxBytes) return null;
  if (request.body === null) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
}
