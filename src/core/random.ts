export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [minInclusive, maxInclusive]. */
  int(minInclusive: number, maxInclusive: number): number;
  /** A random element of the array. */
  pick<T>(arr: T[]): T;
}

/** mulberry32 — a tiny, fast, seedable PRNG. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
