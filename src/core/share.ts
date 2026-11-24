// Shared-workout format, validator and client. Pure and DOM-free: both the app
// and the Cloudflare Worker import this module, so the payload rules live in
// exactly one place and can't drift between client and server.
import { INTENSITY_META, Intensity, Segment, Template, makeId } from './types';

/** A segment as it travels over the wire: a Segment without its local id. */
export type SharedSegment = Omit<Segment, 'id'>;

/** The share payload: a Template minus ids, versioned for future changes. */
export interface SharedWorkout {
  v: 1;
  name: string;
  segments: SharedSegment[];
}

/** Serialized (UTF-8 JSON) size cap for a payload. */
export const MAX_SHARE_BYTES = 8192;
/** Max length of the workout name (after trimming) and of a segment label. */
export const MAX_NAME_LENGTH = 80;
export const MAX_SEGMENTS = 100;
/** Longest single segment, in seconds (1 hour). */
export const MAX_SEGMENT_SEC = 3600;
/** Durations are whole multiples of this, matching the generator's 5-second units. */
export const DURATION_STEP_SEC = 5;

export const SHARE_ID_LENGTH = 8;
const SHARE_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SHARE_ID_RE = /^[A-Za-z0-9]{8}$/;

export type ValidationResult =
  | { ok: true; value: SharedWorkout }
  | { ok: false; reason: 'invalid' | 'too_large'; error: string };

const fail = (error: string): ValidationResult => ({ ok: false, reason: 'invalid', error });

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const isIntensity = (x: unknown): x is Intensity =>
  typeof x === 'string' && Object.prototype.hasOwnProperty.call(INTENSITY_META, x);

/** Byte length of a string as UTF-8. */
export function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/**
 * Validate an untrusted payload (parsed JSON). On success returns a normalized
 * copy: unknown keys (including any segment ids) dropped and the name trimmed.
 * `reason: 'too_large'` means only the serialized size cap was exceeded.
 */
export function validateSharedWorkout(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('Payload must be an object');
  if (input.v !== 1) return fail('Unsupported version');

  if (typeof input.name !== 'string') return fail('Name must be a string');
  const name = input.name.trim();
  if (name.length === 0) return fail('Name is empty');
  if (name.length > MAX_NAME_LENGTH) return fail(`Name is longer than ${MAX_NAME_LENGTH} characters`);

  const segs = input.segments;
  if (!Array.isArray(segs)) return fail('Segments must be a list');
  if (segs.length === 0) return fail('Workout has no segments');
  if (segs.length > MAX_SEGMENTS) return fail(`Workout has more than ${MAX_SEGMENTS} segments`);

  const segments: SharedSegment[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const at = `Segment ${i + 1}`;
    if (!isRecord(s)) return fail(`${at} must be an object`);
    if (!isIntensity(s.intensity)) return fail(`${at} has an unknown intensity`);
    const d = s.durationSec;
    if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0 || d % DURATION_STEP_SEC !== 0) {
      return fail(`${at} duration must be a positive multiple of ${DURATION_STEP_SEC} seconds`);
    }
    if (d > MAX_SEGMENT_SEC) return fail(`${at} is longer than ${MAX_SEGMENT_SEC} seconds`);
    const out: SharedSegment = { intensity: s.intensity, durationSec: d };
    if (s.label !== undefined) {
      if (typeof s.label !== 'string') return fail(`${at} label must be a string`);
      if (s.label.length > MAX_NAME_LENGTH) return fail(`${at} label is too long`);
      out.label = s.label;
    }
    segments.push(out);
  }

  const value: SharedWorkout = { v: 1, name, segments };
  if (utf8Length(JSON.stringify(value)) > MAX_SHARE_BYTES) {
    return { ok: false, reason: 'too_large', error: `Workout is larger than ${MAX_SHARE_BYTES} bytes` };
  }
  return { ok: true, value };
}

/** Build a share payload from what's in the editor (drops local ids). */
export function toSharedWorkout(name: string, segments: Segment[]): SharedWorkout {
  return {
    v: 1,
    name,
    segments: segments.map(({ intensity, durationSec, label }) =>
      label === undefined ? { intensity, durationSec } : { intensity, durationSec, label },
    ),
  };
}

/** Turn an imported payload into a fresh local Template, re-id'ing everything. */
export function fromSharedWorkout(w: SharedWorkout): Template {
  return {
    id: makeId(),
    name: w.name,
    segments: w.segments.map((s) => ({ ...s, id: makeId() })),
  };
}

/** A random 8-char base62 share id (crypto RNG; works in browsers and Workers). */
export function generateShareId(): string {
  const bytes = new Uint8Array(SHARE_ID_LENGTH * 2);
  let id = '';
  while (id.length < SHARE_ID_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // 248 = 4 * 62: reject the tail to keep the distribution uniform.
      if (b < 248 && id.length < SHARE_ID_LENGTH) id += SHARE_ID_ALPHABET[b % 62];
    }
  }
  return id;
}

export function isShareId(s: string): boolean {
  return SHARE_ID_RE.test(s);
}

const trimSlash = (base: string) => base.replace(/\/+$/, '');

/** The public link for an id: `${base}/w/${id}`. */
export function shareUrl(baseUrl: string, id: string): string {
  return `${trimSlash(baseUrl)}/w/${id}`;
}

/** The JSON API endpoint for an id: `${base}/api/workouts/${id}`. */
export function shareApiUrl(baseUrl: string, id?: string): string {
  return `${trimSlash(baseUrl)}/api/workouts${id === undefined ? '' : `/${id}`}`;
}

/**
 * Extract the share id from a pasted string: a bare id, or an http(s) link whose
 * path is exactly /w/:id (optional trailing slash; any host, query or hash).
 * Returns null for anything else.
 */
export function parseShareUrl(input: string): string | null {
  const s = input.trim();
  if (isShareId(s)) return s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const m = /^\/w\/([A-Za-z0-9]{8})\/?$/.exec(u.pathname);
  return m ? m[1] : null;
}

export type ShareErrorKind =
  | 'invalid' // payload failed validation (locally or 400)
  | 'too_large' // 413
  | 'bad_link' // pasted text isn't a share link or id
  | 'not_found' // 404
  | 'rate_limited' // 429
  | 'network' // fetch threw (offline, DNS, CORS)
  | 'server'; // anything else, incl. malformed responses

export class ShareError extends Error {
  constructor(
    readonly kind: ShareErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ShareError';
  }
}

export interface ShareClientOptions {
  /** Origin of the Worker, e.g. 'https://rowalong.example.com' (trailing slash ok). */
  baseUrl: string;
  fetch?: typeof fetch;
}

function kindForStatus(status: number): ShareErrorKind {
  if (status === 400) return 'invalid';
  if (status === 404) return 'not_found';
  if (status === 413) return 'too_large';
  if (status === 429) return 'rate_limited';
  return 'server';
}

async function request(
  opts: ShareClientOptions,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    throw new ShareError('network', e instanceof Error ? e.message : 'Network error');
  }
  if (!res.ok) {
    throw new ShareError(kindForStatus(res.status), `Request failed (${res.status})`, res.status);
  }
  try {
    return await res.json();
  } catch {
    throw new ShareError('server', 'Response was not JSON', res.status);
  }
}

/** Publish a workout; resolves to its id and public link. */
export async function createShare(
  workout: SharedWorkout,
  opts: ShareClientOptions,
): Promise<{ id: string; url: string }> {
  const v = validateSharedWorkout(workout);
  if (!v.ok) throw new ShareError(v.reason, v.error);
  const body = await request(opts, shareApiUrl(opts.baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(v.value),
  });
  if (!isRecord(body) || typeof body.id !== 'string' || !isShareId(body.id)) {
    throw new ShareError('server', 'Unexpected response from server');
  }
  const url = typeof body.url === 'string' ? body.url : shareUrl(opts.baseUrl, body.id);
  return { id: body.id, url };
}

/** Fetch a shared workout by pasted link or bare id; validates the response. */
export async function fetchShare(
  linkOrId: string,
  opts: ShareClientOptions,
): Promise<SharedWorkout> {
  const id = parseShareUrl(linkOrId);
  if (id === null) throw new ShareError('bad_link', 'That is not a RowAlong share link');
  const body = await request(opts, shareApiUrl(opts.baseUrl, id));
  const v = validateSharedWorkout(body);
  if (!v.ok) throw new ShareError('server', `Shared workout is invalid: ${v.error}`);
  return v.value;
}
