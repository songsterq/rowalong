import { describe, it, expect, beforeEach } from 'vitest';
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
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

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
