import { describe, it, expect } from 'vitest';
import {
  exportWorkout,
  parseWorkout,
  SHARE_FORMAT,
  SHARE_VERSION,
  SHARE_LIMITS,
  type ParseWorkoutResult,
  type SharedWorkout,
} from '../src/core/shareFormat';
import { starterTemplates } from '../src/core/starters';
import type { Segment } from '../src/core/types';

const segs: Segment[] = [
  { id: 'a', intensity: 'easy', durationSec: 120 },
  { id: 'b', intensity: 'hard', durationSec: 90, label: 'Sprint 1' },
  { id: 'c', intensity: 'allout', durationSec: 30 },
  { id: 'd', intensity: 'medium', durationSec: 60 },
];

/** A valid payload object; tests tweak one field to make it bad. */
const payload = (over: Record<string, unknown> = {}) => ({
  format: 'rowalong-workout',
  version: 1,
  name: 'Quick 20',
  segments: [
    { intensity: 'easy', durationSec: 120 },
    { intensity: 'hard', durationSec: 90, label: 'Sprint 1' },
  ],
  ...over,
});

const text = (over: Record<string, unknown> = {}) => JSON.stringify(payload(over));

const seg = (over: Record<string, unknown> = {}) => ({
  intensity: 'easy',
  durationSec: 60,
  ...over,
});

/** Parses and asserts success, returning the workout. */
function ok(result: ParseWorkoutResult): SharedWorkout {
  if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
  return result.workout;
}

/** Parses and asserts failure, returning the message. */
function err(result: ParseWorkoutResult): string {
  if (result.ok) throw new Error('expected an error, got ok');
  return result.error;
}

const strip = (s: Segment[]) => s.map(({ id: _id, ...rest }) => rest);

describe('exportWorkout', () => {
  it('produces the versioned rowalong-workout payload', () => {
    const out = JSON.parse(exportWorkout('Quick 20', segs));
    expect(out).toEqual({
      format: 'rowalong-workout',
      version: 1,
      name: 'Quick 20',
      segments: [
        { intensity: 'easy', durationSec: 120 },
        { intensity: 'hard', durationSec: 90, label: 'Sprint 1' },
        { intensity: 'allout', durationSec: 30 },
        { intensity: 'medium', durationSec: 60 },
      ],
    });
  });

  it('exposes the format tag and version as constants', () => {
    expect(SHARE_FORMAT).toBe('rowalong-workout');
    expect(SHARE_VERSION).toBe(1);
  });

  it('never includes segment ids', () => {
    const out = exportWorkout('X', segs);
    expect(out).not.toContain('"id"');
    for (const s of JSON.parse(out).segments) expect(s).not.toHaveProperty('id');
  });

  it('omits label when a segment has none, keeps it when it does', () => {
    const out = JSON.parse(exportWorkout('X', segs)).segments;
    expect(out[0]).not.toHaveProperty('label');
    expect(out[1].label).toBe('Sprint 1');
  });

  it('drops any extra properties a segment object carries', () => {
    const extra = [{ ...segs[0], color: 'red' } as Segment];
    expect(JSON.parse(exportWorkout('X', extra)).segments[0]).toEqual({
      intensity: 'easy',
      durationSec: 120,
    });
  });

  it('puts format and version first so the file is recognisable at a glance', () => {
    expect(Object.keys(JSON.parse(exportWorkout('X', segs)))).toEqual([
      'format',
      'version',
      'name',
      'segments',
    ]);
  });

  it('is pretty-printed for a readable .json file', () => {
    expect(exportWorkout('X', segs)).toContain('\n  "format": "rowalong-workout"');
  });

  it('does not mutate its input', () => {
    const copy = structuredClone(segs);
    exportWorkout('X', segs);
    expect(segs).toEqual(copy);
  });
});

describe('parseWorkout round-trip', () => {
  it('reads back the name and identical segments', () => {
    const w = ok(parseWorkout(exportWorkout('Quick 20', segs)));
    expect(w.name).toBe('Quick 20');
    expect(strip(w.segments)).toEqual(strip(segs));
  });

  it('gives every segment a fresh id', () => {
    const w = ok(parseWorkout(exportWorkout('X', segs)));
    const ids = w.segments.map((s) => s.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(segs.map((s) => s.id)).not.toContain(id);
  });

  it('uses the injected id factory when given', () => {
    let n = 0;
    const w = ok(parseWorkout(exportWorkout('X', segs), () => `id-${n++}`));
    expect(w.segments.map((s) => s.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3']);
  });

  it('ignores ids present in the input and issues fresh ones', () => {
    const w = ok(
      parseWorkout(text({ segments: [seg({ id: 'evil' })] }), () => 'fresh'),
    );
    expect(w.segments[0].id).toBe('fresh');
  });

  it('round-trips every built-in starter', () => {
    for (const t of starterTemplates()) {
      const w = ok(parseWorkout(exportWorkout(t.name, t.segments)));
      expect(w.name).toBe(t.name);
      expect(strip(w.segments)).toEqual(strip(t.segments));
    }
  });

  it('keeps a name or label containing HTML verbatim (escaping is the renderer’s job)', () => {
    const name = '<img src=x onerror=alert(1)>';
    const label = '<b>bold</b> & "quoted"';
    const w = ok(
      parseWorkout(exportWorkout(name, [{ id: 'a', intensity: 'easy', durationSec: 5, label }])),
    );
    expect(w.name).toBe(name);
    expect(w.segments[0].label).toBe(label);
  });

  it('keeps unicode in the name and labels', () => {
    const name = 'Ruderkönig 🚣 – 20′';
    const w = ok(
      parseWorkout(
        exportWorkout(name, [{ id: 'a', intensity: 'easy', durationSec: 5, label: '全力' }]),
      ),
    );
    expect(w.name).toBe(name);
    expect(w.segments[0].label).toBe('全力');
  });

  it('accepts compact JSON and surrounding whitespace (pasted text)', () => {
    expect(ok(parseWorkout(`\n  ${text()}  \n`)).name).toBe('Quick 20');
  });

  it('accepts a leading byte-order mark (files saved by some editors)', () => {
    expect(ok(parseWorkout(`﻿${text()}`)).name).toBe('Quick 20');
  });

  it('ignores unknown extra fields', () => {
    const w = ok(
      parseWorkout(text({ author: 'Song', segments: [seg({ note: 'hi' })] }), () => 'n'),
    );
    expect(w).toEqual({
      name: 'Quick 20',
      segments: [{ id: 'n', intensity: 'easy', durationSec: 60 }],
    });
  });

  it('returns only the fields it validated', () => {
    const w = ok(parseWorkout(text({ extra: 1 })));
    expect(Object.keys(w).sort()).toEqual(['name', 'segments']);
  });
});

describe('parseWorkout bounds (accepted at the edge)', () => {
  it('accepts the shortest and longest durations', () => {
    const w = ok(
      parseWorkout(text({ segments: [seg({ durationSec: 5 }), seg({ durationSec: 3600 })] })),
    );
    expect(w.segments.map((s) => s.durationSec)).toEqual([5, 3600]);
  });

  it('accepts exactly 1 and exactly 200 segments', () => {
    expect(ok(parseWorkout(text({ segments: [seg()] }))).segments).toHaveLength(1);
    const many = Array.from({ length: 200 }, () => seg());
    expect(ok(parseWorkout(text({ segments: many }))).segments).toHaveLength(200);
  });

  it('accepts a name of exactly 80 characters, counting an emoji as one', () => {
    expect(ok(parseWorkout(text({ name: 'a'.repeat(80) }))).name).toHaveLength(80);
    const emoji = '🚣'.repeat(80); // 160 UTF-16 code units, 80 characters
    expect(ok(parseWorkout(text({ name: emoji }))).name).toBe(emoji);
  });

  it('accepts an empty name (the builder can name it before saving)', () => {
    expect(ok(parseWorkout(text({ name: '' }))).name).toBe('');
  });

  it('accepts input just under 100 KB', () => {
    const base = text({ name: 'x', segments: [seg({ label: '' })] });
    const pad = SHARE_LIMITS.maxInputBytes - 1 - new TextEncoder().encode(base).length;
    const big = text({ name: 'x', segments: [seg({ label: 'L'.repeat(pad) })] });
    expect(new TextEncoder().encode(big).length).toBe(SHARE_LIMITS.maxInputBytes - 1);
    expect(parseWorkout(big).ok).toBe(true);
  });

  it('documents the limits it enforces', () => {
    expect(SHARE_LIMITS).toEqual({
      maxNameLength: 80,
      minSegments: 1,
      maxSegments: 200,
      minDurationSec: 5,
      maxDurationSec: 3600,
      durationStepSec: 5,
      maxInputBytes: 100 * 1024,
    });
  });
});

describe('parseWorkout rejection', () => {
  it('rejects text that is not JSON', () => {
    expect(err(parseWorkout('not json'))).toMatch(/not valid JSON/i);
    expect(err(parseWorkout(''))).toMatch(/not valid JSON/i);
    expect(err(parseWorkout(text().slice(0, -5)))).toMatch(/not valid JSON/i); // truncated
  });

  it('rejects JSON that is not an object', () => {
    for (const t of ['null', '42', '"rowalong-workout"', '[]', JSON.stringify([payload()])]) {
      expect(err(parseWorkout(t))).toMatch(/not a RowAlong workout/i);
    }
  });

  it('rejects a missing or wrong format tag', () => {
    const { format: _f, ...noFormat } = payload();
    expect(err(parseWorkout(JSON.stringify(noFormat)))).toMatch(/not a RowAlong workout/i);
    expect(err(parseWorkout(text({ format: 'rowalong-template' })))).toMatch(
      /not a RowAlong workout/i,
    );
    // A saved Template (the storage shape) is not a share payload.
    const tpl = { id: 't', name: 'X', segments: [{ id: 'a', intensity: 'easy', durationSec: 60 }] };
    expect(err(parseWorkout(JSON.stringify(tpl)))).toMatch(/not a RowAlong workout/i);
  });

  it('rejects a newer version with a message naming it', () => {
    const e = err(parseWorkout(text({ version: 2 })));
    expect(e).toMatch(/version 2/);
    expect(e).toMatch(/newer/i);
  });

  it('rejects a missing, malformed or older version', () => {
    const { version: _v, ...noVersion } = payload();
    expect(err(parseWorkout(JSON.stringify(noVersion)))).toMatch(/version/i);
    for (const v of ['1', 0, 1.5, null, -1]) {
      expect(err(parseWorkout(text({ version: v })))).toMatch(/version/i);
    }
  });

  it('rejects a missing or non-string name', () => {
    const { name: _n, ...noName } = payload();
    expect(err(parseWorkout(JSON.stringify(noName)))).toMatch(/name/i);
    for (const n of [42, null, ['x'], { a: 1 }]) {
      expect(err(parseWorkout(text({ name: n })))).toMatch(/name/i);
    }
  });

  it('rejects a name over 80 characters', () => {
    const e = err(parseWorkout(text({ name: 'a'.repeat(81) })));
    expect(e).toMatch(/name/i);
    expect(e).toMatch(/80/);
  });

  it('rejects missing or non-array segments', () => {
    const { segments: _s, ...noSegs } = payload();
    expect(err(parseWorkout(JSON.stringify(noSegs)))).toMatch(/segments/i);
    for (const s of [null, {}, 'easy', 5]) {
      expect(err(parseWorkout(text({ segments: s })))).toMatch(/segments/i);
    }
  });

  it('rejects zero segments or more than 200', () => {
    expect(err(parseWorkout(text({ segments: [] })))).toMatch(/1 and 200 segments/);
    const many = Array.from({ length: 201 }, () => seg());
    expect(err(parseWorkout(text({ segments: many })))).toMatch(/1 and 200 segments/);
  });

  it('rejects a segment that is not an object, naming its position', () => {
    for (const s of [null, 5, 'easy', [seg()]]) {
      expect(err(parseWorkout(text({ segments: [seg(), s] })))).toMatch(/segment 2/i);
    }
  });

  it('rejects an unknown or missing intensity, naming it', () => {
    const e = err(parseWorkout(text({ segments: [seg(), seg(), seg({ intensity: 'sprint' })] })));
    expect(e).toMatch(/segment 3/i);
    expect(e).toMatch(/sprint/);
    expect(err(parseWorkout(text({ segments: [{ durationSec: 60 }] })))).toMatch(/intensity/i);
    // Inherited object keys are not intensities.
    for (const i of ['toString', '__proto__', 'constructor', 'Easy', 5, null]) {
      expect(err(parseWorkout(text({ segments: [seg({ intensity: i })] })))).toMatch(
        /intensity/i,
      );
    }
  });

  it('rejects a duration that is not a multiple of 5 s', () => {
    for (const d of [7, 62, 3599, 12.5]) {
      const e = err(parseWorkout(text({ segments: [seg({ durationSec: d })] })));
      expect(e).toMatch(/segment 1/i);
      expect(e).toMatch(/multiple of 5/);
    }
  });

  it('rejects a duration outside 5 to 3600 s', () => {
    for (const d of [0, -5, 3605, 7200]) {
      expect(err(parseWorkout(text({ segments: [seg({ durationSec: d })] })))).toMatch(
        /between 5 and 3600/,
      );
    }
  });

  it('rejects a missing or non-numeric duration', () => {
    for (const d of ['60', null, true, undefined]) {
      expect(err(parseWorkout(text({ segments: [seg({ durationSec: d })] })))).toMatch(
        /duration/i,
      );
    }
  });

  it('rejects a label that is not a string', () => {
    for (const l of [5, null, ['x'], { t: 'x' }]) {
      const e = err(parseWorkout(text({ segments: [seg({ label: l })] })));
      expect(e).toMatch(/segment 1/i);
      expect(e).toMatch(/label/i);
    }
  });

  it('rejects input of 100 KB or more, before parsing it', () => {
    const base = text({ name: 'x', segments: [seg({ label: '' })] });
    const pad = SHARE_LIMITS.maxInputBytes - new TextEncoder().encode(base).length;
    const exact = text({ name: 'x', segments: [seg({ label: 'L'.repeat(pad) })] });
    expect(new TextEncoder().encode(exact).length).toBe(SHARE_LIMITS.maxInputBytes);
    expect(err(parseWorkout(exact))).toMatch(/100 KB/);
    // Huge garbage is reported as too large, not as bad JSON.
    expect(err(parseWorkout('x'.repeat(200 * 1024)))).toMatch(/100 KB/);
  });

  it('measures size in UTF-8 bytes, not characters', () => {
    // 40,000 three-byte characters: 40k UTF-16 units but ~120 KB on disk.
    const label = '全'.repeat(40_000);
    const big = text({ segments: [seg({ label })] });
    expect(big.length).toBeLessThan(SHARE_LIMITS.maxInputBytes);
    expect(err(parseWorkout(big))).toMatch(/100 KB/);
  });

  it('rejects the whole workout when only one segment is bad', () => {
    const r = parseWorkout(
      text({ segments: [seg(), seg(), seg({ durationSec: 7 }), seg(), seg()] }),
    );
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('workout');
  });

  it('reports errors as one readable sentence', () => {
    const cases = [
      'nope',
      'null',
      text({ format: 'x' }),
      text({ version: 9 }),
      text({ name: 'a'.repeat(81) }),
      text({ segments: [] }),
      text({ segments: [seg({ intensity: 'x' })] }),
      text({ segments: [seg({ durationSec: 7 })] }),
      text({ segments: [seg({ label: 1 })] }),
      'x'.repeat(200 * 1024),
    ];
    for (const c of cases) {
      const e = err(parseWorkout(c));
      expect(e.length).toBeGreaterThan(10);
      expect(e.length).toBeLessThan(160);
      expect(e).toMatch(/^[A-Z]/);
      expect(e).toMatch(/\.$/);
    }
  });
});
