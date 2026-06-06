import { describe, it, expect, beforeEach } from 'vitest';
import { formatCountdown, spmText, mountOverlay, densityIcon } from '../src/ui/overlayView';
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

describe('densityIcon', () => {
  it('maps pill→expand and coach→collapse, never the stop glyph', () => {
    expect(densityIcon('pill')).toBe('⤢');
    expect(densityIcon('coach')).toBe('⤡');
    expect(densityIcon('pill')).not.toBe('⏹');
    expect(densityIcon('coach')).not.toBe('⏹');
  });
});

describe('density toggle button', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

  it('shows the state-aware glyph on mount and updates via setDensity', () => {
    const engine = fakeEngine(runningState);
    const mounted = mountOverlay(document, engine as never, { density: 'pill' });
    const btn = document.querySelector('[data-act="density"]') as HTMLElement;
    expect(btn.textContent).toBe('⤢');
    expect(btn.getAttribute('title')).toBe('Expand');

    mounted.setDensity('coach');
    expect(btn.textContent).toBe('⤡');
    expect(btn.getAttribute('title')).toBe('Collapse');
  });
});

const pausedState: SessionState = { ...runningState, status: 'paused' };

describe('play/pause button is state-aware', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

  it('shows the pause glyph and title while running', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'coach' });
    const btn = document.querySelector('[data-act="pause"]') as HTMLElement;
    expect(btn.textContent).toBe('⏸');
    expect(btn.getAttribute('title')).toBe('Pause');
  });

  it('shows the play glyph and title while paused', () => {
    const engine = fakeEngine(pausedState);
    mountOverlay(document, engine as never, { density: 'coach' });
    const btn = document.querySelector('[data-act="pause"]') as HTMLElement;
    expect(btn.textContent).toBe('⏵');
    expect(btn.getAttribute('title')).toBe('Resume');
  });
});

function ptr(type: string, screenX: number, screenY: number) {
  return new MouseEvent(type, { screenX, screenY, button: 0, bubbles: true });
}

describe('drag vs click on the overlay body', () => {
  beforeEach(() => { document.body.innerHTML = ''; document.head.innerHTML = ''; });

  it('dragging past the threshold calls onDrag with deltas and does not pause', () => {
    const engine = fakeEngine(runningState);
    const deltas: Array<[number, number]> = [];
    mountOverlay(document, engine as never, {
      density: 'pill',
      onDrag: (dx, dy) => deltas.push([dx, dy]),
    });
    const root = document.querySelector('.ov-root') as HTMLElement;
    root.dispatchEvent(ptr('pointerdown', 100, 100));
    root.dispatchEvent(ptr('pointermove', 110, 105)); // 11.2px > 4px threshold
    root.dispatchEvent(ptr('pointermove', 120, 105)); // +10, +0
    root.dispatchEvent(ptr('pointerup', 120, 105));
    expect(deltas).toEqual([[10, 5], [10, 0]]);
    expect(engine.calls).not.toContain('pause');
  });

  it('a sub-threshold press is a click that toggles pause', () => {
    const engine = fakeEngine(runningState);
    const deltas: Array<[number, number]> = [];
    mountOverlay(document, engine as never, {
      density: 'pill',
      onDrag: (dx, dy) => deltas.push([dx, dy]),
    });
    const root = document.querySelector('.ov-root') as HTMLElement;
    root.dispatchEvent(ptr('pointerdown', 100, 100));
    root.dispatchEvent(ptr('pointermove', 102, 101)); // 2.2px < 4px threshold
    root.dispatchEvent(ptr('pointerup', 102, 101));
    expect(deltas).toEqual([]);
    expect(engine.calls).toContain('pause');
  });

  it('pointerdown on a control does not start a drag', () => {
    const engine = fakeEngine(runningState);
    const deltas: Array<[number, number]> = [];
    mountOverlay(document, engine as never, {
      density: 'coach',
      onDrag: (dx, dy) => deltas.push([dx, dy]),
    });
    const nextBtn = document.querySelector('[data-act="next"]') as HTMLElement;
    nextBtn.dispatchEvent(ptr('pointerdown', 100, 100));
    nextBtn.dispatchEvent(ptr('pointermove', 130, 130));
    nextBtn.dispatchEvent(ptr('pointerup', 130, 130));
    expect(deltas).toEqual([]);
    expect(engine.calls).not.toContain('pause');
  });

  it('without onDrag, a body click still toggles pause', () => {
    const engine = fakeEngine(runningState);
    mountOverlay(document, engine as never, { density: 'pill' });
    (document.querySelector('.ov-root') as HTMLElement).click();
    expect(engine.calls).toContain('pause');
  });
});
