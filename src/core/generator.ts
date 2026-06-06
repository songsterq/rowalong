import { Segment } from './types';
import { createRng } from './random';
import { Block, PushStyle, PUSH_STYLES, buildPush } from './pushStyles';

export interface GeneratorOptions {
  /** Force a specific push style; default is a seeded random pick. */
  pushStyle?: PushStyle;
}

/** The only supported workout lengths (minutes). */
export const SUPPORTED_MINUTES = [10, 20, 30] as const;

/** Snap any requested length to the nearest supported value (ties round up). */
export function snapMinutes(totalMin: number): number {
  if (!Number.isFinite(totalMin)) return 10;
  const clamped = Math.min(30, Math.max(10, totalMin));
  return Math.round(clamped / 10) * 10;
}

// Fixed skeleton blocks. Warm-up easy->medium; cool-down easy; bridge is a recovery
// block whose ceiling is medium, ending on easy so it flows into the next push.
const WARMUP: Block[] = [
  { intensity: 'easy', durationSec: 60 },
  { intensity: 'medium', durationSec: 60 },
];
const COOLDOWN: Block[] = [{ intensity: 'easy', durationSec: 60 }];
const BRIDGE: Block[] = [
  { intensity: 'medium', durationSec: 60 },
  { intensity: 'easy', durationSec: 120 },
];

export function generate(
  totalMin: number,
  options: GeneratorOptions = {},
  seed = 1,
): Segment[] {
  const minutes = snapMinutes(totalMin);
  const pushCount = minutes / 10; // 1, 2, or 3
  const rng = createRng(seed);
  const style = options.pushStyle ?? rng.pick(PUSH_STYLES);

  // Same style is repeated for every push: build it once and reuse it.
  const push = buildPush(style, rng);

  const blocks: Block[] = [...WARMUP];
  for (let i = 0; i < pushCount; i++) {
    if (i > 0) blocks.push(...BRIDGE);
    blocks.push(...push);
  }
  blocks.push(...COOLDOWN);

  let idx = 0;
  return blocks.map((b) => ({
    id: `seg-${seed}-${idx++}`,
    intensity: b.intensity,
    durationSec: b.durationSec,
  }));
}
