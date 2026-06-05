import { Intensity } from './types';
import { Rng } from './random';

export type PushStyle = 'long' | 'steps' | 'repeats' | 'crazy' | 'random';

/** Selection pool, in declared order. */
export const PUSH_STYLES: PushStyle[] = ['long', 'steps', 'repeats', 'crazy', 'random'];

/** Every push is exactly 7 minutes. */
export const PUSH_SEC = 420;

/** An intensity + duration with no id (the generator assigns ids on assembly). */
export interface Block {
  intensity: Intensity;
  durationSec: number;
}

// Named styles are fixed canonical patterns summing to <= PUSH_SEC. The build rule
// (prependBuild) tops each up to exactly PUSH_SEC with a leading medium "build".

function longBlocks(): Block[] {
  return [
    { intensity: 'hard', durationSec: 120 },
    { intensity: 'easy', durationSec: 30 },
    { intensity: 'medium', durationSec: 30 },
    { intensity: 'allout', durationSec: 120 },
    { intensity: 'easy', durationSec: 60 },
  ];
}

function stepsBlocks(): Block[] {
  const out: Block[] = [];
  for (const d of [20, 40, 60, 80]) {
    out.push({ intensity: 'allout', durationSec: d });
    out.push({ intensity: 'easy', durationSec: d });
  }
  return out;
}

function repeatsBlocks(): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < 10; i++) {
    out.push({ intensity: 'allout', durationSec: 20 });
    out.push({ intensity: 'easy', durationSec: 20 });
  }
  return out;
}

function crazyBlocks(): Block[] {
  return [{ intensity: 'hard', durationSec: PUSH_SEC }];
}

/** Prepend a medium "build" equal to the unfilled remainder so the push is 420s. */
function prependBuild(blocks: Block[]): Block[] {
  const used = blocks.reduce((s, b) => s + b.durationSec, 0);
  const build = PUSH_SEC - used;
  return build > 0 ? [{ intensity: 'medium', durationSec: build }, ...blocks] : blocks;
}

export function buildPush(style: PushStyle, _rng: Rng): Block[] {
  switch (style) {
    case 'long':
      return prependBuild(longBlocks());
    case 'steps':
      return prependBuild(stepsBlocks());
    case 'repeats':
      return prependBuild(repeatsBlocks());
    case 'crazy':
      return prependBuild(crazyBlocks());
    case 'random':
      return prependBuild(crazyBlocks()); // placeholder — replaced in Task 2
  }
}
