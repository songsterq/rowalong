# Structured Workout Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the freeform interval generator with a fixed warm-up → pushes/bridges → cool-down skeleton built from recognizable 7-minute push styles, supporting only 10/20/30-minute workouts.

**Architecture:** A new pure `pushStyles.ts` module owns the 7-minute (420s) push builders (4 fixed named styles + a seeded random generator), each returning intensity/duration blocks that sum to exactly 420s with a `medium` "build" prepended to fill any remainder. A rewritten `generator.ts` assembles the fixed skeleton, repeats one seed-chosen push style across all pushes, inserts 3-minute recovery bridges, and assigns deterministic ids. The setup UI swaps its free-form minutes input for a 10/20/30 selector.

**Tech Stack:** Vanilla TypeScript, Vite, Vitest (jsdom), seeded mulberry32 PRNG.

---

## File Structure

- **Create** `src/core/pushStyles.ts` — `PushStyle` type, `PUSH_STYLES`, `Block`, `PUSH_SEC`, named-style builders, seeded `random` push generator, `buildPush(style, rng)`.
- **Create** `tests/pushStyles.test.ts` — unit tests for every style + the build rule.
- **Rewrite** `src/core/generator.ts` — slim `GeneratorOptions`, `SUPPORTED_MINUTES`, `snapMinutes`, skeleton assembly.
- **Rewrite** `tests/generator.test.ts` — new structural assertions.
- **Modify** `src/ui/setupView.ts` — duration `<select>` (10/20/30).
- **Modify** `tests/setupView.test.ts` — assert the selector offers 10/20/30.

---

## Task 1: Push styles module — named styles + build rule

**Files:**
- Create: `src/core/pushStyles.ts`
- Test: `tests/pushStyles.test.ts`

- [ ] **Step 1: Write the failing tests for named styles**

Create `tests/pushStyles.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pushStyles.test.ts`
Expected: FAIL — cannot resolve `../src/core/pushStyles`.

- [ ] **Step 3: Implement the named styles and build rule**

Create `src/core/pushStyles.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pushStyles.test.ts`
Expected: PASS (6 tests). The `random` placeholder is not yet asserted.

- [ ] **Step 5: Commit**

```bash
git add src/core/pushStyles.ts tests/pushStyles.test.ts
git commit -m "feat(core): named push styles with medium-build fill rule"
```

---

## Task 2: Push styles module — seeded random generator

**Files:**
- Modify: `src/core/pushStyles.ts`
- Test: `tests/pushStyles.test.ts`

- [ ] **Step 1: Write the failing tests for the random style**

Add `import { INTENSITY_META } from '../src/core/types';` to the top of
`tests/pushStyles.test.ts` (alongside the other imports), then append this `describe`
block after the existing one:

```ts
describe('buildPush — random style', () => {
  it('sums to exactly 420s', () => {
    for (let seed = 1; seed <= 6; seed++) {
      expect(total(buildPush('random', createRng(seed)))).toBe(PUSH_SEC);
    }
  });

  it('uses only hard/allout work and easy/medium rest', () => {
    const blocks = buildPush('random', createRng(3));
    for (const b of blocks) {
      if (INTENSITY_META[b.intensity].kind === 'work') {
        expect(['hard', 'allout']).toContain(b.intensity);
      } else {
        expect(['easy', 'medium']).toContain(b.intensity);
      }
    }
  });

  it('makes every rest 0.5–1x its preceding work block', () => {
    const blocks = buildPush('random', createRng(5));
    for (let i = 0; i < blocks.length - 1; i++) {
      if (INTENSITY_META[blocks[i].intensity].kind === 'work') {
        const work = blocks[i].durationSec;
        const rest = blocks[i + 1].durationSec;
        expect(rest).toBeGreaterThanOrEqual(Math.ceil(work * 0.5));
        expect(rest).toBeLessThanOrEqual(work);
      }
    }
  });

  it('is deterministic for a fixed seed and varies across seeds', () => {
    expect(buildPush('random', createRng(9))).toEqual(buildPush('random', createRng(9)));
    const outs = [1, 2, 3, 4, 5].map((s) => JSON.stringify(buildPush('random', createRng(s))));
    expect(new Set(outs).size).toBeGreaterThan(1);
  });

  it('keeps every random duration a multiple of 5 seconds', () => {
    for (let seed = 1; seed <= 6; seed++) {
      for (const b of buildPush('random', createRng(seed))) {
        expect(b.durationSec % 5).toBe(0);
      }
    }
  });
});
```

> The build-rule itself (a prepended `medium` filling the remainder) is verified
> deterministically by the named-style tests in Task 1, which is why the random tests
> don't assert a build exists for any particular seed — that would depend on un-run RNG
> output. They assert only the seed-independent invariants (420s total, valid
> intensities, rest ratio, 5s multiples, determinism/variety).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/pushStyles.test.ts`
Expected: FAIL on "is deterministic … and varies across seeds" — the Task 1 placeholder
returns the same `[hard 420]` block for every seed, so the distinct-output set has size
1, not `> 1`. (The other random tests pass vacuously against the placeholder.)

- [ ] **Step 3: Implement the random generator**

In `src/core/pushStyles.ts`, add the generator function above `buildPush` and wire it in. Insert this function right after `prependBuild`:

```ts
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
```

Then change the `random` case in `buildPush`:

```ts
    case 'random':
      return prependBuild(randomBlocks(_rng));
```

And rename the `buildPush` parameter from `_rng` to `rng` (it is now used):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/pushStyles.test.ts`
Expected: PASS (all named + random tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/pushStyles.ts tests/pushStyles.test.ts
git commit -m "feat(core): seeded random push generator"
```

---

## Task 3: Rewrite the generator around the fixed skeleton

**Files:**
- Rewrite: `src/core/generator.ts`
- Rewrite: `tests/generator.test.ts`

- [ ] **Step 1: Write the new failing generator tests**

Replace the entire contents of `tests/generator.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/generator.test.ts`
Expected: FAIL — `snapMinutes` / `SUPPORTED_MINUTES` are not exported and the old generator produces a different structure.

- [ ] **Step 3: Rewrite the generator implementation**

Replace the entire contents of `src/core/generator.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/generator.test.ts tests/pushStyles.test.ts`
Expected: PASS for both files.

- [ ] **Step 5: Commit**

```bash
git add src/core/generator.ts tests/generator.test.ts
git commit -m "feat(core): assemble fixed warm-up/push/bridge/cool-down skeleton"
```

---

## Task 4: Setup UI duration selector

**Files:**
- Modify: `src/ui/setupView.ts:19-22` (the "Total minutes" input) and `:48-52` (`doGenerate`), `:44` (`minutesEl` type)
- Modify: `tests/setupView.test.ts`

- [ ] **Step 1: Write the failing UI test**

Add this test inside the `describe('setup view', ...)` block in `tests/setupView.test.ts`:

```ts
  it('offers only 10/20/30-minute durations', () => {
    mountSetup(container, { storage, onStart: () => {} });
    const select = container.querySelector('.setup-minutes') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['10', '20', '30']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/setupView.test.ts`
Expected: FAIL — `.setup-minutes` is currently an `<input>`, so `select.tagName` is `'INPUT'` and `select.options` is undefined.

- [ ] **Step 3: Replace the input with a selector**

In `src/ui/setupView.ts`, update the import on line 3 to also pull in the helpers:

```ts
import { generate, snapMinutes, SUPPORTED_MINUTES } from '../core/generator';
```

Replace the "Total minutes" label/input block (currently lines 20-22) with:

```ts
        <label>Total minutes
          <select class="setup-minutes">
            ${SUPPORTED_MINUTES.map(
              (m) =>
                `<option value="${m}" ${m === snapMinutes(prefs.lastTotalMin) ? 'selected' : ''}>${m}</option>`,
            ).join('')}
          </select>
        </label>
```

Change the `minutesEl` declaration (currently line 44) from `HTMLInputElement` to `HTMLSelectElement`:

```ts
  const minutesEl = container.querySelector('.setup-minutes') as HTMLSelectElement;
```

Update `doGenerate` (currently lines 48-52) so an unparseable value falls back to a supported default:

```ts
  const doGenerate = () => {
    const mins = snapMinutes(Number(minutesEl.value) || 20);
    opts.storage.setPrefs({ lastTotalMin: mins });
    renderEditor(editor, generate(mins, {}, seed));
  };
```

- [ ] **Step 4: Run the setup tests to verify they pass**

Run: `npx vitest run tests/setupView.test.ts`
Expected: PASS — the existing Generate/Start/Save tests still work (setting `.value = '20'` selects the 20 option) and the new selector test passes.

- [ ] **Step 5: Commit**

```bash
git add src/ui/setupView.ts tests/setupView.test.ts
git commit -m "feat(ui): 10/20/30 duration selector on setup page"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck the whole project**

Run: `npm run typecheck`
Expected: no errors. (Confirms the removed `GeneratorOptions` cap fields are unused elsewhere and the new `setup-minutes` select typing is consistent.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all test files pass, including `pushStyles`, `generator`, and `setupView`.

- [ ] **Step 3: Build to confirm both entries still compile**

Run: `npm run build`
Expected: Vite multi-page build succeeds (`index.html` + `overlay.html`).

- [ ] **Step 4: Commit any incidental fixes**

If steps 1-3 required fixes, commit them:

```bash
git add -A
git commit -m "chore: fixes from full verification"
```

If nothing changed, skip this step.

---

## Notes for the implementer

- **Determinism contract:** ids stay `seg-${seed}-${idx}`. Because one push is built and
  reused, repeated pushes get distinct ids (the index keeps incrementing). Consumers
  (`setupView`, template load) already re-id on load via `makeId()`, so duplicate
  *content* across pushes is fine.
- **Why "varies across seeds" is a set-size check, not a pair check:** named styles are
  fixed, so two seeds that both pick e.g. `crazy` produce identical output. Asserting a
  specific seed pair differs would be brittle; asserting that a range of seeds yields more
  than one distinct workout is robust.
- **EN DASH invariant** (`INTENSITY_META` all-out spm `'30–32'`) is untouched by this work.
- **5-second invariant:** every duration introduced here (20/30/40/60/80/120/420 plus the
  random generator's 5s units) is a multiple of 5, preserving the existing guarantee.
```
