import { Segment, SessionStatus } from './types';

export interface Clock {
  /** Monotonic milliseconds. */
  now(): number;
}

export const realClock: Clock = { now: () => performance.now() };

export interface SessionState {
  status: SessionStatus;
  currentIndex: number;
  segment: Segment | null;
  segmentElapsedSec: number;
  segmentRemainingSec: number;
  totalElapsedSec: number;
  totalRemainingSec: number;
  totalSegments: number;
}

export type EngineEvent =
  | { type: 'tick'; state: SessionState }
  | { type: 'transition'; from: Segment; to: Segment }
  | { type: 'countdown'; secondsLeft: number; next: Segment }
  | { type: 'complete' };

type Listener = (e: EngineEvent) => void;

export class SessionEngine {
  private status: SessionStatus = 'idle';
  private elapsedSec = 0;
  private lastNow = 0;
  private index = 0;
  private lastCountdownSec: number | null = null;
  private listeners = new Set<Listener>();
  private readonly cumStart: number[];
  private readonly totalDuration: number;

  constructor(
    private readonly segments: Segment[],
    private readonly clock: Clock = realClock,
  ) {
    this.cumStart = [];
    let acc = 0;
    for (const s of segments) {
      this.cumStart.push(acc);
      acc += s.durationSec;
    }
    this.totalDuration = acc;
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent) {
    for (const fn of this.listeners) fn(e);
  }

  private emitTick() {
    this.emit({ type: 'tick', state: this.getState() });
  }

  private indexAt(elapsed: number): number {
    let i = 0;
    while (i < this.segments.length - 1 && elapsed >= this.cumStart[i + 1]) i++;
    return i;
  }

  start() {
    this.status = 'running';
    this.elapsedSec = 0;
    this.index = 0;
    this.lastCountdownSec = null;
    this.lastNow = this.clock.now();
    this.emitTick();
  }

  pause() {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.emitTick();
  }

  resume() {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.lastNow = this.clock.now();
    this.emitTick();
  }

  stop() {
    this.status = 'done';
    this.emitTick();
  }

  private completeNow() {
    this.elapsedSec = this.totalDuration;
    this.status = 'done';
    this.emit({ type: 'complete' });
    this.emitTick();
  }

  skipNext() {
    const target = this.index + 1;
    if (target >= this.segments.length) {
      this.completeNow();
      return;
    }
    const from = this.segments[this.index];
    const to = this.segments[target];
    this.elapsedSec = this.cumStart[target];
    this.index = target;
    this.lastCountdownSec = null;
    if (this.status === 'running') this.lastNow = this.clock.now();
    this.emit({ type: 'transition', from, to });
    this.emitTick();
  }

  skipPrev() {
    const target = Math.max(0, this.index - 1);
    const from = this.segments[this.index];
    const to = this.segments[target];
    this.elapsedSec = this.cumStart[target];
    this.index = target;
    this.lastCountdownSec = null;
    if (this.status === 'running') this.lastNow = this.clock.now();
    if (from !== to) this.emit({ type: 'transition', from, to });
    this.emitTick();
  }

  tick() {
    if (this.status !== 'running') {
      this.emitTick();
      return;
    }
    const n = this.clock.now();
    this.elapsedSec += (n - this.lastNow) / 1000;
    this.lastNow = n;

    if (this.elapsedSec >= this.totalDuration) {
      this.completeNow();
      return;
    }

    const newIndex = this.indexAt(this.elapsedSec);
    if (newIndex !== this.index) {
      const from = this.segments[this.index];
      const to = this.segments[newIndex];
      this.index = newIndex;
      this.lastCountdownSec = null;
      this.emit({ type: 'transition', from, to });
    }

    const next = this.segments[this.index + 1];
    if (next) {
      const state = this.getState();
      const cl = Math.ceil(state.segmentRemainingSec);
      if (cl >= 1 && cl <= 3 && cl !== this.lastCountdownSec) {
        this.lastCountdownSec = cl;
        this.emit({ type: 'countdown', secondsLeft: cl, next });
      }
    }

    this.emitTick();
  }

  getState(): SessionState {
    const segment = this.segments[this.index] ?? null;
    const segStart = this.cumStart[this.index] ?? 0;
    const segmentElapsedSec = segment ? this.elapsedSec - segStart : 0;
    const segmentRemainingSec = segment
      ? Math.max(0, segment.durationSec - segmentElapsedSec)
      : 0;
    return {
      status: this.status,
      currentIndex: this.index,
      segment,
      segmentElapsedSec: Math.max(0, segmentElapsedSec),
      segmentRemainingSec,
      totalElapsedSec: Math.min(this.elapsedSec, this.totalDuration),
      totalRemainingSec: Math.max(0, this.totalDuration - this.elapsedSec),
      totalSegments: this.segments.length,
    };
  }
}
