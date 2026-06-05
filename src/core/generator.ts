import { Intensity, Segment } from './types';
import { createRng } from './random';

export interface GeneratorOptions {
  warmupCapSec?: number; // max warmup length, default 180
  cooldownCapSec?: number; // max cooldown budget, default 150
  minPushSec?: number; // default 20
  maxPushSec?: number; // default 150
}

export function generate(
  totalMin: number,
  options: GeneratorOptions = {},
  seed = 1,
): Segment[] {
  const warmupCap = options.warmupCapSec ?? 180;
  const cooldownCap = options.cooldownCapSec ?? 150;
  const minPush = options.minPushSec ?? 20;
  const maxPush = options.maxPushSec ?? 150;
  const rng = createRng(seed);

  const totalSec = Math.round(totalMin * 60);
  // Smallest push + its smallest legal rest (0.5×).
  const minBlock = minPush + Math.ceil(minPush * 0.5);

  let warmup = Math.min(warmupCap, Math.round(totalSec * 0.15));
  let cooldownBudget = Math.min(cooldownCap, Math.round(totalSec * 0.15));
  let middle = totalSec - warmup - cooldownBudget;

  // Make room for at least one block: shrink cooldown, then warmup.
  if (middle < minBlock) {
    cooldownBudget = 0;
    middle = totalSec - warmup;
    if (middle < minBlock) {
      warmup = Math.max(0, totalSec - minBlock);
      middle = totalSec - warmup;
    }
  }

  let idx = 0;
  const seg = (intensity: Intensity, durationSec: number): Segment => ({
    id: `seg-${seed}-${idx++}`,
    intensity,
    durationSec,
  });

  const segments: Segment[] = [];
  if (warmup > 0) segments.push(seg('easy', warmup));

  let remaining = middle;
  let pushCount = 0;
  while (remaining >= minBlock) {
    // Every third push is all-out → all-out is less frequent than hard.
    const intensity: Intensity = pushCount % 3 === 2 ? 'allout' : 'hard';

    // Push must leave room for at least a 0.5× rest: push * 1.5 <= remaining.
    const pushCeil = Math.min(maxPush, Math.floor(remaining / 1.5));
    const pushDur = rng.int(minPush, Math.max(minPush, pushCeil));

    const restLo = Math.ceil(pushDur * 0.5);
    const restHi = Math.min(pushDur, remaining - pushDur);
    // all-out leans toward fuller recovery (~1×); hard toward the lower end (~0.5×).
    const bias = Math.round(pushDur * 0.75);
    const lo = intensity === 'allout' ? Math.max(restLo, bias) : restLo;
    const hi = intensity === 'allout' ? restHi : Math.min(restHi, Math.max(restLo, bias));
    let restDur = rng.int(Math.min(lo, hi), Math.max(lo, hi));
    if (restDur < restLo) restDur = restLo;
    if (restDur > restHi) restDur = restHi;

    const restIntensity: Intensity = intensity === 'allout' ? 'easy' : 'medium';

    segments.push(seg(intensity, pushDur));
    remaining -= pushDur;
    segments.push(seg(restIntensity, restDur));
    remaining -= restDur;
    pushCount++;
  }

  // Fold the cooldown budget plus any leftover into a final easy segment, so the
  // total is exact and no rest is shorter than 0.5× its push.
  const cooldown = cooldownBudget + remaining;
  if (cooldown > 0) segments.push(seg('easy', cooldown));

  return segments;
}
