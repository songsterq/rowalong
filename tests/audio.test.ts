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
