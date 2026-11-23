import { describe, it, expect } from 'vitest';
import {
  exportWorkout,
  parseWorkout,
  SHARE_FORMAT,
  SHARE_VERSION,
  MAX_INPUT_BYTES,
  MAX_NAME_LENGTH,
  MAX_SEGMENTS,
  type ParseResult,
} from '../src/core/shareFormat';
import { Segment } from '../src/core/types';
import { starterTemplates } from '../src/core/starters';
import { generate } from '../src/core/generator';

const segs: Segment[] = [
  { id: 'a', intensity: 'easy', durationSec: 120 },
  { id: 'b', intensity: 'medium', durationSec: 60, label: 'Build' },
  { id: 'c', intensity: 'hard', durationSec: 45 },
  { id: 'd', intensity: 'allout', durationSec: 15, label: 'Sprint' },
];

/** Segments without their ids, the part a share must carry over unchanged. */
const strip = (list: Segment[]) => list.map(({ id: _id, ...rest }) => rest);

/** A raw payload, for hand-building good and bad inputs. */
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: 'rowalong-workout',
    version: 1,
    name: 'Shared',
    segments: [{ intensity: 'easy', durationSec: 60 }],
    ...over,
  });

const withSegment = (seg: unknown) => payload({ segments: [seg] });

function expectOk(r: ParseResult) {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r.workout;
}

function expectError(r: ParseResult): string {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error('expected an error');
  expect(r.error.length).toBeGreaterThan(0);
  expect(r).not.toHaveProperty('workout');
  return r.error;
}

describe('exportWorkout', () => {
  it('produces a versioned rowalong-workout payload with the name and segments', () => {
    expect(JSON.parse(exportWorkout('Pyramid', segs))).toEqual({
      format: 'rowalong-workout',
      version: 1,
      name: 'Pyramid',
      segments: [
        { intensity: 'easy', durationSec: 120 },
        { intensity: 'medium', durationSec: 60, label: 'Build' },
        { intensity: 'hard', durationSec: 45 },
        { intensity: 'allout', durationSec: 15, label: 'Sprint' },
      ],
    });
  });

  it('exposes the format tag and version it writes', () => {
    expect(SHARE_FORMAT).toBe('rowalong-workout');
    expect(SHARE_VERSION).toBe(1);
  });

  it('leaves segment ids out of the payload', () => {
    expect(exportWorkout('Pyramid', segs)).not.toContain('"id"');
  });

  it('omits label when a segment has none', () => {
    const [first] = JSON.parse(exportWorkout('One', [segs[0]])).segments;
    expect(Object.keys(first)).toEqual(['intensity', 'durationSec']);
  });

  it('drops fields a segment carries beyond the share format', () => {
    const extra = { ...segs[0], color: 'red' } as Segment;
    const [first] = JSON.parse(exportWorkout('One', [extra])).segments;
    expect(first).toEqual({ intensity: 'easy', durationSec: 120 });
  });

  it('is human-readable (indented), for a file or pasted text', () => {
    expect(exportWorkout('Pyramid', segs)).toContain('\n  "segments": [');
  });

  it('does not change the segments it is given', () => {
    const before = JSON.stringify(segs);
    exportWorkout('Pyramid', segs);
    expect(JSON.stringify(segs)).toBe(before);
  });
});

describe('parseWorkout round-trip', () => {
  it('loads identical segments and the name from an export', () => {
    const w = expectOk(parseWorkout(exportWorkout('Pyramid', segs)));
    expect(w.name).toBe('Pyramid');
    expect(strip(w.segments)).toEqual(strip(segs));
  });

  it('gives every segment a fresh, unique id', () => {
    const w = expectOk(parseWorkout(exportWorkout('Pyramid', segs)));
    const ids = w.segments.map((s) => s.id);
    for (const id of ids) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      expect(segs.map((s) => s.id)).not.toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives new ids on every import of the same text', () => {
    const text = exportWorkout('Pyramid', segs);
    const a = expectOk(parseWorkout(text)).segments.map((s) => s.id);
    const b = expectOk(parseWorkout(text)).segments.map((s) => s.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it('round-trips every built-in starter template', () => {
    for (const t of starterTemplates()) {
      const w = expectOk(parseWorkout(exportWorkout(t.name, t.segments)));
      expect(w.name).toBe(t.name);
      expect(strip(w.segments)).toEqual(strip(t.segments));
    }
  });

  it('round-trips generated workouts of every supported length', () => {
    for (const min of [10, 20, 30]) {
      const g = generate(min, undefined, 42);
      const w = expectOk(parseWorkout(exportWorkout(`${min} min`, g)));
      expect(strip(w.segments)).toEqual(strip(g));
    }
  });

  it('keeps a name and labels with HTML, quotes and unicode verbatim, as plain data', () => {
    const name = '<img src=x onerror="alert(1)"> Café 🚣 “quoted” \\ back';
    const label = '<b>bold</b> & </script>';
    const w = expectOk(
      parseWorkout(exportWorkout(name, [{ id: 'x', intensity: 'hard', durationSec: 30, label }])),
    );
    expect(w.name).toBe(name);
    expect(w.segments[0].label).toBe(label);
  });

  it('keeps an empty label as an empty label', () => {
    const w = expectOk(
      parseWorkout(exportWorkout('E', [{ id: 'x', intensity: 'easy', durationSec: 5, label: '' }])),
    );
    expect(w.segments[0]).toHaveProperty('label', '');
  });

  it('leaves label off a segment that has none', () => {
    const w = expectOk(parseWorkout(exportWorkout('One', [segs[0]])));
    expect(w.segments[0]).not.toHaveProperty('label');
  });
});

describe('parseWorkout accepts', () => {
  it('compact JSON and JSON padded with whitespace', () => {
    expect(expectOk(parseWorkout(payload())).name).toBe('Shared');
    expect(expectOk(parseWorkout(`\n\t  ${payload()}  \n`)).name).toBe('Shared');
  });

  it('an empty name (the builder supplies a fallback)', () => {
    expect(expectOk(parseWorkout(payload({ name: '' }))).name).toBe('');
  });

  it(`a name of exactly ${MAX_NAME_LENGTH} characters`, () => {
    const name = 'n'.repeat(MAX_NAME_LENGTH);
    expect(expectOk(parseWorkout(payload({ name }))).name).toBe(name);
  });

  it('a name of 80 emoji, counting characters rather than UTF-16 units', () => {
    const name = '🚣'.repeat(80);
    expect(expectOk(parseWorkout(payload({ name }))).name).toBe(name);
  });

  it('the shortest and longest durations, 5 s and 3600 s', () => {
    for (const durationSec of [5, 3600]) {
      const w = expectOk(parseWorkout(withSegment({ intensity: 'easy', durationSec })));
      expect(w.segments[0].durationSec).toBe(durationSec);
    }
  });

  it('every intensity', () => {
    for (const intensity of ['easy', 'medium', 'hard', 'allout']) {
      const w = expectOk(parseWorkout(withSegment({ intensity, durationSec: 60 })));
      expect(w.segments[0].intensity).toBe(intensity);
    }
  });

  it(`exactly ${MAX_SEGMENTS} segments`, () => {
    const many = Array.from({ length: MAX_SEGMENTS }, () => ({ intensity: 'easy', durationSec: 5 }));
    expect(expectOk(parseWorkout(payload({ segments: many }))).segments).toHaveLength(MAX_SEGMENTS);
  });

  it('input one byte under the size limit', () => {
    const base = payload();
    const text = base + ' '.repeat(MAX_INPUT_BYTES - 1 - base.length);
    expect(new TextEncoder().encode(text).length).toBe(MAX_INPUT_BYTES - 1);
    expect(parseWorkout(text).ok).toBe(true);
  });

  it('and ignores fields beyond the format, giving fresh ids over any ids in the file', () => {
    const w = expectOk(
      parseWorkout(
        payload({
          extra: true,
          segments: [{ id: 'from-file', intensity: 'easy', durationSec: 60, color: 'red' }],
        }),
      ),
    );
    expect(w).toEqual({ name: 'Shared', segments: [{ id: w.segments[0].id, intensity: 'easy', durationSec: 60 }] });
    expect(w.segments[0].id).not.toBe('from-file');
  });
});

describe('parseWorkout rejects', () => {
  it('text that is not JSON', () => {
    for (const text of ['', '   ', 'hello', '{', '{"format":', "{'format':'rowalong-workout'}"]) {
      expect(expectError(parseWorkout(text))).toMatch(/JSON/);
    }
  });

  it('a truncated export', () => {
    const text = exportWorkout('Pyramid', segs);
    expectError(parseWorkout(text.slice(0, text.length - 10)));
  });

  it('JSON that is not an object', () => {
    for (const text of ['null', '[]', '42', '"rowalong-workout"', 'true', '[{"format":"rowalong-workout"}]']) {
      expect(expectError(parseWorkout(text))).toMatch(/not a Rowalong workout/i);
    }
  });

  it('a missing or wrong format tag', () => {
    const noFormat = JSON.stringify({ version: 1, name: 'x', segments: [] });
    expect(expectError(parseWorkout(noFormat))).toMatch(/not a Rowalong workout/i);
    for (const format of ['rowalong-template', 'Rowalong-Workout', 1, null]) {
      expect(expectError(parseWorkout(payload({ format })))).toMatch(/not a Rowalong workout/i);
    }
  });

  it('a wrong or missing version', () => {
    for (const version of [0, '1', 1.5, null, -1]) {
      expect(expectError(parseWorkout(payload({ version })))).toMatch(/version/i);
    }
    const noVersion = JSON.stringify({ format: 'rowalong-workout', name: 'x', segments: [] });
    expect(expectError(parseWorkout(noVersion))).toMatch(/version/i);
  });

  it('a newer version, saying so', () => {
    const msg = expectError(parseWorkout(payload({ version: 2 })));
    expect(msg).toMatch(/version 2/);
    expect(msg).toMatch(/newer/i);
  });

  it('a missing name, or one that is not text', () => {
    const noName = JSON.stringify({ format: 'rowalong-workout', version: 1, segments: [] });
    expect(expectError(parseWorkout(noName))).toMatch(/name/i);
    for (const name of [42, null, ['a'], { a: 1 }]) {
      expect(expectError(parseWorkout(payload({ name })))).toMatch(/name/i);
    }
  });

  it(`a name over ${MAX_NAME_LENGTH} characters`, () => {
    const msg = expectError(parseWorkout(payload({ name: 'n'.repeat(MAX_NAME_LENGTH + 1) })));
    expect(msg).toMatch(/name/i);
    expect(msg).toMatch(/80/);
  });

  it('a missing segment list, or one that is not a list', () => {
    const noSegs = JSON.stringify({ format: 'rowalong-workout', version: 1, name: 'x' });
    expect(expectError(parseWorkout(noSegs))).toMatch(/segment/i);
    for (const segments of [null, 'easy', { 0: { intensity: 'easy', durationSec: 60 } }, 3]) {
      expect(expectError(parseWorkout(payload({ segments })))).toMatch(/segment/i);
    }
  });

  it('no segments', () => {
    expect(expectError(parseWorkout(payload({ segments: [] })))).toMatch(/1 to 200 segments/);
  });

  it(`more than ${MAX_SEGMENTS} segments`, () => {
    const many = Array.from({ length: MAX_SEGMENTS + 1 }, () => ({ intensity: 'easy', durationSec: 5 }));
    expect(expectError(parseWorkout(payload({ segments: many })))).toMatch(/1 to 200 segments/);
  });

  it('a segment that is not an object', () => {
    for (const seg of [null, 5, 'easy', [{ intensity: 'easy', durationSec: 60 }]]) {
      expect(expectError(parseWorkout(withSegment(seg)))).toMatch(/segment 1/i);
    }
  });

  it('an unknown or missing intensity', () => {
    for (const intensity of ['warp', 'Easy', 'all-out', '', 'toString', '__proto__', 'constructor', 3, null]) {
      const msg = expectError(parseWorkout(withSegment({ intensity, durationSec: 60 })));
      expect(msg).toMatch(/segment 1/i);
      expect(msg).toMatch(/intensity/i);
    }
    expectError(parseWorkout(withSegment({ durationSec: 60 })));
  });

  it('a duration that is not a whole multiple of 5 s from 5 to 3600 s', () => {
    for (const durationSec of [0, 4, 7, 62, 3601, 3605, 7200, -5, 60.5, 1e9, '60', null, true]) {
      const msg = expectError(parseWorkout(withSegment({ intensity: 'easy', durationSec })));
      expect(msg).toMatch(/segment 1/i);
      expect(msg).toMatch(/duration/i);
    }
    expectError(parseWorkout(withSegment({ intensity: 'easy' })));
  });

  it('a label that is not text', () => {
    for (const label of [5, null, true, ['a'], { text: 'a' }]) {
      const msg = expectError(parseWorkout(withSegment({ intensity: 'easy', durationSec: 60, label })));
      expect(msg).toMatch(/segment 1/i);
      expect(msg).toMatch(/label/i);
    }
  });

  it('the whole workout when only one segment is bad, naming that segment', () => {
    const list = Array.from({ length: 10 }, () => ({ intensity: 'easy', durationSec: 60 }));
    list[6] = { intensity: 'easy', durationSec: 61 };
    expect(expectError(parseWorkout(payload({ segments: list })))).toMatch(/segment 7\b/i);
  });

  it(`input of ${MAX_INPUT_BYTES / 1024} KB or more, before reading it`, () => {
    expect(MAX_INPUT_BYTES).toBe(100 * 1024);
    const base = payload();
    const exact = base + ' '.repeat(MAX_INPUT_BYTES - base.length);
    expect(expectError(parseWorkout(exact))).toMatch(/100 KB/);
    // Way over, and not even JSON: still reported as too large.
    expect(expectError(parseWorkout('x'.repeat(5 * MAX_INPUT_BYTES)))).toMatch(/100 KB/);
  });

  it('input that reaches 100 KB in UTF-8 bytes though it has fewer characters', () => {
    // 'é' is one UTF-16 unit but two UTF-8 bytes, so this is ~60k characters.
    const base = payload();
    const pad = Math.ceil((MAX_INPUT_BYTES - base.length) / 2);
    const text = payload({ pad: 'é'.repeat(pad) });
    expect(text.length).toBeLessThan(MAX_INPUT_BYTES);
    expect(expectError(parseWorkout(text))).toMatch(/100 KB/);
  });

  it('without echoing text from the input in the message', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const cases = [
      withSegment({ intensity: evil, durationSec: 60 }),
      withSegment({ intensity: 'easy', durationSec: evil }),
      payload({ format: evil }),
      payload({ version: evil }),
      payload({ name: evil.repeat(10) }),
    ];
    for (const text of cases) expect(expectError(parseWorkout(text))).not.toContain('<');
  });
});
