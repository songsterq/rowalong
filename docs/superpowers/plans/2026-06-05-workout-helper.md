# Workout Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Workout Helper v1 — a Vite + vanilla-TypeScript local web app that runs interval rowing workouts and shows a floating, always-on-top overlay (intensity, countdown, recommended stroke rate, tone cues) that rides over any video, including native macOS fullscreen.

**Architecture:** A framework-agnostic core (`types`, `generator`, `sessionEngine`, `audio`, `storage`) drives the workout. DOM UI (`setupView`, `overlayView`) renders it. The only platform-specific concern — creating the floating window — sits behind one `OverlayHost` interface, implemented for v1 by `PipOverlayHost` (Chrome Document Picture-in-Picture). Pure logic is built test-first with Vitest; browser-API wrappers are kept dumb and verified manually.

**Tech Stack:** Vite, TypeScript, Vitest (jsdom env), Web Audio API, Document Picture-in-Picture API, `localStorage`.

**Spec:** [docs/superpowers/specs/2026-06-05-workout-helper-design.md](../specs/2026-06-05-workout-helper-design.md)

---

## File Structure

```
workout-helper/
├─ package.json              # scripts + dev deps
├─ tsconfig.json
├─ vite.config.ts            # also holds vitest config
├─ index.html               # setup page entry → src/main.ts
├─ pip-spike.html           # Step 0 spike (standalone, deleted/kept after spike)
├─ src/
│  ├─ main.ts               # bootstrap: setup view + Start wiring + overlay host
│  ├─ core/
│  │  ├─ types.ts           # Intensity, Segment, Template, INTENSITY_META, makeId
│  │  ├─ random.ts          # seeded PRNG (mulberry32) + helpers
│  │  ├─ generator.ts       # generate(totalMin, options?, seed?) → Segment[]
│  │  ├─ sessionEngine.ts   # SessionEngine class, Clock, SessionState, events
│  │  ├─ storage.ts         # Storage wrapper (templates + prefs) over localStorage
│  │  ├─ audio.ts           # tone decision fns (pure) + TonePlayer (Web Audio)
│  │  └─ starters.ts        # built-in starter templates
│  ├─ shell/
│  │  ├─ overlayHost.ts     # OverlayHost interface + isPipSupported()
│  │  └─ pipOverlayHost.ts  # Document Picture-in-Picture implementation
│  └─ ui/
│     ├─ overlayView.ts     # overlay DOM: render + interaction (pill/coach)
│     ├─ segmentEditor.ts   # editable segment list (render + read-back)
│     └─ setupView.ts       # setup page: templates, generate, editor, prefs, start
└─ tests/
   ├─ types.test.ts
   ├─ random.test.ts
   ├─ generator.test.ts
   ├─ sessionEngine.test.ts
   ├─ storage.test.ts
   ├─ audio.test.ts
   ├─ overlayView.test.ts
   ├─ segmentEditor.test.ts
   └─ setupView.test.ts
```

Responsibilities are split so each file holds one concern and stays small enough to reason about in one read. `core/` is pure and fully unit-tested. `shell/` and the interactive parts of `ui/` are thin and verified manually (browser APIs don't run under jsdom).

---

## Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `tests/smoke.test.ts`

- [ ] **Step 1: Initialize npm and install dev dependencies**

Run:
```bash
cd /Users/songqian/code/songsterq/workout-helper
npm init -y
npm install -D vite typescript vitest jsdom
```
Expected: `node_modules/` created, `package.json` written (already git-ignored).

- [ ] **Step 2: Write `package.json` scripts**

Replace the `"scripts"` block in `package.json` with:
```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```
(Keep the rest of the generated fields; ensure `"type": "module"` is present.)

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: Write `vite.config.ts` (with Vitest config)**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 5: Write a minimal `index.html` and `src/main.ts` stub**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Workout Helper</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
const app = document.querySelector<HTMLDivElement>('#app');
if (app) app.textContent = 'Workout Helper — loading…';
```

- [ ] **Step 6: Write a smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('tooling', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run the test suite**

Run: `npm test`
Expected: 1 passing test (`tooling > runs vitest`).

- [ ] **Step 8: Verify the dev server boots**

Run: `npm run dev` then open the printed URL (e.g. http://localhost:5173).
Expected: page shows "Workout Helper — loading…". Stop the server (Ctrl-C).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src/main.ts tests/smoke.test.ts
git commit -m "chore: scaffold Vite + TypeScript + Vitest project"
```

---

## Task 2: Step 0 — PiP-over-fullscreen spike (decision gate)

This retires the one load-bearing assumption before building anything else: that a **Document** Picture-in-Picture window floats over a **native macOS fullscreen** app. There is no automated test (it requires Chrome + a native fullscreen app), so this task is a manual verification with an explicit decision gate.

**Files:**
- Create: `pip-spike.html`

- [ ] **Step 1: Write the spike page**

`pip-spike.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>PiP Spike</title>
  </head>
  <body style="font-family: system-ui; padding: 2rem;">
    <h1>Document PiP fullscreen spike</h1>
    <p>Click the button, then switch to a native fullscreen app (Netflix.app / Apple TV / QuickTime).</p>
    <button id="open">Open overlay</button>
    <script>
      const btn = document.getElementById('open');
      btn.addEventListener('click', async () => {
        if (!('documentPictureInPicture' in window)) {
          alert('Document Picture-in-Picture not supported in this browser.');
          return;
        }
        // @ts-ignore - no standard TS types yet
        const pip = await window.documentPictureInPicture.requestWindow({ width: 220, height: 120 });
        const box = pip.document.createElement('div');
        box.style.cssText =
          'font-family:system-ui;height:100%;display:flex;flex-direction:column;' +
          'align-items:center;justify-content:center;background:#ff4d4f;color:#fff;';
        const label = pip.document.createElement('div');
        label.textContent = 'ALL OUT';
        label.style.cssText = 'font-weight:800;letter-spacing:.05em;';
        const count = pip.document.createElement('div');
        count.style.cssText = 'font-size:48px;font-weight:800;font-variant-numeric:tabular-nums;';
        box.append(label, count);
        pip.document.body.style.margin = '0';
        pip.document.body.append(box);
        let n = 30;
        count.textContent = '0:' + String(n).padStart(2, '0');
        const id = setInterval(() => {
          n = n <= 0 ? 30 : n - 1;
          count.textContent = '0:' + String(n).padStart(2, '0');
        }, 1000);
        pip.addEventListener('pagehide', () => clearInterval(id));
      });
    </script>
  </body>
</html>
```

- [ ] **Step 2: Serve the spike**

Run: `npm run dev`
Then open `http://localhost:<port>/pip-spike.html` in **Google Chrome** (Document PiP is Chromium-only; localhost is a secure context, which the API requires).

- [ ] **Step 3: Manual verification (decision gate)**

Verification checklist:
1. Click **Open overlay** — a small PiP window appears with a red box and a ticking countdown.
2. Open a video in a **native macOS app** (Netflix.app, Apple TV, or QuickTime) and put it in **fullscreen** (green-button / native fullscreen, which creates its own Space).
3. Confirm the PiP overlay **remains visible on top of the fullscreen video**.
4. Repeat with a browser video in fullscreen (YouTube fullscreen).

Expected: the overlay floats above the fullscreen content in both cases.

**Decision gate:**
- ✅ **If it floats over native fullscreen** → proceed with the plan as written (`PipOverlayHost`, Task 9).
- ❌ **If it does NOT** → stop and switch the shell to Electron: skip Task 9's `PipOverlayHost` and instead implement `ElectronOverlayHost` per spec §2.1 (`setAlwaysOnTop(true, 'screen-saver')` + `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`). Tasks 3–8 and the overlay/setup UI are unchanged because they sit behind the `OverlayHost` interface. Record the outcome in the commit message and revisit Task 13's wiring to construct the Electron host.

- [ ] **Step 4: Record the result and commit**

Append a one-line result to the top of `pip-spike.html` as an HTML comment, e.g. `<!-- RESULT 2026-06-05: floats over Netflix.app fullscreen ✅ -->`.
```bash
git add pip-spike.html
git commit -m "spike: verify Document PiP floats over native macOS fullscreen"
```

---

## Task 3: Core types & intensity metadata

**Files:**
- Create: `src/core/types.ts`
- Test: `tests/types.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { INTENSITY_META, makeId, type Intensity } from '../src/core/types';

describe('INTENSITY_META', () => {
  const all: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

  it('has an entry for every intensity', () => {
    for (const i of all) expect(INTENSITY_META[i]).toBeDefined();
  });

  it('maps the recommended stroke rates from the spec', () => {
    expect(INTENSITY_META.easy.spmLabel).toBe('24');
    expect(INTENSITY_META.medium.spmLabel).toBe('26');
    expect(INTENSITY_META.hard.spmLabel).toBe('28');
    expect(INTENSITY_META.allout.spmLabel).toBe('30–32');
  });

  it('classifies easy/medium as rest and hard/allout as work', () => {
    expect(INTENSITY_META.easy.kind).toBe('rest');
    expect(INTENSITY_META.medium.kind).toBe('rest');
    expect(INTENSITY_META.hard.kind).toBe('work');
    expect(INTENSITY_META.allout.kind).toBe('work');
  });
});

describe('makeId', () => {
  it('returns unique strings', () => {
    expect(makeId()).not.toBe(makeId());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/types.test.ts`
Expected: FAIL — cannot resolve `../src/core/types`.

- [ ] **Step 3: Implement `src/core/types.ts`**

```ts
export type Intensity = 'easy' | 'medium' | 'hard' | 'allout';

export interface Segment {
  id: string;
  intensity: Intensity;
  durationSec: number;
  label?: string; // optional display override; future HIIT uses it for exercise names
}

export interface Template {
  id: string;
  name: string;
  segments: Segment[];
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'done';

export interface IntensityMeta {
  label: string; // 'Easy', 'Medium', 'Hard', 'All-out'
  color: string; // hex used by the overlay
  spmLabel: string; // recommended stroke rate, e.g. '24' or '30–32'
  kind: 'rest' | 'work';
}

export const INTENSITY_META: Record<Intensity, IntensityMeta> = {
  easy: { label: 'Easy', color: '#34d399', spmLabel: '24', kind: 'rest' },
  medium: { label: 'Medium', color: '#fbbf24', spmLabel: '26', kind: 'rest' },
  hard: { label: 'Hard', color: '#ff8c42', spmLabel: '28', kind: 'work' },
  allout: { label: 'All-out', color: '#ff4d4f', spmLabel: '30–32', kind: 'work' },
};

export function makeId(): string {
  return crypto.randomUUID();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/types.test.ts
git commit -m "feat: core types and intensity metadata"
```

---

## Task 4: Seeded PRNG

**Files:**
- Create: `src/core/random.ts`
- Test: `tests/random.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/random.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/random.test.ts`
Expected: FAIL — cannot resolve `../src/core/random`.

- [ ] **Step 3: Implement `src/core/random.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/random.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/random.ts tests/random.test.ts
git commit -m "feat: seeded PRNG for reproducible workout generation"
```

---

## Task 5: Workout generator

Implements spec §4. Total duration is made **exact** by folding any leftover seconds into the easy cooldown, which keeps the "respects total" property trivially true and guarantees every rest stays within 0.5–1× of its preceding push.

**Files:**
- Create: `src/core/generator.ts`
- Test: `tests/generator.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/generator.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/generator.test.ts`
Expected: FAIL — cannot resolve `../src/core/generator`.

- [ ] **Step 3: Implement `src/core/generator.ts`**

```ts
import { Intensity, Segment, makeId } from './types';
import { createRng } from './random';

export interface GeneratorOptions {
  warmupCapSec?: number; // max warmup length, default 180
  cooldownCapSec?: number; // max cooldown budget, default 150
  minPushSec?: number; // default 20
  maxPushSec?: number; // default 150
}

const seg = (intensity: Intensity, durationSec: number): Segment => ({
  id: makeId(),
  intensity,
  durationSec,
});

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/generator.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/generator.ts tests/generator.test.ts
git commit -m "feat: rowing workout generator (exact total, 0.5–1x rests)"
```

---

## Task 6: Session engine

Implements spec §5. Time is derived from an injectable `Clock` (`performance.now()` deltas), so tests drive it with a fake clock and `tick()`.

**Files:**
- Create: `src/core/sessionEngine.ts`
- Test: `tests/sessionEngine.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/sessionEngine.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SessionEngine, type Clock, type EngineEvent } from '../src/core/sessionEngine';
import { Segment, Intensity } from '../src/core/types';

class FakeClock implements Clock {
  t = 0;
  now() {
    return this.t;
  }
}

let counter = 0;
const seg = (intensity: Intensity, durationSec: number): Segment => ({
  id: `s${counter++}`,
  intensity,
  durationSec,
});

function setup() {
  const clock = new FakeClock();
  const segs = [seg('easy', 10), seg('hard', 6), seg('easy', 4)];
  const engine = new SessionEngine(segs, clock);
  const events: EngineEvent[] = [];
  engine.on((e) => events.push(e));
  return { clock, engine, events };
}

describe('SessionEngine', () => {
  it('starts running at index 0', () => {
    const { engine } = setup();
    engine.start();
    const s = engine.getState();
    expect(s.status).toBe('running');
    expect(s.currentIndex).toBe(0);
    expect(s.segment?.intensity).toBe('easy');
  });

  it('reports elapsed/remaining for the current segment', () => {
    const { clock, engine } = setup();
    engine.start();
    clock.t = 4000;
    engine.tick();
    const s = engine.getState();
    expect(s.currentIndex).toBe(0);
    expect(Math.round(s.segmentElapsedSec)).toBe(4);
    expect(Math.round(s.segmentRemainingSec)).toBe(6);
  });

  it('fires a transition when crossing a segment boundary', () => {
    const { clock, engine, events } = setup();
    engine.start();
    clock.t = 11000;
    engine.tick();
    const t = events.find((e) => e.type === 'transition');
    expect(t).toBeDefined();
    expect(engine.getState().currentIndex).toBe(1);
  });

  it('emits 3-2-1 countdown events before a boundary', () => {
    const { clock, engine, events } = setup();
    engine.start();
    for (const ms of [13000, 14000, 15000]) {
      clock.t = ms;
      engine.tick();
    }
    const counts = events
      .filter((e) => e.type === 'countdown')
      .map((e) => (e.type === 'countdown' ? e.secondsLeft : 0));
    expect(counts).toEqual([3, 2, 1]);
  });

  it('does not advance while paused', () => {
    const { clock, engine } = setup();
    engine.start();
    clock.t = 3000;
    engine.tick();
    engine.pause();
    clock.t = 8000;
    engine.tick();
    expect(Math.round(engine.getState().segmentElapsedSec)).toBe(3);
    engine.resume();
    clock.t = 9000;
    engine.tick();
    expect(Math.round(engine.getState().segmentElapsedSec)).toBe(4);
  });

  it('skips to the next and previous segment', () => {
    const { engine } = setup();
    engine.start();
    engine.skipNext();
    expect(engine.getState().currentIndex).toBe(1);
    engine.skipPrev();
    expect(engine.getState().currentIndex).toBe(0);
  });

  it('completes after the last segment', () => {
    const { clock, engine, events } = setup();
    engine.start();
    clock.t = 21000;
    engine.tick();
    expect(events.some((e) => e.type === 'complete')).toBe(true);
    expect(engine.getState().status).toBe('done');
  });

  it('stop() ends the session without a complete event', () => {
    const { engine, events } = setup();
    engine.start();
    engine.stop();
    expect(engine.getState().status).toBe('done');
    expect(events.some((e) => e.type === 'complete')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sessionEngine.test.ts`
Expected: FAIL — cannot resolve `../src/core/sessionEngine`.

- [ ] **Step 3: Implement `src/core/sessionEngine.ts`**

```ts
import { Segment, SessionStatus } from './types';

export interface Clock {
  /** Monotonic milliseconds. */
  now(): number;
}

export const realClock: Clock = { now: () => performance.now() };

export interface SessionState {
  status: SessionStatus;
  currentIndex: number;
  segment: Segment | null;
  segmentElapsedSec: number;
  segmentRemainingSec: number;
  totalElapsedSec: number;
  totalRemainingSec: number;
  totalSegments: number;
}

export type EngineEvent =
  | { type: 'tick'; state: SessionState }
  | { type: 'transition'; from: Segment; to: Segment }
  | { type: 'countdown'; secondsLeft: number; next: Segment }
  | { type: 'complete' };

type Listener = (e: EngineEvent) => void;

export class SessionEngine {
  private status: SessionStatus = 'idle';
  private elapsedSec = 0;
  private lastNow = 0;
  private index = 0;
  private lastCountdownSec: number | null = null;
  private listeners = new Set<Listener>();
  private readonly cumStart: number[];
  private readonly totalDuration: number;

  constructor(
    private readonly segments: Segment[],
    private readonly clock: Clock = realClock,
  ) {
    this.cumStart = [];
    let acc = 0;
    for (const s of segments) {
      this.cumStart.push(acc);
      acc += s.durationSec;
    }
    this.totalDuration = acc;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private emitTick() {
    this.emit({ type: 'tick', state: this.getState() });
  }

  private indexAt(elapsed: number): number {
    let i = 0;
    while (i < this.segments.length - 1 && elapsed >= this.cumStart[i + 1]) i++;
    return i;
  }

  start() {
    this.status = 'running';
    this.elapsedSec = 0;
    this.index = 0;
    this.lastCountdownSec = null;
    this.lastNow = this.clock.now();
    this.emitTick();
  }

  pause() {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.emitTick();
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.lastNow = this.clock.now();
    this.emitTick();
  }

  stop() {
    this.status = 'done';
    this.emitTick();
  }

  private completeNow() {
    this.elapsedSec = this.totalDuration;
    this.status = 'done';
    this.emit({ type: 'complete' });
    this.emitTick();
  }

  skipNext() {
    const target = this.index + 1;
    if (target >= this.segments.length) {
      this.completeNow();
      return;
    }
    const from = this.segments[this.index];
    const to = this.segments[target];
    this.elapsedSec = this.cumStart[target];
    this.index = target;
    this.lastCountdownSec = null;
    if (this.status === 'running') this.lastNow = this.clock.now();
    this.emit({ type: 'transition', from, to });
    this.emitTick();
  }

  skipPrev() {
    const target = Math.max(0, this.index - 1);
    const from = this.segments[this.index];
    const to = this.segments[target];
    this.elapsedSec = this.cumStart[target];
    this.index = target;
    this.lastCountdownSec = null;
    if (this.status === 'running') this.lastNow = this.clock.now();
    if (from !== to) this.emit({ type: 'transition', from, to });
    this.emitTick();
  }

  tick() {
    if (this.status !== 'running') {
      this.emitTick();
      return;
    }
    const n = this.clock.now();
    this.elapsedSec += (n - this.lastNow) / 1000;
    this.lastNow = n;

    if (this.elapsedSec >= this.totalDuration) {
      this.completeNow();
      return;
    }

    const newIndex = this.indexAt(this.elapsedSec);
    if (newIndex !== this.index) {
      const from = this.segments[this.index];
      const to = this.segments[newIndex];
      this.index = newIndex;
      this.lastCountdownSec = null;
      this.emit({ type: 'transition', from, to });
    }

    const next = this.segments[this.index + 1];
    if (next) {
      const state = this.getState();
      const cl = Math.ceil(state.segmentRemainingSec);
      if (cl >= 1 && cl <= 3 && cl !== this.lastCountdownSec) {
        this.lastCountdownSec = cl;
        this.emit({ type: 'countdown', secondsLeft: cl, next });
      }
    }

    this.emitTick();
  }

  getState(): SessionState {
    const segment = this.segments[this.index] ?? null;
    const segStart = this.cumStart[this.index] ?? 0;
    const segmentElapsedSec = segment ? this.elapsedSec - segStart : 0;
    const segmentRemainingSec = segment
      ? Math.max(0, segment.durationSec - segmentElapsedSec)
      : 0;
    return {
      status: this.status,
      currentIndex: this.index,
      segment,
      segmentElapsedSec: Math.max(0, segmentElapsedSec),
      segmentRemainingSec,
      totalElapsedSec: Math.min(this.elapsedSec, this.totalDuration),
      totalRemainingSec: Math.max(0, this.totalDuration - this.elapsedSec),
      totalSegments: this.segments.length,
    };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/sessionEngine.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/sessionEngine.ts tests/sessionEngine.test.ts
git commit -m "feat: session engine with injectable clock and events"
```

---

## Task 7: Storage (templates + prefs)

Implements spec §9. The backing store is injected via a `KeyValueStore` interface (defaults to `localStorage`) so tests use an in-memory map and the store is swappable later.

**Files:**
- Create: `src/core/storage.ts`
- Test: `tests/storage.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/storage.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, DEFAULT_PREFS, type KeyValueStore } from '../src/core/storage';
import { Template } from '../src/core/types';

class Mem implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

const tpl = (id: string, name: string): Template => ({
  id,
  name,
  segments: [{ id: 'a', intensity: 'easy', durationSec: 60 }],
});

let store: Storage;
beforeEach(() => {
  store = new Storage(new Mem());
});

describe('Storage templates', () => {
  it('starts empty', () => {
    expect(store.listTemplates()).toEqual([]);
  });

  it('saves and lists a template', () => {
    store.saveTemplate(tpl('1', 'A'));
    expect(store.listTemplates().map((t) => t.id)).toEqual(['1']);
  });

  it('gets a template by id', () => {
    store.saveTemplate(tpl('1', 'A'));
    expect(store.getTemplate('1')?.name).toBe('A');
    expect(store.getTemplate('missing')).toBeUndefined();
  });

  it('upserts by id', () => {
    store.saveTemplate(tpl('1', 'A'));
    store.saveTemplate(tpl('1', 'A-renamed'));
    expect(store.listTemplates()).toHaveLength(1);
    expect(store.getTemplate('1')?.name).toBe('A-renamed');
  });

  it('deletes a template', () => {
    store.saveTemplate(tpl('1', 'A'));
    store.deleteTemplate('1');
    expect(store.listTemplates()).toEqual([]);
  });
});

describe('Storage prefs', () => {
  it('returns defaults when empty', () => {
    expect(store.getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('merges partial updates and persists them', () => {
    store.setPrefs({ density: 'coach', muted: true });
    const p = store.getPrefs();
    expect(p.density).toBe('coach');
    expect(p.muted).toBe(true);
    expect(p.volume).toBe(DEFAULT_PREFS.volume);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL — cannot resolve `../src/core/storage`.

- [ ] **Step 3: Implement `src/core/storage.ts`**

```ts
import { Template } from './types';

export type Density = 'pill' | 'coach';

export interface Prefs {
  density: Density;
  volume: number; // 0..1
  muted: boolean;
  lastTotalMin: number;
}

export const DEFAULT_PREFS: Prefs = {
  density: 'pill',
  volume: 0.6,
  muted: false,
  lastTotalMin: 20,
};

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const TEMPLATES_KEY = 'wh.templates';
const PREFS_KEY = 'wh.prefs';

export class Storage {
  constructor(private readonly backend: KeyValueStore = localStorage) {}

  listTemplates(): Template[] {
    const raw = this.backend.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Template[]) : [];
    } catch {
      return [];
    }
  }

  getTemplate(id: string): Template | undefined {
    return this.listTemplates().find((t) => t.id === id);
  }

  saveTemplate(t: Template): void {
    const all = this.listTemplates().filter((x) => x.id !== t.id);
    all.push(t);
    this.backend.setItem(TEMPLATES_KEY, JSON.stringify(all));
  }

  deleteTemplate(id: string): void {
    const all = this.listTemplates().filter((t) => t.id !== id);
    this.backend.setItem(TEMPLATES_KEY, JSON.stringify(all));
  }

  getPrefs(): Prefs {
    const raw = this.backend.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    try {
      return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  setPrefs(patch: Partial<Prefs>): void {
    const next = { ...this.getPrefs(), ...patch };
    this.backend.setItem(PREFS_KEY, JSON.stringify(next));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/storage.ts tests/storage.test.ts
git commit -m "feat: localStorage-backed templates and prefs"
```

---

## Task 8: Audio — tone decisions + TonePlayer

Implements spec §6. The decision logic (which tone, whether to beep) is pure and tested; the oscillator playback is a thin Web Audio wrapper verified manually.

**Files:**
- Create: `src/core/audio.ts`
- Test: `tests/audio.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/audio.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { toneForTransition, shouldBeepBeforeNext } from '../src/core/audio';

describe('toneForTransition', () => {
  it('rises when entering a work segment', () => {
    const t = toneForTransition('hard');
    expect(t.endHz).toBeGreaterThan(t.startHz);
  });

  it('descends when entering a rest segment', () => {
    const t = toneForTransition('easy');
    expect(t.endHz).toBeLessThan(t.startHz);
  });
});

describe('shouldBeepBeforeNext', () => {
  it('beeps before pushes', () => {
    expect(shouldBeepBeforeNext('hard')).toBe(true);
    expect(shouldBeepBeforeNext('allout')).toBe(true);
  });

  it('does not beep before rests', () => {
    expect(shouldBeepBeforeNext('easy')).toBe(false);
    expect(shouldBeepBeforeNext('medium')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/audio.test.ts`
Expected: FAIL — cannot resolve `../src/core/audio`.

- [ ] **Step 3: Implement `src/core/audio.ts`**

```ts
import { Intensity, INTENSITY_META } from './types';

export interface ToneSpec {
  startHz: number;
  endHz: number;
  durMs: number;
}

/** Rising/urgent tone into a push; softer descending tone into a rest. */
export function toneForTransition(to: Intensity): ToneSpec {
  return INTENSITY_META[to].kind === 'work'
    ? { startHz: 440, endHz: 880, durMs: 220 }
    : { startHz: 660, endHz: 440, durMs: 180 };
}

/** 3-2-1 beeps only precede a push (spec §6). */
export function shouldBeepBeforeNext(next: Intensity): boolean {
  return INTENSITY_META[next].kind === 'work';
}

/**
 * Thin Web Audio wrapper. Pure decisions live above; this just plays them.
 * Verified manually (no audio device under jsdom).
 */
export class TonePlayer {
  private ctx: AudioContext | null = null;
  private volume = 0.6;
  private muted = false;

  /** Must be called from a user gesture (e.g. the Start click). */
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  private playTone(spec: ToneSpec) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(spec.startHz, t0);
    osc.frequency.linearRampToValueAtTime(spec.endHz, t0 + spec.durMs / 1000);
    gain.gain.setValueAtTime(this.volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.durMs / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + spec.durMs / 1000);
  }

  /** Engine 'countdown' handler: beep only before a push. */
  handleCountdown(next: Intensity) {
    if (shouldBeepBeforeNext(next)) {
      this.playTone({ startHz: 880, endHz: 880, durMs: 90 });
    }
  }

  /** Engine 'transition' handler. */
  handleTransition(to: Intensity) {
    this.playTone(toneForTransition(to));
  }

  /** Engine 'complete' handler. */
  playComplete() {
    this.playTone({ startHz: 523, endHz: 784, durMs: 400 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/audio.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/audio.ts tests/audio.test.ts
git commit -m "feat: tone cue decisions and Web Audio TonePlayer"
```

---

## Task 9: OverlayHost interface + PipOverlayHost

Implements spec §2.1 and §7's hosting. `isPipSupported()` is unit-tested; the PiP window itself is verified manually (already de-risked by Task 2).

> **If Task 2's gate failed:** implement `ElectronOverlayHost` here instead, against the same `OverlayHost` interface, and adjust Task 13 to construct it. The rest of the plan is unaffected.

**Files:**
- Create: `src/shell/overlayHost.ts`, `src/shell/pipOverlayHost.ts`
- Test: `tests/overlayHost.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/overlayHost.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isPipSupported } from '../src/shell/overlayHost';

describe('isPipSupported', () => {
  it('is true when documentPictureInPicture exists', () => {
    expect(isPipSupported({ documentPictureInPicture: {} } as unknown as Window)).toBe(true);
  });

  it('is false when it does not', () => {
    expect(isPipSupported({} as unknown as Window)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/overlayHost.test.ts`
Expected: FAIL — cannot resolve `../src/shell/overlayHost`.

- [ ] **Step 3: Implement `src/shell/overlayHost.ts`**

```ts
export interface OverlayHost {
  /** Create the floating window and return its Document to render into. */
  open(size: { width: number; height: number }): Promise<Document>;
  close(): void;
  readonly isOpen: boolean;
  /** Fires if the user closes the floating window manually. */
  onClosed(cb: () => void): void;
}

export function isPipSupported(win: Window = window): boolean {
  return typeof win !== 'undefined' && 'documentPictureInPicture' in win;
}
```

- [ ] **Step 4: Implement `src/shell/pipOverlayHost.ts`**

```ts
import { OverlayHost } from './overlayHost';

// Minimal shape of the Document Picture-in-Picture API (no official TS types yet).
interface DocumentPiP {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
}

export class PipOverlayHost implements OverlayHost {
  private pipWindow: Window | null = null;
  private closedCb: (() => void) | null = null;

  get isOpen() {
    return this.pipWindow !== null;
  }

  async open(size: { width: number; height: number }): Promise<Document> {
    const api = (window as unknown as { documentPictureInPicture?: DocumentPiP })
      .documentPictureInPicture;
    if (!api) throw new Error('Document Picture-in-Picture not supported');
    const win = await api.requestWindow(size);
    this.pipWindow = win;
    win.document.body.style.margin = '0';
    win.addEventListener('pagehide', () => {
      this.pipWindow = null;
      this.closedCb?.();
    });
    return win.document;
  }

  close() {
    this.pipWindow?.close();
    this.pipWindow = null;
  }

  onClosed(cb: () => void) {
    this.closedCb = cb;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/overlayHost.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shell/overlayHost.ts src/shell/pipOverlayHost.ts tests/overlayHost.test.ts
git commit -m "feat: OverlayHost interface and PiP implementation"
```

---

## Task 10: Overlay view (render + interaction)

Implements spec §7. Pure formatters and the DOM-`applyState` function are tested in jsdom; click/hover wiring is tested against a mock engine.

**Files:**
- Create: `src/ui/overlayView.ts`
- Test: `tests/overlayView.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/overlayView.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatCountdown, spmText, mountOverlay } from '../src/ui/overlayView';
import type { SessionState } from '../src/core/sessionEngine';

describe('formatCountdown', () => {
  it('formats m:ss with ceil', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(4.2)).toBe('0:05');
  });
});

describe('spmText', () => {
  it('renders label and recommended spm', () => {
    expect(spmText('hard')).toBe('Hard · 28 spm');
    expect(spmText('allout')).toBe('All-out · 30–32 spm');
  });
});

// Minimal engine stand-in exposing only what the overlay uses.
function fakeEngine(state: SessionState) {
  const calls: string[] = [];
  return {
    calls,
    on: () => () => {},
    getState: () => state,
    pause: () => calls.push('pause'),
    resume: () => calls.push('resume'),
    skipNext: () => calls.push('skipNext'),
    skipPrev: () => calls.push('skipPrev'),
    stop: () => calls.push('stop'),
  };
}

const runningState: SessionState = {
  status: 'running',
  currentIndex: 1,
  segment: { id: 'x', intensity: 'hard', durationSec: 60 },
  segmentElapsedSec: 33,
  segmentRemainingSec: 27,
  totalElapsedSec: 100,
  totalRemainingSec: 200,
  totalSegments: 9,
};

describe('mountOverlay', () => {
  it('renders the current intensity, spm and countdown', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'coach' });
    expect(document.querySelector('.ov-label')?.textContent).toContain('Hard');
    expect(document.querySelector('.ov-spm')?.textContent).toBe('Hard · 28 spm');
    expect(document.querySelector('.ov-count')?.textContent).toBe('0:27');
  });

  it('clicking the body toggles pause/resume', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'pill' });
    (document.querySelector('.ov-root') as HTMLElement).click();
    expect(engine.calls).toContain('pause');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: FAIL — cannot resolve `../src/ui/overlayView`.

- [ ] **Step 3: Implement `src/ui/overlayView.ts`**

```ts
import { INTENSITY_META, Intensity } from '../core/types';
import type { SessionEngine, SessionState } from '../core/sessionEngine';
import type { Density } from '../core/storage';

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function spmText(i: Intensity): string {
  const meta = INTENSITY_META[i];
  return `${meta.label} · ${meta.spmLabel} spm`;
}

export const OVERLAY_CSS = `
  .ov-root { font-family: -apple-system, system-ui, sans-serif; color:#fff;
    border-radius:16px; padding:16px 18px; background:rgba(18,18,20,.92);
    box-shadow:0 10px 30px rgba(0,0,0,.5); user-select:none; cursor:pointer;
    transition: background .12s ease; }
  .ov-root[data-status="paused"] { opacity:.55; }
  .ov-label { font-weight:800; letter-spacing:.04em; text-transform:uppercase; font-size:15px; }
  .ov-spm { font-size:12px; opacity:.7; margin-top:2px; }
  .ov-count { font-weight:800; line-height:1; font-variant-numeric:tabular-nums;
    font-size:54px; margin:6px 0 10px; }
  .ov-bar { height:6px; border-radius:99px; background:rgba(255,255,255,.15); overflow:hidden; }
  .ov-bar > span { display:block; height:100%; border-radius:99px; }
  .ov-extra, .ov-ctrls { display:none; }
  .ov-root[data-density="coach"] .ov-extra { display:flex; justify-content:space-between;
    font-size:12px; opacity:.65; margin-top:10px; }
  .ov-root[data-density="coach"] .ov-ctrls { display:flex; }
  .ov-root:hover .ov-ctrls { display:flex; }
  .ov-ctrls { gap:12px; justify-content:center; margin-top:10px; font-size:16px; }
  .ov-ctrls button { background:none; border:none; color:#fff; cursor:pointer; font-size:16px; opacity:.85; }
  .ov-paused-tag { display:none; font-size:11px; opacity:.8; margin-top:4px; }
  .ov-root[data-status="paused"] .ov-paused-tag { display:block; }
  @keyframes ov-flash { from { background:rgba(255,255,255,.35);} to { background:rgba(18,18,20,.92);} }
  .ov-root.ov-flash { animation: ov-flash .5s ease; }
`;

export interface OverlayOpts {
  density: Density;
  onToggleDensity?: () => void;
  onStop?: () => void;
}

type OverlayEngine = Pick<
  SessionEngine,
  'on' | 'getState' | 'pause' | 'resume' | 'skipNext' | 'skipPrev' | 'stop'
>;

export interface MountedOverlay {
  unmount(): void;
  setDensity(d: Density): void;
}

export function mountOverlay(
  doc: Document,
  engine: OverlayEngine,
  opts: OverlayOpts,
): MountedOverlay {
  const style = doc.createElement('style');
  style.textContent = OVERLAY_CSS;
  doc.head.appendChild(style);

  const root = doc.createElement('div');
  root.className = 'ov-root';
  root.dataset.density = opts.density;
  root.innerHTML = `
    <div class="ov-label"></div>
    <div class="ov-spm"></div>
    <div class="ov-count"></div>
    <div class="ov-bar"><span></span></div>
    <div class="ov-extra"><span class="ov-next"></span><span class="ov-remain"></span></div>
    <div class="ov-paused-tag">PAUSED — click to resume</div>
    <div class="ov-ctrls">
      <button data-act="prev" title="Previous">⏮</button>
      <button data-act="pause" title="Pause/Resume">⏯</button>
      <button data-act="next" title="Next">⏭</button>
      <button data-act="density" title="Toggle density">▣</button>
      <button data-act="stop" title="Stop">⏹</button>
    </div>`;
  doc.body.appendChild(root);

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;

  const apply = (state: SessionState) => {
    root.dataset.status = state.status;
    const seg = state.segment;
    if (!seg) return;
    const meta = INTENSITY_META[seg.intensity];
    root.dataset.intensity = seg.intensity;
    $('.ov-label').textContent = seg.label ?? meta.label;
    $('.ov-label').style.color = meta.color;
    $('.ov-spm').textContent = spmText(seg.intensity);
    $('.ov-count').textContent = formatCountdown(state.segmentRemainingSec);
    const pct = seg.durationSec ? (state.segmentElapsedSec / seg.durationSec) * 100 : 0;
    const bar = $('.ov-bar > span') as HTMLElement;
    bar.style.width = `${Math.min(100, pct)}%`;
    bar.style.background = meta.color;
    $('.ov-remain').textContent = `${formatCountdown(state.totalRemainingSec)} left`;
    $('.ov-next').textContent = `Block ${state.currentIndex + 1}/${state.totalSegments}`;
  };

  apply(engine.getState());

  const flash = () => {
    root.classList.remove('ov-flash');
    void root.offsetWidth; // restart animation
    root.classList.add('ov-flash');
  };

  const off = engine.on((e) => {
    if (e.type === 'tick') apply(e.state);
    if (e.type === 'transition') flash();
  });

  root.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('.ov-ctrls')) return; // controls handled below
    const st = engine.getState();
    if (st.status === 'paused') engine.resume();
    else engine.pause();
  });

  $('.ov-ctrls').addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    ev.stopPropagation();
    switch (btn.dataset.act) {
      case 'prev':
        engine.skipPrev();
        break;
      case 'next':
        engine.skipNext();
        break;
      case 'pause': {
        const st = engine.getState();
        if (st.status === 'paused') engine.resume();
        else engine.pause();
        break;
      }
      case 'density':
        opts.onToggleDensity?.();
        break;
      case 'stop':
        engine.stop();
        opts.onStop?.();
        break;
    }
  });

  return {
    unmount() {
      off();
      root.remove();
      style.remove();
    },
    setDensity(d: Density) {
      root.dataset.density = d;
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/overlayView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlayView.ts tests/overlayView.test.ts
git commit -m "feat: overlay view with pill/coach density and controls"
```

---

## Task 11: Segment editor

Implements the editor part of spec §8: a list of editable segments with intensity, duration, add/remove/reorder, and read-back.

**Files:**
- Create: `src/ui/segmentEditor.ts`
- Test: `tests/segmentEditor.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/segmentEditor.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderEditor, readEditor } from '../src/ui/segmentEditor';
import { Segment } from '../src/core/types';

let container: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div id="c"></div>';
  container = document.getElementById('c')!;
});

const segs: Segment[] = [
  { id: 'a', intensity: 'hard', durationSec: 45 },
  { id: 'b', intensity: 'easy', durationSec: 30 },
];

describe('segment editor', () => {
  it('renders one row per segment', () => {
    renderEditor(container, segs);
    expect(container.querySelectorAll('.seg-row')).toHaveLength(2);
  });

  it('round-trips segments through render → read', () => {
    renderEditor(container, segs);
    const read = readEditor(container);
    expect(read.map((s) => s.intensity)).toEqual(['hard', 'easy']);
    expect(read.map((s) => s.durationSec)).toEqual([45, 30]);
  });

  it('reflects an edited duration on read-back', () => {
    renderEditor(container, segs);
    const input = container.querySelector<HTMLInputElement>('.seg-row .seg-dur')!;
    input.value = '90';
    expect(readEditor(container)[0].durationSec).toBe(90);
  });

  it('adds and removes rows', () => {
    renderEditor(container, segs);
    container.querySelector<HTMLButtonElement>('.seg-add')!.click();
    expect(container.querySelectorAll('.seg-row')).toHaveLength(3);
    container.querySelector<HTMLButtonElement>('.seg-row .seg-del')!.click();
    expect(container.querySelectorAll('.seg-row')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/segmentEditor.test.ts`
Expected: FAIL — cannot resolve `../src/ui/segmentEditor`.

- [ ] **Step 3: Implement `src/ui/segmentEditor.ts`**

```ts
import { Intensity, Segment, makeId, INTENSITY_META } from '../core/types';

const INTENSITIES: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

function rowHtml(seg: Segment): string {
  const opts = INTENSITIES.map(
    (i) =>
      `<option value="${i}" ${i === seg.intensity ? 'selected' : ''}>${INTENSITY_META[i].label}</option>`,
  ).join('');
  return `
    <div class="seg-row" data-id="${seg.id}">
      <select class="seg-intensity">${opts}</select>
      <input class="seg-dur" type="number" min="5" step="5" value="${seg.durationSec}" /> s
      <button class="seg-up" title="Move up">↑</button>
      <button class="seg-down" title="Move down">↓</button>
      <button class="seg-del" title="Remove">✕</button>
    </div>`;
}

export function renderEditor(container: HTMLElement, segments: Segment[]): void {
  container.innerHTML = `
    <div class="seg-list">${segments.map(rowHtml).join('')}</div>
    <button class="seg-add">+ Add segment</button>`;
  const list = container.querySelector('.seg-list') as HTMLElement;

  container.querySelector('.seg-add')!.addEventListener('click', () => {
    list.insertAdjacentHTML(
      'beforeend',
      rowHtml({ id: makeId(), intensity: 'easy', durationSec: 30 }),
    );
  });

  list.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    const row = btn.closest('.seg-row') as HTMLElement;
    if (btn.classList.contains('seg-del')) row.remove();
    else if (btn.classList.contains('seg-up') && row.previousElementSibling)
      row.parentElement!.insertBefore(row, row.previousElementSibling);
    else if (btn.classList.contains('seg-down') && row.nextElementSibling)
      row.parentElement!.insertBefore(row.nextElementSibling, row);
  });
}

export function readEditor(container: HTMLElement): Segment[] {
  return Array.from(container.querySelectorAll('.seg-row')).map((row) => {
    const el = row as HTMLElement;
    const intensity = (el.querySelector('.seg-intensity') as HTMLSelectElement)
      .value as Intensity;
    const durationSec = Math.max(
      5,
      Math.round(Number((el.querySelector('.seg-dur') as HTMLInputElement).value) || 0),
    );
    return { id: el.dataset.id || makeId(), intensity, durationSec };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/segmentEditor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/segmentEditor.ts tests/segmentEditor.test.ts
git commit -m "feat: editable segment list with reorder and read-back"
```

---

## Task 12: Setup view + starter templates

Implements the rest of spec §8: starter templates, total-minutes + Generate/Regenerate, the editor, Save-as-template, prefs, and a Start button that hands the current segments to a callback.

**Files:**
- Create: `src/core/starters.ts`, `src/ui/setupView.ts`
- Test: `tests/setupView.test.ts`

- [ ] **Step 1: Write `src/core/starters.ts`**

```ts
import { Template, makeId } from './types';

/** Built-in starter templates so the app is usable before anything is saved. */
export function starterTemplates(): Template[] {
  return [
    {
      id: 'starter-quick20',
      name: 'Quick 20',
      segments: [
        { id: makeId(), intensity: 'easy', durationSec: 180 },
        { id: makeId(), intensity: 'hard', durationSec: 60 },
        { id: makeId(), intensity: 'medium', durationSec: 40 },
        { id: makeId(), intensity: 'hard', durationSec: 60 },
        { id: makeId(), intensity: 'medium', durationSec: 40 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 60 },
        { id: makeId(), intensity: 'hard', durationSec: 60 },
        { id: makeId(), intensity: 'medium', durationSec: 40 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 200 },
      ],
    },
    {
      id: 'starter-sprints',
      name: 'Short sprints',
      segments: [
        { id: makeId(), intensity: 'easy', durationSec: 180 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 30 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 30 },
        { id: makeId(), intensity: 'allout', durationSec: 30 },
        { id: makeId(), intensity: 'easy', durationSec: 150 },
      ],
    },
  ];
}
```

- [ ] **Step 2: Write the failing test**

`tests/setupView.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountSetup } from '../src/ui/setupView';
import { Storage, type KeyValueStore } from '../src/core/storage';

class Mem implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

let container: HTMLElement;
let storage: Storage;
beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  container = document.getElementById('app')!;
  storage = new Storage(new Mem());
});

describe('setup view', () => {
  it('lists starter templates', () => {
    mountSetup(container, { storage, onStart: () => {} });
    expect(container.textContent).toContain('Quick 20');
    expect(container.textContent).toContain('Short sprints');
  });

  it('Generate populates the editor with segments', () => {
    mountSetup(container, { storage, onStart: () => {} });
    (container.querySelector('.setup-minutes') as HTMLInputElement).value = '20';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    expect(container.querySelectorAll('.seg-row').length).toBeGreaterThan(0);
  });

  it('Start hands the current segments to onStart', () => {
    const onStart = vi.fn();
    mountSetup(container, { storage, onStart });
    (container.querySelector('.setup-minutes') as HTMLInputElement).value = '20';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    (container.querySelector('.setup-start') as HTMLButtonElement).click();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart.mock.calls[0][0].length).toBeGreaterThan(0);
  });

  it('Save persists the edited segments as a template', () => {
    mountSetup(container, { storage, onStart: () => {} });
    (container.querySelector('.setup-minutes') as HTMLInputElement).value = '20';
    (container.querySelector('.setup-generate') as HTMLButtonElement).click();
    (container.querySelector('.setup-name') as HTMLInputElement).value = 'My session';
    (container.querySelector('.setup-save') as HTMLButtonElement).click();
    expect(storage.listTemplates().some((t) => t.name === 'My session')).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/setupView.test.ts`
Expected: FAIL — cannot resolve `../src/ui/setupView`.

- [ ] **Step 4: Implement `src/ui/setupView.ts`**

```ts
import { Segment, Template, makeId } from '../core/types';
import { Storage, Density } from '../core/storage';
import { generate } from '../core/generator';
import { starterTemplates } from '../core/starters';
import { renderEditor, readEditor } from './segmentEditor';

export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[]) => void;
}

export function mountSetup(container: HTMLElement, opts: SetupOpts): void {
  const prefs = opts.storage.getPrefs();
  container.innerHTML = `
    <div class="setup">
      <h1>Workout Helper</h1>
      <section class="setup-templates"><h2>Templates</h2><div class="setup-tpl-list"></div></section>
      <section>
        <h2>Build</h2>
        <label>Total minutes
          <input class="setup-minutes" type="number" min="1" value="${prefs.lastTotalMin}" />
        </label>
        <button class="setup-generate">Generate</button>
        <button class="setup-regenerate">Regenerate</button>
        <div class="setup-editor"></div>
        <label>Name <input class="setup-name" type="text" placeholder="My session" /></label>
        <button class="setup-save">Save as template</button>
      </section>
      <section>
        <h2>Preferences</h2>
        <label>Density
          <select class="setup-density">
            <option value="pill" ${prefs.density === 'pill' ? 'selected' : ''}>Minimal</option>
            <option value="coach" ${prefs.density === 'coach' ? 'selected' : ''}>Coach</option>
          </select>
        </label>
        <label>Volume <input class="setup-volume" type="range" min="0" max="1" step="0.05" value="${prefs.volume}" /></label>
        <label><input class="setup-muted" type="checkbox" ${prefs.muted ? 'checked' : ''} /> Mute</label>
      </section>
      <button class="setup-start">▶ Start</button>
    </div>`;

  const editor = container.querySelector('.setup-editor') as HTMLElement;
  const minutesEl = container.querySelector('.setup-minutes') as HTMLInputElement;
  const nameEl = container.querySelector('.setup-name') as HTMLInputElement;
  let seed = 1;

  const doGenerate = () => {
    const mins = Math.max(1, Number(minutesEl.value) || 1);
    opts.storage.setPrefs({ lastTotalMin: mins });
    renderEditor(editor, generate(mins, {}, seed));
  };

  const renderTemplates = () => {
    const list = container.querySelector('.setup-tpl-list') as HTMLElement;
    const templates = [...starterTemplates(), ...opts.storage.listTemplates()];
    list.innerHTML = templates
      .map(
        (t) =>
          `<div class="setup-tpl" data-id="${t.id}">
             <button class="setup-load" data-id="${t.id}">${t.name}</button>
             <button class="setup-del" data-id="${t.id}">✕</button>
           </div>`,
      )
      .join('');
    list.querySelectorAll<HTMLButtonElement>('.setup-load').forEach((b) =>
      b.addEventListener('click', () => {
        const t = templates.find((x) => x.id === b.dataset.id);
        if (t) renderEditor(editor, t.segments.map((s) => ({ ...s, id: makeId() })));
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('.setup-del').forEach((b) =>
      b.addEventListener('click', () => {
        opts.storage.deleteTemplate(b.dataset.id!);
        renderTemplates();
      }),
    );
  };

  container.querySelector('.setup-generate')!.addEventListener('click', () => {
    seed = 1;
    doGenerate();
  });
  container.querySelector('.setup-regenerate')!.addEventListener('click', () => {
    seed += 1;
    doGenerate();
  });

  container.querySelector('.setup-save')!.addEventListener('click', () => {
    const segments = readEditor(editor);
    if (segments.length === 0) return;
    const tpl: Template = {
      id: makeId(),
      name: nameEl.value.trim() || 'Untitled',
      segments,
    };
    opts.storage.saveTemplate(tpl);
    renderTemplates();
  });

  container.querySelector('.setup-density')!.addEventListener('change', (e) => {
    opts.storage.setPrefs({ density: (e.target as HTMLSelectElement).value as Density });
  });
  container.querySelector('.setup-volume')!.addEventListener('input', (e) => {
    opts.storage.setPrefs({ volume: Number((e.target as HTMLInputElement).value) });
  });
  container.querySelector('.setup-muted')!.addEventListener('change', (e) => {
    opts.storage.setPrefs({ muted: (e.target as HTMLInputElement).checked });
  });

  container.querySelector('.setup-start')!.addEventListener('click', () => {
    const segments = readEditor(editor);
    if (segments.length === 0) return;
    opts.onStart(segments);
  });

  renderTemplates();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/setupView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all suites PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/starters.ts src/ui/setupView.ts tests/setupView.test.ts
git commit -m "feat: setup view with templates, generate, editor, prefs"
```

---

## Task 13: App wiring (main.ts), fallback, manual E2E + README

Wires everything per spec §10–§11: Start opens the overlay host, mounts the overlay, unlocks audio, runs the tick loop, routes engine events to audio, handles non-Chrome fallback, and reacts to the user closing the overlay window. This task is integration; the automated coverage is the full unit suite, and correctness is confirmed by the manual E2E checklist (spec §12).

**Files:**
- Modify: `src/main.ts`
- Create: `README.md`

- [ ] **Step 1: Implement `src/main.ts`**

```ts
import { Storage } from './core/storage';
import { SessionEngine } from './core/sessionEngine';
import { TonePlayer } from './core/audio';
import { Segment } from './core/types';
import { mountSetup } from './ui/setupView';
import { mountOverlay, MountedOverlay, OVERLAY_CSS } from './ui/overlayView';
import { isPipSupported } from './shell/overlayHost';
import { PipOverlayHost } from './shell/pipOverlayHost';

const app = document.querySelector<HTMLDivElement>('#app')!;
const storage = new Storage();
const tone = new TonePlayer();

let rafId = 0;
let mounted: MountedOverlay | null = null;
let fallbackEl: HTMLElement | null = null;

function wireAudio(engine: SessionEngine) {
  const prefs = storage.getPrefs();
  tone.setVolume(prefs.volume);
  tone.setMuted(prefs.muted);
  return engine.on((e) => {
    if (e.type === 'transition') tone.handleTransition(e.to.intensity);
    else if (e.type === 'countdown') tone.handleCountdown(e.next.intensity);
    else if (e.type === 'complete') tone.playComplete();
  });
}

function runLoop(engine: SessionEngine) {
  const step = () => {
    engine.tick();
    if (engine.getState().status === 'done') {
      cancelAnimationFrame(rafId);
      return;
    }
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

async function startSession(segments: Segment[]) {
  const engine = new SessionEngine(segments);
  const prefs = storage.getPrefs();
  tone.unlock(); // user gesture (Start click)
  wireAudio(engine);

  const overlayOpts = {
    density: prefs.density,
    onToggleDensity: () => {
      const next = storage.getPrefs().density === 'pill' ? 'coach' : 'pill';
      storage.setPrefs({ density: next });
      mounted?.setDensity(next);
    },
    onStop: () => endSession(),
  };

  if (isPipSupported()) {
    const host = new PipOverlayHost();
    const doc = await host.open({ width: 240, height: 220 });
    mounted = mountOverlay(doc, engine, overlayOpts);
    host.onClosed(() => engine.pause());
  } else {
    // In-page fallback overlay (non-Chrome): fixed in the corner of this page.
    fallbackEl = document.createElement('div');
    fallbackEl.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:2147483647;';
    const note = document.createElement('div');
    note.textContent =
      'Picture-in-Picture needs Chrome — running the overlay in-page instead.';
    note.style.cssText = 'font:12px system-ui;color:#b00;margin-bottom:8px;';
    document.body.append(note, fallbackEl);
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);
    mounted = mountOverlay(document, engine, overlayOpts);
    // mountOverlay appends to document.body; move it into the fixed container
    const root = document.body.querySelector('.ov-root');
    if (root) fallbackEl.appendChild(root);
  }

  engine.start();
  runLoop(engine);
}

function endSession() {
  cancelAnimationFrame(rafId);
  mounted?.unmount();
  mounted = null;
  fallbackEl?.remove();
  fallbackEl = null;
}

mountSetup(app, { storage, onStart: startSession });
```

- [ ] **Step 2: Typecheck and run the full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all suites PASS.

- [ ] **Step 3: Write `README.md`**

````markdown
# Workout Helper

A local web app that runs interval rowing workouts and shows a floating,
always-on-top overlay (intensity, countdown, recommended stroke rate, tone cues)
that rides over any video — including native macOS fullscreen — via Chrome's
Document Picture-in-Picture.

## Develop

```bash
npm install
npm run dev      # open the printed URL in Google Chrome
npm test         # run the unit suite
npm run typecheck
```

## Use

1. Open the app in **Chrome**.
2. Pick a template, or enter total minutes and **Generate** (**Regenerate** for a
   new mix). Optionally edit segments and **Save as template**.
3. Click **Start** — the overlay pops into a Picture-in-Picture window. Drag it to
   your preferred corner; it floats over fullscreen video.
4. Click the overlay to pause/resume; hover for previous/next/stop and the density
   toggle.

## Notes

- Document Picture-in-Picture is Chromium-only. Other browsers fall back to an
  in-page overlay.
- An Electron shell is designed for (see the spec, §2.1) as a drop-in fallback
  behind the same `OverlayHost` interface.
````

- [ ] **Step 4: Manual end-to-end verification (spec §12)**

Run: `npm run dev`, open the URL in Chrome, then verify:
1. Generate a 20-minute workout; the editor fills with a sensible mix (easy warmup, hard/all-out pushes with rests, easy cooldown).
2. Click **Start**; the PiP overlay appears showing the current intensity, recommended spm, and a counting-down timer.
3. Open a video in a native macOS app (Netflix.app / Apple TV / QuickTime), go fullscreen, and confirm the overlay stays on top.
4. Confirm tone cues: 3-2-1 beeps before a push, a rising tone entering hard/all-out, a softer tone entering a rest, a final tone at the end.
5. Click the overlay to pause (dimmed "PAUSED"); click to resume.
6. Hover and use ⏮ / ⏭ / ⏹ and the density toggle (Minimal ↔ Coach).
7. Save a template, reload the page, and confirm it still appears in the list.

Expected: all steps behave as described. Note any deviations as follow-up fixes.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts README.md
git commit -m "feat: wire setup → overlay session, fallback, and docs"
```

---

## Self-Review

**1. Spec coverage:**
- §1 overview / §10 flow → Task 13 wiring.
- §2 platform decision / §2.1 seam → Task 9 (`OverlayHost`, `PipOverlayHost`), Task 2 gate.
- §3 data model + intensity metadata (incl. spm) → Task 3.
- §4 generator (20–150s pushes, 0.5–1× rests, exact total, seeded) → Task 5.
- §5 session engine (injectable clock, transitions, countdown, skip, complete) → Task 6.
- §6 audio (3-2-1 beeps before pushes, rising/descending tones, complete, volume/mute, unlock on gesture) → Task 8 + Task 13 wiring.
- §7 overlay (pill/coach + toggle, color, spm, emphasized countdown, flash, click-to-pause, hover controls, paused state) → Task 10.
- §8 setup (templates, generate/regenerate, editor, save, prefs, Start gesture) → Tasks 11–12.
- §9 persistence (localStorage behind a wrapper) → Task 7.
- §11 edge cases (non-Chrome fallback, manual PiP close → pause, short totals, audio gesture, starter templates) → Tasks 5, 8, 12, 13.
- §12 testing (generator/engine/storage units + manual checklist) → Tasks 5, 6, 7, 13.
- §14 spike → Task 2.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"write tests for the above" — every code and test step contains complete content.

**3. Type consistency:** `Segment`/`Template`/`Intensity`/`INTENSITY_META`/`makeId` (types.ts) used identically downstream. `Density` defined in storage.ts, imported by overlayView/setupView/main. `SessionState`/`EngineEvent`/`Clock` (sessionEngine.ts) consumed by overlayView and main. `OverlayHost` (overlayHost.ts) implemented by PipOverlayHost and consumed by main. `renderEditor`/`readEditor` names match across Tasks 11–12. `mountOverlay`/`mountSetup`/`OVERLAY_CSS` names match across Tasks 10, 12, 13.
