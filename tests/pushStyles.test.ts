import { describe, it, expect } from 'vitest';
import { buildPush, PUSH_SEC, PUSH_STYLES } from '../src/core/pushStyles';
import { createRng } from '../src/core/random';

const total = (blocks: { durationSec: number }[]) =>
  blocks.reduce((s, b) => s + b.durationSec, 0);

describe('buildPush — named styles', () => {
  it('lists exactly the five styles', () => {
    expect(PUSH_STYLES).toEqual(['long', 'steps', 'repeats', 'crazy', 'random']);
  });

  it('every named style sums to exactly 420s', () => {
    for (const style of ['long', 'steps', 'repeats', 'crazy'] as const) {
      expect(total(buildPush(style, createRng(1)))).toBe(PUSH_SEC);
    }
  });

  it('long prepends a 60s medium build then the canonical pattern', () => {
    expect(buildPush('long', createRng(1))).toEqual([
      { intensity: 'medium', durationSec: 60 },
      { intensity: 'hard', durationSec: 120 },
      { intensity: 'easy', durationSec: 30 },
      { intensity: 'medium', durationSec: 30 },
      { intensity: 'allout', durationSec: 120 },
      { intensity: 'easy', durationSec: 60 },
    ]);
  });

  it('steps is an all-out/easy ladder with a 20s medium build', () => {
    expect(buildPush('steps', createRng(1))).toEqual([
      { intensity: 'medium', durationSec: 20 },
      { intensity: 'allout', durationSec: 20 },
      { intensity: 'easy', durationSec: 20 },
      { intensity: 'allout', durationSec: 40 },
      { intensity: 'easy', durationSec: 40 },
      { intensity: 'allout', durationSec: 60 },
      { intensity: 'easy', durationSec: 60 },
      { intensity: 'allout', durationSec: 80 },
      { intensity: 'easy', durationSec: 80 },
    ]);
  });

  it('repeats is ten 20s all-out / 20s easy pairs with a 20s medium build', () => {
    const blocks = buildPush('repeats', createRng(1));
    expect(blocks[0]).toEqual({ intensity: 'medium', durationSec: 20 });
    const pairs = blocks.slice(1);
    expect(pairs).toHaveLength(20);
    for (let i = 0; i < pairs.length; i += 2) {
      expect(pairs[i]).toEqual({ intensity: 'allout', durationSec: 20 });
      expect(pairs[i + 1]).toEqual({ intensity: 'easy', durationSec: 20 });
    }
  });

  it('crazy is a single 420s hard block with no build', () => {
    expect(buildPush('crazy', createRng(1))).toEqual([
      { intensity: 'hard', durationSec: 420 },
    ]);
  });
});
