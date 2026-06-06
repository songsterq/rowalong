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

const STEP = 5;

// Seeded random push: fill the 420s budget with hard/allout work blocks (all-out is
// every third, so less frequent than hard) and medium/easy rests (medium after hard,
// easy after all-out). Work blocks are 20-150s; each rest is 0.5-1x its work. Runs in
// 5-second units so every duration is a multiple of 5; the < one-block remainder is
// left for prependBuild to turn into the leading medium build.
function randomBlocks(rng: Rng): Block[] {
  const toU = (sec: number) => Math.round(sec / STEP);
  const minWorkU = toU(20); // 4
  const maxWorkU = toU(150); // 30
  const minBlockU = minWorkU + Math.ceil(minWorkU * 0.5); // smallest work + its 0.5x rest

  let remainingU = toU(PUSH_SEC);
  const out: Block[] = [];
  let workCount = 0;
  while (remainingU >= minBlockU) {
    const intensity: Intensity = workCount % 3 === 2 ? 'allout' : 'hard';
    // Leave room for at least a 0.5x rest: work * 1.5 <= remaining.
    const workCeilU = Math.min(maxWorkU, Math.floor(remainingU / 1.5));
    const workU = rng.int(minWorkU, Math.max(minWorkU, workCeilU));

    const restLoU = Math.ceil(workU * 0.5);
    const restHiU = Math.min(workU, remainingU - workU);
    const restU = rng.int(restLoU, restHiU);
    const restIntensity: Intensity = intensity === 'allout' ? 'easy' : 'medium';

    out.push({ intensity, durationSec: workU * STEP });
    remainingU -= workU;
    out.push({ intensity: restIntensity, durationSec: restU * STEP });
    remainingU -= restU;
    workCount++;
  }
  return out;
}

export function buildPush(style: PushStyle, rng: Rng): Block[] {
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
      return prependBuild(randomBlocks(rng));
  }
}
