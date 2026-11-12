import { Intensity, Segment } from './types';

/** Portable, shareable description of a workout. Runtime segment ids are left
 *  out on purpose: every consumer re-ids segments on load, so they would only
 *  add noise to a file meant to be read, diffed and passed around. */
export const WORKOUT_SPEC_FORMAT = 'rowalong.workout';
export const WORKOUT_SPEC_VERSION = 1;

export interface WorkoutSpecSegment {
  intensity: Intensity;
  durationSec: number;
  label?: string;
}

export interface WorkoutSpec {
  format: typeof WORKOUT_SPEC_FORMAT;
  version: typeof WORKOUT_SPEC_VERSION;
  name: string;
  totalSec: number; // informational; the segments are the source of truth
  segments: WorkoutSpecSegment[];
}

export function toWorkoutSpec(name: string, segments: Segment[]): WorkoutSpec {
  return {
    format: WORKOUT_SPEC_FORMAT,
    version: WORKOUT_SPEC_VERSION,
    name: name.trim() || 'Untitled',
    totalSec: segments.reduce((sum, s) => sum + s.durationSec, 0),
    segments: segments.map(({ intensity, durationSec, label }) =>
      label === undefined ? { intensity, durationSec } : { intensity, durationSec, label },
    ),
  };
}

export function serializeWorkoutSpec(spec: WorkoutSpec): string {
  return JSON.stringify(spec, null, 2) + '\n';
}

/** 'Quick 20' → 'quick-20.rowalong.json'. Anything outside [a-z0-9] collapses
 *  to one hyphen so the name is safe on every filesystem. */
export function specFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'workout'}.rowalong.json`;
}
