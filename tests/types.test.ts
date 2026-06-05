import { describe, it, expect } from 'vitest';
import { INTENSITY_META, makeId, type Intensity } from '../src/core/types';

describe('INTENSITY_META', () => {
  const all: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

  it('has an entry for every intensity', () => {
    for (const i of all) expect(INTENSITY_META[i]).toBeDefined();
  });

  it('maps the recommended stroke rates from the spec', () => {
    expect(INTENSITY_META.easy.spmLabel).toBe('24');
    expect(INTENSITY_META.medium.spmLabel).toBe('26');
    expect(INTENSITY_META.hard.spmLabel).toBe('28');
    expect(INTENSITY_META.allout.spmLabel).toBe('30–32');
  });

  it('classifies easy/medium as rest and hard/allout as work', () => {
    expect(INTENSITY_META.easy.kind).toBe('rest');
    expect(INTENSITY_META.medium.kind).toBe('rest');
    expect(INTENSITY_META.hard.kind).toBe('work');
    expect(INTENSITY_META.allout.kind).toBe('work');
  });
});

describe('makeId', () => {
  it('returns unique strings', () => {
    expect(makeId()).not.toBe(makeId());
  });
});
