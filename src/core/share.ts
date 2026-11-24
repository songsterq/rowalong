import { INTENSITY_META, Intensity, Segment, Template, makeId } from './types';

/** Share-by-link core: the payload format, its validation, canonical form and
 *  content-hashed id, and link parsing. Pure and runtime-neutral (Web Crypto,
 *  TextEncoder, URL only), so the share Worker and the app import the same rules. */

/** The landing page origin, which also serves the share API and preview pages.
 *  The one place the site host lives: change it here and links follow. */
export const SHARE_BASE_URL = 'https://rowalong.endlessrainstudio.com';

/** POST a workout here; GET `${SHARE_API_PATH}/<id>` to fetch one. */
export const SHARE_API_PATH = '/api/w';

/** Custom URL scheme the Mac app registers for deep links (rowalong://w/<id>). */
export const SHARE_DEEP_LINK_SCHEME = 'rowalong';

export const SHARE_FORMAT_VERSION = 1;
export const SHARE_ID_LENGTH = 10; // base64url chars = 60 bits of SHA-256

export const MAX_SHARE_SEGMENTS = 200;
export const MAX_SHARE_NAME_LENGTH = 80; // characters (code points)
export const MAX_SHARE_LABEL_LENGTH = 40; // characters (code points)
export const MAX_SHARE_TOTAL_SEC = 6 * 60 * 60;
/** Cap on a request body and on the stored canonical form, in UTF-8 bytes. */
export const MAX_SHARE_BYTES = 32 * 1024;

const STEP_SEC = 5;

export interface SharedSegment {
  intensity: Intensity;
  durationSec: number;
  label?: string;
}

/** What a share link points at: no ids, nothing machine-local. */
export interface SharedWorkout {
  version: typeof SHARE_FORMAT_VERSION;
  name: string;
  segments: SharedSegment[];
}

export type ShareValidation = { ok: true; workout: SharedWorkout } | { ok: false; error: string };

const fail = (error: string): ShareValidation => ({ ok: false, error });

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isIntensity = (v: unknown): v is Intensity =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(INTENSITY_META, v);

// C0 and C1 controls (newlines, tabs, NUL, ...): names and labels are one line.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;
// A surrogate half without its partner; TextEncoder would silently turn it into
// U+FFFD, so two different names could hash to the same id.
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

const charLength = (s: string) => Array.from(s).length;

const utf8 = new TextEncoder();
export const utf8ByteLength = (s: string): number => utf8.encode(s).length;

/** Check a trimmed one-line string; returns an error suffix or null. */
function textProblem(s: string, max: number): string | null {
  if (CONTROL_CHARS.test(s)) return "can't contain line breaks or control characters";
  if (LONE_SURROGATE.test(s)) return 'contains invalid characters';
  if (charLength(s) > max) return `is longer than ${max} characters`;
  return null;
}

/** Strictly check an untrusted payload. On success returns a normalized copy
 *  holding only the known fields (name and labels trimmed, empty labels dropped,
 *  ids and unknown keys left out); that copy is what gets hashed and stored. */
export function validateSharedWorkout(input: unknown): ShareValidation {
  if (!isRecord(input)) return fail('Not a workout');
  if (input.version !== SHARE_FORMAT_VERSION) return fail('Unsupported share format version');

  if (typeof input.name !== 'string') return fail('Workout name is missing');
  const name = input.name.trim();
  if (!name) return fail('Workout name is missing');
  const nameProblem = textProblem(name, MAX_SHARE_NAME_LENGTH);
  if (nameProblem) return fail(`Workout name ${nameProblem}`);

  const raw = input.segments;
  if (!Array.isArray(raw)) return fail('Workout segments must be a list');
  if (raw.length === 0) return fail('Workout has no segments');
  if (raw.length > MAX_SHARE_SEGMENTS)
    return fail(`Workout has more than ${MAX_SHARE_SEGMENTS} segments`);

  const segments: SharedSegment[] = [];
  let totalSec = 0;
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    const at = `Segment ${i + 1}`;
    if (!isRecord(s)) return fail(`${at} is not a segment`);
    if (!isIntensity(s.intensity)) return fail(`${at} has an unknown intensity`);
    const d = s.durationSec;
    if (typeof d !== 'number' || !Number.isSafeInteger(d) || d <= 0 || d % STEP_SEC !== 0)
      return fail(`${at} duration must be a positive multiple of ${STEP_SEC} seconds`);
    totalSec += d;
    if (totalSec > MAX_SHARE_TOTAL_SEC)
      return fail(`Workout is longer than ${MAX_SHARE_TOTAL_SEC / 3600} hours`);

    const seg: SharedSegment = { intensity: s.intensity, durationSec: d };
    if (s.label !== undefined) {
      if (typeof s.label !== 'string') return fail(`${at} label must be text`);
      const label = s.label.trim();
      const labelProblem = textProblem(label, MAX_SHARE_LABEL_LENGTH);
      if (labelProblem) return fail(`${at} label ${labelProblem}`);
      if (label) seg.label = label;
    }
    segments.push(seg);
  }

  const workout: SharedWorkout = { version: SHARE_FORMAT_VERSION, name, segments };
  if (utf8ByteLength(serializeSharedWorkout(workout)) > MAX_SHARE_BYTES)
    return fail('Workout is too large to share');
  return { ok: true, workout };
}

/** Size-check, parse and validate a JSON body (a POST body, or a fetched payload). */
export function parseSharedWorkout(json: string): ShareValidation {
  if (utf8ByteLength(json) > MAX_SHARE_BYTES) return fail('Workout is too large to share');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail('Not valid JSON');
  }
  return validateSharedWorkout(parsed);
}

/** The canonical form: compact JSON with a fixed key order and no absent
 *  labels. It is both what the id hashes and what the Worker stores. */
export function serializeSharedWorkout(w: SharedWorkout): string {
  return JSON.stringify({
    version: w.version,
    name: w.name,
    segments: w.segments.map((s) =>
      s.label === undefined
        ? { intensity: s.intensity, durationSec: s.durationSec }
        : { intensity: s.intensity, durationSec: s.durationSec, label: s.label },
    ),
  });
}

/** Content-hashed id: the first SHARE_ID_LENGTH base64url chars of the SHA-256
 *  of the canonical form. Same workout, same id. Pass a validated workout. */
export async function shareIdFor(w: SharedWorkout): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(serializeSharedWorkout(w)));
  let bin = '';
  for (const b of new Uint8Array(digest)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').slice(0, SHARE_ID_LENGTH);
}

const SHARE_ID = new RegExp(`^[A-Za-z0-9_-]{${SHARE_ID_LENGTH}}$`);

export const isShareId = (s: string): boolean => SHARE_ID.test(s);

/** The web link: `<base>/w/<id>`, the preview page. */
export const shareUrlFor = (id: string, base: string = SHARE_BASE_URL): string => `${base}/w/${id}`;

/** The deep link the Mac app opens: `rowalong://w/<id>`. */
export const deepLinkFor = (id: string): string => `${SHARE_DEEP_LINK_SCHEME}://w/${id}`;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Pull the share id out of a web link on `base`, a rowalong:// deep link, or a
 *  bare id. Trailing slash, query and hash are ignored; anything else -> null. */
export function parseShareLink(input: string, base: string = SHARE_BASE_URL): string | null {
  const s = input.trim();
  if (isShareId(s)) return s;

  let url: URL;
  try {
    // A pasted link often loses its scheme: treat "host/w/<id>" as https.
    url = new URL(HAS_SCHEME.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }

  if (url.protocol === `${SHARE_DEEP_LINK_SCHEME}:`) {
    // rowalong://w/<id> parses with host "w"; rowalong:///w/<id> with an empty host.
    const path = `${url.host}${url.pathname}`.replace(/^\/+/, '');
    const m = /^w\/([^/]+)\/?$/i.exec(path);
    return m && isShareId(m[1]) ? m[1] : null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return null;
  }
  // Scheme may differ (http vs https); the host and port must match.
  if (url.host !== baseUrl.host) return null;
  const m = /^\/w\/([^/]+)\/?$/.exec(url.pathname);
  return m && isShareId(m[1]) ? m[1] : null;
}

/** App -> payload: drop ids, keep intensity, duration and any label. */
export function toSharedWorkout(name: string, segments: readonly Segment[]): SharedWorkout {
  return {
    version: SHARE_FORMAT_VERSION,
    name,
    segments: segments.map((s) =>
      s.label === undefined
        ? { intensity: s.intensity, durationSec: s.durationSec }
        : { intensity: s.intensity, durationSec: s.durationSec, label: s.label },
    ),
  };
}

/** Payload -> app: a Template under the sharer's name, with a fresh template id
 *  and fresh segment ids (ids are never shared; they're re-made on every load). */
export function fromSharedWorkout(w: SharedWorkout): Template {
  return {
    id: makeId(),
    name: w.name,
    segments: w.segments.map((s) => {
      const seg: Segment = { id: makeId(), intensity: s.intensity, durationSec: s.durationSec };
      if (s.label !== undefined) seg.label = s.label;
      return seg;
    }),
  };
}
