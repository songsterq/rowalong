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
