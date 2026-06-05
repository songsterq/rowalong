import { describe, it, expect } from 'vitest';
import { generate, snapMinutes, SUPPORTED_MINUTES } from '../src/core/generator';
import { INTENSITY_META } from '../src/core/types';

const total = (segs: { durationSec: number }[]) =>
  segs.reduce((s, x) => s + x.durationSec, 0);

describe('snapMinutes', () => {
  it('passes the three supported durations through unchanged', () => {
    expect(SUPPORTED_MINUTES).toEqual([10, 20, 30]);
    for (const m of SUPPORTED_MINUTES) expect(snapMinutes(m)).toBe(m);
  });

  it('snaps to the nearest supported, ties rounding up, clamped to 10..30', () => {
    expect(snapMinutes(2)).toBe(10);
    expect(snapMinutes(14)).toBe(10);
    expect(snapMinutes(15)).toBe(20); // tie -> up
    expect(snapMinutes(25)).toBe(30); // tie -> up
    expect(snapMinutes(40)).toBe(30);
  });
});

describe('generate — structure', () => {
  it('totals 600 / 1200 / 1800 for 10 / 20 / 30 minutes', () => {
    expect(total(generate(10, {}, 1))).toBe(600);
    expect(total(generate(20, {}, 1))).toBe(1200);
    expect(total(generate(30, {}, 1))).toBe(1800);
  });

  it('starts with a 60s easy + 60s medium warm-up', () => {
    const segs = generate(20, {}, 1);
    expect(segs[0]).toMatchObject({ intensity: 'easy', durationSec: 60 });
    expect(segs[1]).toMatchObject({ intensity: 'medium', durationSec: 60 });
  });

  it('ends with a 60s easy cool-down', () => {
    const segs = generate(30, {}, 1);
    const last = segs[segs.length - 1];
    expect(last).toMatchObject({ intensity: 'easy', durationSec: 60 });
  });

  it('forces a known style so push regions each total 420s', () => {
    // crazy = one 420s hard block per push; warm-up(120) + N*420 + (N-1)*180 + cool(60)
    expect(total(generate(10, { pushStyle: 'crazy' }, 1))).toBe(600);
    expect(total(generate(20, { pushStyle: 'crazy' }, 1))).toBe(1200);
    expect(total(generate(30, { pushStyle: 'crazy' }, 1))).toBe(1800);

    const hard = generate(30, { pushStyle: 'crazy' }, 1).filter((s) => s.intensity === 'hard');
    expect(hard).toHaveLength(3); // exactly one 420s hard push each
    expect(hard.every((s) => s.durationSec === 420)).toBe(true);
  });

  it('inserts a recovery bridge (medium ceiling) between pushes only', () => {
    // 20 min has exactly one bridge: medium 60 + easy 120 between the two pushes.
    const segs = generate(20, { pushStyle: 'crazy' }, 1);
    // crazy layout: easy60, medium60, [hard420], medium60, easy120, [hard420], easy60
    expect(segs.map((s) => `${s.intensity}:${s.durationSec}`)).toEqual([
      'easy:60',
      'medium:60',
      'hard:420',
      'medium:60',
      'easy:120',
      'hard:420',
      'easy:60',
    ]);
  });

  it('repeats the same style for every push (steps build appears once per push)', () => {
    const segs = generate(30, { pushStyle: 'steps' }, 1);
    // steps pushes start with a 20s medium build; 3 pushes -> 3 such builds,
    // plus 2 bridges that start with a 60s medium. No other 20s mediums exist.
    const medium20 = segs.filter((s) => s.intensity === 'medium' && s.durationSec === 20);
    expect(medium20).toHaveLength(3);
  });

  it('assigns deterministic ids and is reproducible per seed', () => {
    expect(generate(20, {}, 7)).toEqual(generate(20, {}, 7));
    expect(generate(20, {}, 7)[0].id).toBe('seg-7-0');
  });

  it('varies across seeds', () => {
    const outs = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(generate(20, {}, s)));
    expect(new Set(outs).size).toBeGreaterThan(1);
  });

  it('snaps unsupported totals before generating', () => {
    expect(total(generate(2, {}, 1))).toBe(600); // -> 10 min
    expect(total(generate(25, {}, 1))).toBe(1800); // tie -> 30 min
  });

  it('makes every segment duration a multiple of 5 seconds', () => {
    for (const min of [10, 20, 30]) {
      for (let seed = 1; seed <= 6; seed++) {
        for (const s of generate(min, {}, seed)) {
          expect(s.durationSec % 5).toBe(0);
        }
      }
    }
  });

  it('keeps bridge work intensities out — bridges contain only easy/medium', () => {
    // For any style, the two segments before/after a bridge-easy(120) come from pushes;
    // assert the bridge pair itself is medium then easy.
    const segs = generate(20, { pushStyle: 'long' }, 1);
    const idx = segs.findIndex((s) => s.intensity === 'easy' && s.durationSec === 120);
    expect(idx).toBeGreaterThan(-1);
    expect(segs[idx - 1]).toMatchObject({ intensity: 'medium', durationSec: 60 });
    expect(INTENSITY_META[segs[idx].intensity].kind).toBe('rest');
  });
});
