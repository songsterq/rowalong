import { INTENSITY_META, Intensity, Segment, makeId } from './types';

export const SHARE_FORMAT = 'rowalong-workout';
export const SHARE_VERSION = 1;

/** Validation caps. Durations follow the app-wide 5-second-unit convention
 *  (generator.ts, pushStyles.ts, the segment editor's step). */
export const DURATION_STEP_SEC = 5;
export const MIN_DURATION_SEC = 5;
export const MAX_DURATION_SEC = 3600;
export const MIN_SEGMENTS = 1;
export const MAX_SEGMENTS = 200;
export const MAX_NAME_LENGTH = 80; // characters (code points)
export const MAX_INPUT_BYTES = 100 * 1024; // UTF-8 bytes; input this size or larger is refused

/** The share payload: one workout, by value, with no ids. Ids are local to an
 *  install, so an import always mints fresh ones. */
export interface WorkoutPayload {
  format: typeof SHARE_FORMAT;
  version: typeof SHARE_VERSION;
  name: string;
  segments: { intensity: Intensity; durationSec: number; label?: string }[];
}

export interface SharedWorkout {
  name: string;
  segments: Segment[];
}

export type ParseResult = { ok: true; workout: SharedWorkout } | { ok: false; error: string };

const INTENSITIES = Object.keys(INTENSITY_META) as Intensity[];

/** Serialize a workout as pretty-printed JSON, for a .json file or copied text.
 *  It writes what it is given and does not validate: run the result through
 *  parseWorkout to check that it will import. */
export function exportWorkout(name: string, segments: readonly Segment[]): string {
  const payload: WorkoutPayload = {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    name,
    segments: segments.map((s) => ({
      intensity: s.intensity,
      durationSec: s.durationSec,
      ...(typeof s.label === 'string' ? { label: s.label } : {}),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

/** Read a shared workout, all or nothing: any bad field rejects the whole input
 *  with a message for the user. Fields outside the format are ignored.
 *
 *  Messages never quote strings from the input (only numbers), so a crafted file
 *  can't smuggle markup into wherever the message is shown. */
export function parseWorkout(text: string): ParseResult {
  // UTF-16 length never exceeds UTF-8 byte length, so this skips encoding huge input.
  if (text.length >= MAX_INPUT_BYTES || new TextEncoder().encode(text).length >= MAX_INPUT_BYTES) {
    return fail(`This is too large to be a Rowalong workout: it must be under ${MAX_INPUT_BYTES / 1024} KB.`);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("This is not a Rowalong workout: it isn't valid JSON.");
  }

  if (!isObject(data) || data.format !== SHARE_FORMAT) {
    return fail(`This is not a Rowalong workout (it has no "format": "${SHARE_FORMAT}").`);
  }

  const { version } = data;
  if (version !== SHARE_VERSION) {
    if (Number.isInteger(version) && (version as number) > SHARE_VERSION) {
      return fail(
        `This workout uses format version ${version}, from a newer Rowalong. ` +
          `This version reads only version ${SHARE_VERSION}; update Rowalong to import it.`,
      );
    }
    return fail(`This workout has a missing or unsupported format version. Only version ${SHARE_VERSION} is supported.`);
  }

  const { name, segments } = data;
  if (typeof name !== 'string') {
    return fail("The workout's name is missing or isn't text.");
  }
  const nameLength = Array.from(name).length;
  if (nameLength > MAX_NAME_LENGTH) {
    return fail(`The workout's name is too long: ${nameLength} characters, and the limit is ${MAX_NAME_LENGTH}.`);
  }

  if (!Array.isArray(segments)) {
    return fail('The workout has no segment list.');
  }
  if (segments.length < MIN_SEGMENTS || segments.length > MAX_SEGMENTS) {
    return fail(
      `A workout needs ${MIN_SEGMENTS} to ${MAX_SEGMENTS} segments; this one has ${segments.length}.`,
    );
  }

  const out: Segment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const parsed = parseSegment(segments[i], i + 1);
    if (typeof parsed === 'string') return fail(parsed);
    out.push(parsed);
  }

  return { ok: true, workout: { name, segments: out } };
}

/** A segment, or the error message for it. `n` is 1-based, as the user counts. */
function parseSegment(raw: unknown, n: number): Segment | string {
  if (!isObject(raw)) return `Segment ${n} is not a valid segment.`;

  const { intensity, durationSec, label } = raw;
  if (typeof intensity !== 'string' || !(INTENSITIES as string[]).includes(intensity)) {
    return `Segment ${n} has a missing or unknown intensity (expected ${INTENSITIES.join(', ')}).`;
  }
  if (
    typeof durationSec !== 'number' ||
    !Number.isInteger(durationSec) ||
    durationSec % DURATION_STEP_SEC !== 0 ||
    durationSec < MIN_DURATION_SEC ||
    durationSec > MAX_DURATION_SEC
  ) {
    const got = typeof durationSec === 'number' ? ` (${durationSec})` : '';
    return (
      `Segment ${n} has an invalid duration${got}: it must be a multiple of ` +
      `${DURATION_STEP_SEC} seconds from ${MIN_DURATION_SEC} to ${MAX_DURATION_SEC}.`
    );
  }
  if (label !== undefined && typeof label !== 'string') {
    return `Segment ${n} has a label that isn't text.`;
  }

  return {
    id: makeId(),
    intensity: intensity as Intensity,
    durationSec,
    ...(label !== undefined ? { label } : {}),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}
