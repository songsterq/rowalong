import { describe, it, expect } from 'vitest';
import { createRng } from '../src/core/random';

describe('createRng', () => {
  it('is deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = [a.next(), a.next(), a.next()];
    const seqB = [b.next(), b.next(), b.next()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1).next();
    const b = createRng(2).next();
    expect(a).not.toBe(b);
  });

  it('next() stays within [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) stays within the inclusive range', () => {
    const r = createRng(99);
    for (let i = 0; i < 100; i++) {
      const v = r.int(3, 8);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(8);
    }
  });

  it('pick() returns an element of the array', () => {
    const r = createRng(5);
    const arr = ['a', 'b', 'c'];
    expect(arr).toContain(r.pick(arr));
  });
});
