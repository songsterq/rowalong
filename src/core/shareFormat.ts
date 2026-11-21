import { INTENSITY_META, makeId, type Intensity, type Segment } from './types';

/** The share payload's format tag; anything else is not a RowAlong workout. */
export const SHARE_FORMAT = 'rowalong-workout';
/** The payload version this build writes, and the only one it reads. */
export const SHARE_VERSION = 1;

/** Caps on what parseWorkout accepts. Durations follow the app's 5-second-unit
 *  convention (see generator.ts): a multiple of 5 s, from 5 s to an hour. */
export const SHARE_LIMITS = {
  maxNameLength: 80, // characters (code points), so an emoji counts as one
  minSegments: 1,
  maxSegments: 200,
  minDurationSec: 5,
  maxDurationSec: 3600,
  durationStepSec: 5,
  maxInputBytes: 100 * 1024, // input of this many UTF-8 bytes or more is rejected
} as const;

/** One segment as it travels in a share payload: no id, which is local to a
 *  machine's storage and re-issued on import. */
export interface SharedSegment {
  intensity: Intensity;
  durationSec: number;
  label?: string;
}

/** The JSON document exportWorkout writes and parseWorkout reads. */
export interface WorkoutPayload {
  format: typeof SHARE_FORMAT;
  version: typeof SHARE_VERSION;
  name: string;
  segments: SharedSegment[];
}

/** A successfully imported workout, ready to load into the builder. */
export interface SharedWorkout {
  name: string;
  segments: Segment[];
}

export type ParseWorkoutResult =
  | { ok: true; workout: SharedWorkout }
  | { ok: false; error: string };

const INTENSITIES = Object.keys(INTENSITY_META) as Intensity[];

/**
 * Serialises a workout as a pretty-printed share payload. Segment ids are
 * dropped, and so is any property a segment carries beyond intensity,
 * durationSec and label.
 *
 * It does not enforce SHARE_LIMITS: it writes what it is given. A caller that
 * needs to know the result will import can run it through parseWorkout.
 */
export function exportWorkout(name: string, segments: readonly Segment[]): string {
  const payload: WorkoutPayload = {
    format: SHARE_FORMAT,
    version: SHARE_VERSION,
    name,
    segments: segments.map(({ intensity, durationSec, label }) =>
      label === undefined ? { intensity, durationSec } : { intensity, durationSec, label },
    ),
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Reads a share payload from a file's or the clipboard's text. Validation is
 * all-or-nothing: any bad field rejects the whole input with a message fit to
 * show the user. Unknown extra fields are ignored. On success every segment
 * gets a fresh id from newId; ids in the input are never used.
 *
 * Names and labels are returned verbatim, HTML included. They are untrusted,
 * so whatever renders them must escape them.
 */
export function parseWorkout(text: string, newId: () => string = makeId): ParseWorkoutResult {
  const fail = (error: string): ParseWorkoutResult => ({ ok: false, error });

  // Size first, so oversized input is never parsed. A UTF-16 code unit is at
  // least one UTF-8 byte, so the length check is a cheap lower bound.
  const { maxInputBytes } = SHARE_LIMITS;
  if (text.length >= maxInputBytes || new TextEncoder().encode(text).length >= maxInputBytes) {
    return fail('This is too large to be a workout: it must be under 100 KB.');
  }

  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return fail('This is not valid JSON, so it can’t be a RowAlong workout.');
  }

  if (!isPlainObject(data) || data.format !== SHARE_FORMAT) {
    return fail('This is not a RowAlong workout.');
  }

  const { version } = data;
  if (version !== SHARE_VERSION) {
    if (typeof version === 'number' && Number.isInteger(version) && version > SHARE_VERSION) {
      return fail(
        `This workout uses format version ${version}, from a newer RowAlong. ` +
          `This version reads version ${SHARE_VERSION}.`,
      );
    }
    return fail('This workout’s format version is missing or not one RowAlong can read.');
  }

  const { name } = data;
  if (typeof name !== 'string') return fail('The workout’s name is missing or not text.');
  if (Array.from(name).length > SHARE_LIMITS.maxNameLength) {
    return fail(`The workout’s name is longer than ${SHARE_LIMITS.maxNameLength} characters.`);
  }

  const { segments: raw } = data;
  if (!Array.isArray(raw)) return fail('The workout’s segments are missing or not a list.');
  const { minSegments, maxSegments } = SHARE_LIMITS;
  if (raw.length < minSegments || raw.length > maxSegments) {
    return fail(
      `A workout needs between ${minSegments} and ${maxSegments} segments; this one has ${raw.length}.`,
    );
  }

  const segments: Segment[] = [];
  for (let i = 0; i < raw.length; i++) {
    const read = readSegment(raw[i], `Segment ${i + 1}`);
    if (typeof read === 'string') return fail(read);
    segments.push({ id: newId(), ...read });
  }

  return { ok: true, workout: { name, segments } };
}

/** Validates one payload segment; returns it, or an error message. */
function readSegment(value: unknown, where: string): SharedSegment | string {
  if (!isPlainObject(value)) return `${where} is not a valid segment.`;

  const { intensity, durationSec, label } = value;
  if (typeof intensity !== 'string' || !(INTENSITIES as string[]).includes(intensity)) {
    const shown = typeof intensity === 'string' ? `“${intensity.slice(0, 20)}”` : 'missing';
    return `${where} has an unknown intensity (${shown}); use ${INTENSITIES.join(', ')}.`;
  }

  const { minDurationSec: min, maxDurationSec: max, durationStepSec: step } = SHARE_LIMITS;
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec)) {
    return `${where}’s duration is missing or not a number.`;
  }
  if (!Number.isInteger(durationSec) || durationSec % step !== 0) {
    return `${where}’s duration (${durationSec} s) must be a multiple of ${step} seconds.`;
  }
  if (durationSec < min || durationSec > max) {
    return `${where}’s duration (${durationSec} s) must be between ${min} and ${max} seconds.`;
  }

  if (label === undefined) return { intensity: intensity as Intensity, durationSec };
  if (typeof label !== 'string') return `${where}’s label is not text.`;
  return { intensity: intensity as Intensity, durationSec, label };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
