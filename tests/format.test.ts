import { describe, it, expect } from 'vitest';
import { formatClock, timelineGradient } from '../src/ui/format';
import { INTENSITY_META, Segment } from '../src/core/types';

const seg = (intensity: Segment['intensity'], durationSec: number): Segment => ({
  id: `${intensity}-${durationSec}`,
  intensity,
  durationSec,
});

describe('formatClock', () => {
  it('formats whole minutes and seconds as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(90)).toBe('1:30');
    expect(formatClock(600)).toBe('10:00');
    expect(formatClock(1205)).toBe('20:05');
  });

  it('never goes negative', () => {
    expect(formatClock(-10)).toBe('0:00');
  });
});

describe('timelineGradient', () => {
  it('returns transparent for an empty workout', () => {
    expect(timelineGradient([])).toBe('transparent');
  });

  it('emits a 90deg linear-gradient with two stops per segment', () => {
    const g = timelineGradient([seg('easy', 50), seg('hard', 50)]);
    expect(g.startsWith('linear-gradient(90deg, ')).toBe(true);
    // 2 segments -> 4 color stops.
    expect(g.split(',').length - 1 /* the 90deg comma */).toBe(4);
  });

  it('leaves a blend zone straddling each interior boundary', () => {
    // easy 0..50, hard 50..100; blend=2 -> easy solid ends at 48%, hard solid starts at 52%.
    const g = timelineGradient([seg('easy', 50), seg('hard', 50)], 2);
    expect(g).toContain(`${INTENSITY_META.easy.color} 48.00%`);
    expect(g).toContain(`${INTENSITY_META.hard.color} 52.00%`);
  });

  it('clamps the blend to half a short segment so stops stay ordered', () => {
    // A 2%-wide sliver (10s of 500s) can only blend 1% per side, not the full 2%.
    const g = timelineGradient([seg('easy', 245), seg('medium', 10), seg('easy', 245)], 2);
    // medium spans 49..51; inner = min(2, 1) = 1 -> stops at 50.00% and 50.00%.
    expect(g).toContain(`${INTENSITY_META.medium.color} 50.00%`);
  });
});
