import { describe, it, expect } from 'vitest';
import { pickStartBounds, isVisibleOnSomeDisplay } from '../electron/windowBounds.cjs';

const DEFAULTS = { width: 250, height: 240, minWidth: 200, minHeight: 180 };
// A single 1440x900 display whose work area starts at (0,0).
const DISPLAYS = [{ x: 0, y: 0, width: 1440, height: 900 }];

describe('isVisibleOnSomeDisplay', () => {
  it('is true when the window overlaps a display', () => {
    expect(isVisibleOnSomeDisplay({ x: 100, y: 100, width: 250, height: 240 }, DISPLAYS)).toBe(true);
  });

  it('is false when the window is entirely off every display', () => {
    expect(isVisibleOnSomeDisplay({ x: 5000, y: 5000, width: 250, height: 240 }, DISPLAYS)).toBe(false);
  });

  it('is true when the window only partially overlaps a display', () => {
    // Hangs off the right edge but its left portion is still on-screen.
    expect(isVisibleOnSomeDisplay({ x: 1400, y: 100, width: 250, height: 240 }, DISPLAYS)).toBe(true);
  });

  it('is false when there are no displays', () => {
    expect(isVisibleOnSomeDisplay({ x: 100, y: 100, width: 250, height: 240 }, [])).toBe(false);
  });
});

describe('pickStartBounds', () => {
  it('returns defaults (no x/y) when there are no saved bounds', () => {
    expect(pickStartBounds(null, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
  });

  it('restores valid saved bounds, preserving position', () => {
    const saved = { x: 300, y: 220, width: 320, height: 300 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({
      x: 300, y: 220, width: 320, height: 300,
    });
  });

  it('falls back to defaults when saved bounds are off all displays', () => {
    const saved = { x: 5000, y: 5000, width: 320, height: 300 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
  });

  it('keeps partially-overlapping saved bounds', () => {
    const saved = { x: 1400, y: 100, width: 250, height: 240 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({
      x: 1400, y: 100, width: 250, height: 240,
    });
  });

  it('clamps a restored size up to the minimum', () => {
    const saved = { x: 100, y: 100, width: 50, height: 40 };
    expect(pickStartBounds(saved, DISPLAYS, DEFAULTS)).toEqual({
      x: 100, y: 100, width: 200, height: 180,
    });
  });

  it('falls back to defaults when saved bounds are malformed', () => {
    expect(pickStartBounds({ x: 'a', y: 10 }, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
    expect(pickStartBounds({ width: 250, height: 240 }, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
  });

  it('falls back to defaults when saved bounds have zero size', () => {
    expect(pickStartBounds({ x: 0, y: 0, width: 0, height: 0 }, DISPLAYS, DEFAULTS)).toEqual({ width: 250, height: 240 });
  });
});
