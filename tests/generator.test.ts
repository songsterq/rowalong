import { describe, it, expect } from 'vitest';
import { generate } from '../src/core/generator';
import { INTENSITY_META } from '../src/core/types';

const total = (segs: { durationSec: number }[]) =>
  segs.reduce((s, x) => s + x.durationSec, 0);

describe('generate', () => {
  it('produces a sequence whose total equals the requested time', () => {
    const segs = generate(20, {}, 1);
    expect(total(segs)).toBe(20 * 60);
  });

  it('starts with an easy warmup and ends with an easy cooldown', () => {
    const segs = generate(30, {}, 1);
    expect(segs[0].intensity).toBe('easy');
    expect(segs[segs.length - 1].intensity).toBe('easy');
  });

  it('includes at least one hard and one all-out push for a long session', () => {
    const segs = generate(30, {}, 1);
    expect(segs.some((s) => s.intensity === 'hard')).toBe(true);
    expect(segs.some((s) => s.intensity === 'allout')).toBe(true);
  });

  it('keeps every push within 20–150 seconds', () => {
    const segs = generate(40, {}, 3);
    for (const s of segs) {
      if (INTENSITY_META[s.intensity].kind === 'work') {
        expect(s.durationSec).toBeGreaterThanOrEqual(20);
        expect(s.durationSec).toBeLessThanOrEqual(150);
      }
    }
  });

  it('makes all-out less frequent than hard', () => {
    const segs = generate(40, {}, 3);
    const hard = segs.filter((s) => s.intensity === 'hard').length;
    const allout = segs.filter((s) => s.intensity === 'allout').length;
    expect(hard).toBeGreaterThanOrEqual(allout);
  });

  it('makes each rest 0.5–1× its preceding push', () => {
    const segs = generate(40, {}, 3);
    for (let i = 0; i < segs.length - 1; i++) {
      const cur = segs[i];
      const nxt = segs[i + 1];
      const curIsPush = INTENSITY_META[cur.intensity].kind === 'work';
      const nxtIsRest = INTENSITY_META[nxt.intensity].kind === 'rest';
      // a rest that directly follows a push (exclude the final cooldown, which can absorb leftover)
      if (curIsPush && nxtIsRest && i + 1 < segs.length - 1) {
        expect(nxt.durationSec).toBeGreaterThanOrEqual(Math.ceil(cur.durationSec * 0.5));
        expect(nxt.durationSec).toBeLessThanOrEqual(cur.durationSec);
      }
    }
  });

  it('is deterministic for a given seed and varies across seeds', () => {
    expect(generate(20, {}, 7)).toEqual(generate(20, {}, 7));
    expect(generate(20, {}, 7)).not.toEqual(generate(20, {}, 8));
  });

  it('does not crash and stays exact for very short totals', () => {
    const segs = generate(2, {}, 1);
    expect(total(segs)).toBe(2 * 60);
    expect(segs.length).toBeGreaterThan(0);
  });
});
