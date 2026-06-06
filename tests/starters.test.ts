import { describe, it, expect } from 'vitest';
import { starterTemplates } from '../src/core/starters';
import { SUPPORTED_MINUTES } from '../src/core/generator';

describe('starterTemplates', () => {
  const templates = starterTemplates();
  const supportedSec = SUPPORTED_MINUTES.map((m) => m * 60);

  it('every template totals a supported workout length', () => {
    for (const t of templates) {
      const total = t.segments.reduce((sum, s) => sum + s.durationSec, 0);
      expect(supportedSec).toContain(total);
    }
  });

  it('Quick 20 is a 20-minute workout', () => {
    const t = templates.find((x) => x.name === 'Quick 20')!;
    const total = t.segments.reduce((sum, s) => sum + s.durationSec, 0);
    expect(total).toBe(20 * 60);
  });

  it('Short sprints is a 10-minute workout', () => {
    const t = templates.find((x) => x.name === 'Short sprints')!;
    const total = t.segments.reduce((sum, s) => sum + s.durationSec, 0);
    expect(total).toBe(10 * 60);
  });
});
