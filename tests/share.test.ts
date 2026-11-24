import { describe, it, expect } from 'vitest';
import {
  SHARE_BASE_URL,
  SHARE_ID_LENGTH,
  MAX_SHARE_SEGMENTS,
  MAX_SHARE_NAME_LENGTH,
  MAX_SHARE_LABEL_LENGTH,
  MAX_SHARE_TOTAL_SEC,
  MAX_SHARE_BYTES,
  type SharedWorkout,
  validateSharedWorkout,
  parseSharedWorkout,
  serializeSharedWorkout,
  shareIdFor,
  isShareId,
  shareUrlFor,
  deepLinkFor,
  parseShareLink,
  toSharedWorkout,
  fromSharedWorkout,
} from '../src/core/share';
import { generate } from '../src/core/generator';
import { PUSH_STYLES } from '../src/core/pushStyles';
import { starterTemplates } from '../src/core/starters';
import type { Segment } from '../src/core/types';

const workout = (over: Partial<SharedWorkout> = {}): SharedWorkout => ({
  version: 1,
  name: 'Quick 20',
  segments: [
    { intensity: 'easy', durationSec: 120 },
    { intensity: 'allout', durationSec: 30, label: 'Sprint' },
  ],
  ...over,
});

/** Validate and unwrap, failing the test with the error if it didn't pass. */
const valid = (input: unknown): SharedWorkout => {
  const r = validateSharedWorkout(input);
  if (!r.ok) throw new Error(`expected valid, got: ${r.error}`);
  return r.workout;
};

const errorOf = (input: unknown): string => {
  const r = validateSharedWorkout(input);
  if (r.ok) throw new Error('expected invalid, got ok');
  return r.error;
};

const segs = (n: number, durationSec = 5) =>
  Array.from({ length: n }, () => ({ intensity: 'easy', durationSec }));

describe('SHARE_BASE_URL', () => {
  it('is the landing page origin, https, with no trailing slash', () => {
    expect(SHARE_BASE_URL).toBe('https://rowalong.endlessrainstudio.com');
  });
});

describe('validateSharedWorkout', () => {
  it('accepts a well-formed workout and returns an equal copy', () => {
    const w = workout();
    expect(valid(w)).toEqual(w);
    expect(valid(w)).not.toBe(w);
  });

  it('keeps only the known fields (no ids, no extras)', () => {
    const out = valid({
      version: 1,
      name: 'X',
      extra: 'junk',
      segments: [{ id: 'abc', intensity: 'hard', durationSec: 60, colour: 'red' }],
    });
    expect(out).toEqual({ version: 1, name: 'X', segments: [{ intensity: 'hard', durationSec: 60 }] });
  });

  it('trims the name and labels, and drops an empty label', () => {
    const out = valid({
      version: 1,
      name: '  Pyramid  ',
      segments: [
        { intensity: 'easy', durationSec: 60, label: '  Row  ' },
        { intensity: 'easy', durationSec: 60, label: '   ' },
      ],
    });
    expect(out.name).toBe('Pyramid');
    expect(out.segments[0].label).toBe('Row');
    expect(out.segments[1]).not.toHaveProperty('label');
  });

  it.each([null, undefined, 42, 'str', [], true])('rejects a non-object payload: %j', (input) => {
    expect(errorOf(input)).toMatch(/workout/i);
  });

  it.each([undefined, 0, 2, '1'])('rejects version %j', (version) => {
    expect(errorOf({ ...workout(), version })).toMatch(/version/i);
  });

  it.each([undefined, 7, '', '   '])('rejects a missing or blank name: %j', (name) => {
    expect(errorOf({ ...workout(), name })).toMatch(/name/i);
  });

  it('caps the name length in characters, not UTF-16 units', () => {
    expect(valid(workout({ name: 'a'.repeat(MAX_SHARE_NAME_LENGTH) })).name).toHaveLength(
      MAX_SHARE_NAME_LENGTH,
    );
    expect(errorOf(workout({ name: 'a'.repeat(MAX_SHARE_NAME_LENGTH + 1) }))).toMatch(/name/i);
    // Each rower emoji is one character but two UTF-16 units.
    expect(valid(workout({ name: '🚣'.repeat(MAX_SHARE_NAME_LENGTH) })).name).toBeTruthy();
  });

  it.each(['Line\nbreak', 'Nul\u0000', 'Tab\there', 'C1\u0085'])(
    'rejects control characters in the name: %j',
    (name) => {
      expect(errorOf(workout({ name }))).toMatch(/name/i);
    },
  );

  it('rejects a lone surrogate in the name', () => {
    expect(errorOf(workout({ name: 'bad \ud800 half' }))).toMatch(/name/i);
  });

  it('allows ordinary punctuation and non-Latin text in the name', () => {
    for (const name of ['Sprints & recovery', '<30s "fast" ones', 'Rudertraining — 20′', '漕艇 20']) {
      expect(valid(workout({ name })).name).toBe(name);
    }
  });

  it.each([undefined, 'nope', {}, null])('rejects segments that are not an array: %j', (segments) => {
    expect(errorOf({ ...workout(), segments })).toMatch(/segment/i);
  });

  it('rejects an empty segment list', () => {
    expect(errorOf(workout({ segments: [] }))).toMatch(/segment/i);
  });

  it(`caps the segment count at ${MAX_SHARE_SEGMENTS}`, () => {
    expect(valid({ ...workout(), segments: segs(MAX_SHARE_SEGMENTS) }).segments).toHaveLength(
      MAX_SHARE_SEGMENTS,
    );
    expect(errorOf({ ...workout(), segments: segs(MAX_SHARE_SEGMENTS + 1) })).toMatch(/segment/i);
  });

  it.each([null, 'easy', 5, []])('rejects a segment that is not an object: %j', (seg) => {
    expect(errorOf({ ...workout(), segments: [seg] })).toMatch(/segment 1/i);
  });

  it.each([undefined, 'max', 'Easy', 'constructor', '__proto__', 'toString', 1])(
    'rejects unknown intensity %j',
    (intensity) => {
      expect(errorOf({ ...workout(), segments: [{ intensity, durationSec: 60 }] })).toMatch(
        /segment 1.*intensity/i,
      );
    },
  );

  it.each(['easy', 'medium', 'hard', 'allout'])('accepts intensity %s', (intensity) => {
    expect(valid({ ...workout(), segments: [{ intensity, durationSec: 60 }] }).segments[0].intensity).toBe(
      intensity,
    );
  });

  it.each([undefined, 0, -5, 7, 5.5, '60', NaN, Infinity, 1e300])(
    'rejects duration %j',
    (durationSec) => {
      const segments = [{ intensity: 'easy', durationSec: 60 }, { intensity: 'hard', durationSec }];
      expect(errorOf({ ...workout(), segments })).toMatch(/segment 2.*5 seconds/i);
    },
  );

  it('caps the total duration', () => {
    const at = (total: number) => ({ ...workout(), segments: [{ intensity: 'easy', durationSec: total }] });
    expect(valid(at(MAX_SHARE_TOTAL_SEC)).segments[0].durationSec).toBe(MAX_SHARE_TOTAL_SEC);
    expect(errorOf(at(MAX_SHARE_TOTAL_SEC + 5))).toMatch(/hours|long/i);
  });

  it.each([5, null, {}])('rejects a non-string label: %j', (label) => {
    expect(errorOf({ ...workout(), segments: [{ intensity: 'easy', durationSec: 60, label }] })).toMatch(
      /segment 1.*label/i,
    );
  });

  it('caps the label length and rejects control characters in it', () => {
    const seg = (label: string) => ({ ...workout(), segments: [{ intensity: 'easy', durationSec: 60, label }] });
    expect(valid(seg('x'.repeat(MAX_SHARE_LABEL_LENGTH))).segments[0].label).toHaveLength(
      MAX_SHARE_LABEL_LENGTH,
    );
    expect(errorOf(seg('x'.repeat(MAX_SHARE_LABEL_LENGTH + 1)))).toMatch(/segment 1.*label/i);
    expect(errorOf(seg('two\nlines'))).toMatch(/segment 1.*label/i);
  });

  it('rejects a workout whose canonical form exceeds the byte cap', () => {
    // Every other cap is met: max segments, each with a max-length label of
    // 4-byte characters, which together overflow the byte budget.
    const label = '🚣'.repeat(MAX_SHARE_LABEL_LENGTH);
    const segments = Array.from({ length: MAX_SHARE_SEGMENTS }, () => ({
      intensity: 'easy',
      durationSec: 5,
      label,
    }));
    expect(errorOf({ ...workout(), segments })).toMatch(/too large/i);
  });

  it("accepts every workout the app itself can produce", () => {
    const all: { name: string; segments: Segment[] }[] = [...starterTemplates()];
    for (const mins of [10, 20, 30])
      for (const pushStyle of PUSH_STYLES)
        for (let seed = 1; seed <= 25; seed++)
          all.push({ name: `${mins} min · ${pushStyle}`, segments: generate(mins, { pushStyle }, seed) });
    for (const w of all) {
      const r = validateSharedWorkout(toSharedWorkout(w.name, w.segments));
      expect(r.ok, `${w.name}: ${r.ok ? '' : r.error}`).toBe(true);
    }
  });
});

describe('parseSharedWorkout', () => {
  it('parses and validates a JSON body', () => {
    const r = parseSharedWorkout(JSON.stringify(workout()));
    expect(r).toEqual({ ok: true, workout: workout() });
  });

  it('rejects malformed JSON', () => {
    const r = parseSharedWorkout('{"version":1,');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/json/i);
  });

  it('passes validation errors through', () => {
    const r = parseSharedWorkout(JSON.stringify({ ...workout(), version: 9 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/version/i);
  });

  it('rejects an oversized body before parsing it, counting UTF-8 bytes', () => {
    const body = JSON.stringify(workout());
    // Pad with whitespace (still valid JSON) to exactly the cap: accepted.
    expect(parseSharedWorkout(body + ' '.repeat(MAX_SHARE_BYTES - body.length)).ok).toBe(true);
    // One byte over: refused even though the workout inside is fine.
    const over = parseSharedWorkout(body + ' '.repeat(MAX_SHARE_BYTES - body.length + 1));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/too large/i);
    // A 3-byte character counts as 3, not 1.
    const name = '€'.repeat(10); // 30 bytes, 10 UTF-16 units
    const euroBody = JSON.stringify(workout({ name }));
    const padTo = (n: number) => euroBody + ' '.repeat(n);
    const euroBytes = euroBody.length + 20;
    expect(parseSharedWorkout(padTo(MAX_SHARE_BYTES - euroBytes)).ok).toBe(true);
    expect(parseSharedWorkout(padTo(MAX_SHARE_BYTES - euroBytes + 1)).ok).toBe(false);
  });
});

describe('serializeSharedWorkout', () => {
  it('produces compact JSON in a fixed key order, omitting absent labels', () => {
    expect(serializeSharedWorkout(workout())).toBe(
      '{"version":1,"name":"Quick 20","segments":[{"intensity":"easy","durationSec":120},' +
        '{"intensity":"allout","durationSec":30,"label":"Sprint"}]}',
    );
  });

  it('does not depend on the key order of its input', () => {
    const shuffled = {
      segments: [
        { durationSec: 120, intensity: 'easy' },
        { label: 'Sprint', durationSec: 30, intensity: 'allout' },
      ],
      name: 'Quick 20',
      version: 1,
    } as SharedWorkout;
    expect(serializeSharedWorkout(shuffled)).toBe(serializeSharedWorkout(workout()));
  });

  it('round-trips through parseSharedWorkout', () => {
    expect(parseSharedWorkout(serializeSharedWorkout(workout()))).toEqual({ ok: true, workout: workout() });
  });
});

describe('shareIdFor', () => {
  it('is a URL-safe id of the expected length', async () => {
    const id = await shareIdFor(workout());
    expect(id).toHaveLength(SHARE_ID_LENGTH);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(isShareId(id)).toBe(true);
  });

  it('is the base64url SHA-256 prefix of the canonical form (stable across releases)', async () => {
    // Computed independently:
    //   printf '%s' '<canonical json>' | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | cut -c1-10
    expect(await shareIdFor(workout())).toBe('Q8R5Geo_BN');
  });

  it('gives the same id for the same workout however it arrived', async () => {
    const messy = valid({
      segments: [
        { id: 'x1', durationSec: 120, intensity: 'easy', label: '' },
        { id: 'x2', label: ' Sprint ', durationSec: 30, intensity: 'allout' },
      ],
      name: '  Quick 20 ',
      version: 1,
      extra: true,
    });
    expect(await shareIdFor(messy)).toBe(await shareIdFor(workout()));
  });

  it('changes when the name, order, duration or label changes', async () => {
    const base = await shareIdFor(workout());
    const [a, b] = workout().segments;
    const variants = [
      workout({ name: 'Quick 21' }),
      workout({ segments: [b, a] }),
      workout({ segments: [{ ...a, durationSec: 125 }, b] }),
      workout({ segments: [a, { intensity: 'allout', durationSec: 30 }] }),
    ];
    for (const v of variants) expect(await shareIdFor(v)).not.toBe(base);
  });
});

describe('isShareId', () => {
  it.each(['Q8R5Geo_BN', 'abcdefghij', '0123456789', '-_-_-_-_-_'])('accepts %s', (id) => {
    expect(isShareId(id)).toBe(true);
  });
  it.each(['', 'short', 'Q8R5Geo_BNx', 'Q8R5Geo/BN', 'Q8R5Geo+BN', 'Q8R5Geo=BN', ' Q8R5Geo_B'])(
    'rejects %j',
    (id) => {
      expect(isShareId(id)).toBe(false);
    },
  );
});

describe('share links', () => {
  const id = 'Q8R5Geo_BN';

  it('builds the web link and the deep link', () => {
    expect(shareUrlFor(id)).toBe('https://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN');
    expect(deepLinkFor(id)).toBe('rowalong://w/Q8R5Geo_BN');
  });

  it('round-trips both link forms through parseShareLink', () => {
    expect(parseShareLink(shareUrlFor(id))).toBe(id);
    expect(parseShareLink(deepLinkFor(id))).toBe(id);
  });

  it.each([
    'Q8R5Geo_BN',
    '  Q8R5Geo_BN\n',
    'https://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN',
    'https://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN/',
    'https://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN?ref=chat',
    'https://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN#top',
    'https://RowAlong.EndlessRainStudio.com/w/Q8R5Geo_BN',
    'http://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN',
    'rowalong.endlessrainstudio.com/w/Q8R5Geo_BN',
    '  https://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN  ',
    'rowalong://w/Q8R5Geo_BN',
    'rowalong://w/Q8R5Geo_BN/',
    'RowAlong://W/Q8R5Geo_BN',
    'rowalong:///w/Q8R5Geo_BN',
  ])('pulls the id out of %j', (input) => {
    expect(parseShareLink(input)).toBe(id);
  });

  it('keeps the id case-sensitive', () => {
    expect(parseShareLink('rowalong://w/q8r5geo_bn')).toBe('q8r5geo_bn');
  });

  it.each([
    '',
    '   ',
    'hello world',
    'Q8R5Geo_B',
    'Q8R5Geo_BNN',
    'https://rowalong.endlessrainstudio.com/',
    'https://rowalong.endlessrainstudio.com/w/',
    'https://rowalong.endlessrainstudio.com/w/Q8R5Geo_B',
    'https://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN/extra',
    'https://rowalong.endlessrainstudio.com/api/w/Q8R5Geo_BN',
    'https://rowalong.endlessrainstudio.com/x/Q8R5Geo_BN',
    'https://evil.example.com/w/Q8R5Geo_BN',
    'https://rowalong.endlessrainstudio.com.evil.example/w/Q8R5Geo_BN',
    'ftp://rowalong.endlessrainstudio.com/w/Q8R5Geo_BN',
    'rowalong://x/Q8R5Geo_BN',
    'rowalong://w/',
    'rowalong://w/Q8R5Geo_BN/extra',
    'javascript:alert(1)//w/Q8R5Geo_BN',
  ])('returns null for %j', (input) => {
    expect(parseShareLink(input)).toBeNull();
  });

  it('accepts a different base for tests and previews', () => {
    expect(shareUrlFor(id, 'http://localhost:8787')).toBe('http://localhost:8787/w/Q8R5Geo_BN');
    expect(parseShareLink('http://localhost:8787/w/Q8R5Geo_BN', 'http://localhost:8787')).toBe(id);
    expect(parseShareLink('http://localhost:9999/w/Q8R5Geo_BN', 'http://localhost:8787')).toBeNull();
    expect(parseShareLink(shareUrlFor(id), 'http://localhost:8787')).toBeNull();
  });
});

describe('converting to and from app segments', () => {
  const appSegments: Segment[] = [
    { id: 'a', intensity: 'easy', durationSec: 120 },
    { id: 'b', intensity: 'allout', durationSec: 30, label: 'Sprint' },
  ];

  it('toSharedWorkout drops ids and keeps intensity, duration and label', () => {
    expect(toSharedWorkout('Quick 20', appSegments)).toEqual(workout());
  });

  it('fromSharedWorkout makes a template with fresh ids', () => {
    const t = fromSharedWorkout(workout());
    expect(t.name).toBe('Quick 20');
    expect(t.id).toBeTruthy();
    expect(toSharedWorkout(t.name, t.segments)).toEqual(workout());
    const ids = new Set(t.segments.map((s) => s.id));
    expect(ids.size).toBe(t.segments.length);
    for (const s of t.segments) expect(s.id).toBeTruthy();
  });

  it('re-ids on every load', () => {
    const a = fromSharedWorkout(workout());
    const b = fromSharedWorkout(workout());
    expect(a.id).not.toBe(b.id);
    expect(a.segments[0].id).not.toBe(b.segments[0].id);
  });

  it('does not share segment objects with the payload', () => {
    const w = workout();
    const t = fromSharedWorkout(w);
    t.segments[0].durationSec = 999;
    expect(w.segments[0].durationSec).toBe(120);
  });
});
