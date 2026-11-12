import { describe, it, expect } from 'vitest';
import {
  toWorkoutSpec,
  serializeWorkoutSpec,
  specFileName,
  WORKOUT_SPEC_FORMAT,
  WORKOUT_SPEC_VERSION,
} from '../src/core/workoutSpec';
import type { Segment } from '../src/core/types';

const segs: Segment[] = [
  { id: 'a', intensity: 'easy', durationSec: 120 },
  { id: 'b', intensity: 'allout', durationSec: 30, label: 'Sprint' },
  { id: 'c', intensity: 'medium', durationSec: 60 },
];

describe('toWorkoutSpec', () => {
  it('stamps the format and version', () => {
    const spec = toWorkoutSpec('Quick 20', segs);
    expect(spec.format).toBe(WORKOUT_SPEC_FORMAT);
    expect(spec.format).toBe('rowalong.workout');
    expect(spec.version).toBe(WORKOUT_SPEC_VERSION);
    expect(spec.version).toBe(1);
  });

  it('keeps name and total duration', () => {
    const spec = toWorkoutSpec('Quick 20', segs);
    expect(spec.name).toBe('Quick 20');
    expect(spec.totalSec).toBe(210);
  });

  it('drops runtime ids but keeps intensity, duration and label in order', () => {
    const spec = toWorkoutSpec('x', segs);
    expect(spec.segments).toEqual([
      { intensity: 'easy', durationSec: 120 },
      { intensity: 'allout', durationSec: 30, label: 'Sprint' },
      { intensity: 'medium', durationSec: 60 },
    ]);
    expect(spec.segments.some((s) => 'id' in s)).toBe(false);
  });

  it('falls back to "Untitled" for a blank name', () => {
    expect(toWorkoutSpec('   ', segs).name).toBe('Untitled');
  });

  it('does not alias the input segments', () => {
    const input = segs.map((s) => ({ ...s }));
    const spec = toWorkoutSpec('x', input);
    input[0].durationSec = 999;
    expect(spec.segments[0].durationSec).toBe(120);
  });
});

describe('serializeWorkoutSpec', () => {
  it('produces pretty-printed JSON that round-trips', () => {
    const spec = toWorkoutSpec('Quick 20', segs);
    const text = serializeWorkoutSpec(spec);
    expect(text).toContain('\n  "format": "rowalong.workout"');
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(spec);
  });
});

describe('specFileName', () => {
  it('slugs the name and adds the .rowalong.json extension', () => {
    expect(specFileName('Quick 20')).toBe('quick-20.rowalong.json');
  });

  it('collapses punctuation like the generated "20 min · random" label', () => {
    expect(specFileName('20 min · random')).toBe('20-min-random.rowalong.json');
  });

  it('falls back to "workout" when nothing usable is left', () => {
    expect(specFileName('')).toBe('workout.rowalong.json');
    expect(specFileName('···')).toBe('workout.rowalong.json');
  });
});
