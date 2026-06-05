import { Intensity, Segment } from './types';
import { createRng } from './random';

export interface GeneratorOptions {
  warmupCapSec?: number; // max warmup length, default 180
  cooldownCapSec?: number; // max cooldown budget, default 150
  minPushSec?: number; // default 20
  maxPushSec?: number; // default 150
}

// Every emitted duration is a whole multiple of STEP seconds. The algorithm runs
// in STEP-second "units" and multiplies by STEP at segment creation: since the
// total (whole minutes), warmup, and every push/rest are whole units, the folded
// cooldown is a whole unit too and the total stays exact.
const STEP = 5;

export function generate(
  totalMin: number,
  options: GeneratorOptions = {},
  seed = 1,
): Segment[] {
  const toUnits = (sec: number) => Math.round(sec / STEP);
  const warmupCapU = toUnits(options.warmupCapSec ?? 180);
  const cooldownCapU = toUnits(options.cooldownCapSec ?? 150);
  const minPushU = Math.max(1, toUnits(options.minPushSec ?? 20));
  const maxPushU = Math.max(minPushU, toUnits(options.maxPushSec ?? 150));
  const rng = createRng(seed);

  const totalU = toUnits(Math.round(totalMin * 60));
  // Smallest push + its smallest legal rest (0.5×).
  const minBlockU = minPushU + Math.ceil(minPushU * 0.5);

  let warmupU = Math.min(warmupCapU, Math.round(totalU * 0.15));
  let cooldownBudgetU = Math.min(cooldownCapU, Math.round(totalU * 0.15));
  let middleU = totalU - warmupU - cooldownBudgetU;

  // Make room for at least one block: shrink cooldown, then warmup.
  if (middleU < minBlockU) {
    cooldownBudgetU = 0;
    middleU = totalU - warmupU;
    if (middleU < minBlockU) {
      warmupU = Math.max(0, totalU - minBlockU);
      middleU = totalU - warmupU;
    }
  }

  let idx = 0;
  const seg = (intensity: Intensity, durationU: number): Segment => ({
    id: `seg-${seed}-${idx++}`,
    intensity,
    durationSec: durationU * STEP,
  });

  const segments: Segment[] = [];
  if (warmupU > 0) segments.push(seg('easy', warmupU));

  let remainingU = middleU;
  let pushCount = 0;
  while (remainingU >= minBlockU) {
    // Every third push is all-out → all-out is less frequent than hard.
    const intensity: Intensity = pushCount % 3 === 2 ? 'allout' : 'hard';

    // Push must leave room for at least a 0.5× rest: push * 1.5 <= remaining.
    const pushCeilU = Math.min(maxPushU, Math.floor(remainingU / 1.5));
    const pushU = rng.int(minPushU, Math.max(minPushU, pushCeilU));

    const restLoU = Math.ceil(pushU * 0.5);
    const restHiU = Math.min(pushU, remainingU - pushU);
    // all-out leans toward fuller recovery (~1×); hard toward the lower end (~0.5×).
    const biasU = Math.round(pushU * 0.75);
    const loU = intensity === 'allout' ? Math.max(restLoU, biasU) : restLoU;
    const hiU =
      intensity === 'allout' ? restHiU : Math.min(restHiU, Math.max(restLoU, biasU));
    let restU = rng.int(Math.min(loU, hiU), Math.max(loU, hiU));
    if (restU < restLoU) restU = restLoU;
    if (restU > restHiU) restU = restHiU;

    const restIntensity: Intensity = intensity === 'allout' ? 'easy' : 'medium';

    segments.push(seg(intensity, pushU));
    remainingU -= pushU;
    segments.push(seg(restIntensity, restU));
    remainingU -= restU;
    pushCount++;
  }

  // Fold the cooldown budget plus any leftover into a final easy segment, so the
  // total stays exact and no rest is shorter than 0.5× its push.
  const cooldownU = cooldownBudgetU + remainingU;
  if (cooldownU > 0) segments.push(seg('easy', cooldownU));

  return segments;
}
