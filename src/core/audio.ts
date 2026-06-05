import { Intensity, INTENSITY_META } from './types';

export interface ToneSpec {
  startHz: number;
  endHz: number;
  durMs: number;
}

/** Rising/urgent tone into a push; softer descending tone into a rest. */
export function toneForTransition(to: Intensity): ToneSpec {
  return INTENSITY_META[to].kind === 'work'
    ? { startHz: 440, endHz: 880, durMs: 220 }
    : { startHz: 660, endHz: 440, durMs: 180 };
}

/** 3-2-1 beeps only precede a push (spec §6). */
export function shouldBeepBeforeNext(next: Intensity): boolean {
  return INTENSITY_META[next].kind === 'work';
}

/**
 * Thin Web Audio wrapper. Pure decisions live above; this just plays them.
 * Verified manually (no audio device under jsdom).
 */
export class TonePlayer {
  private ctx: AudioContext | null = null;
  private volume = 0.6;
  private muted = false;

  /** Must be called from a user gesture (e.g. the Start click). */
  unlock() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
  }

  setMuted(m: boolean) {
    this.muted = m;
  }

  private playTone(spec: ToneSpec) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(spec.startHz, t0);
    osc.frequency.linearRampToValueAtTime(spec.endHz, t0 + spec.durMs / 1000);
    gain.gain.setValueAtTime(this.volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + spec.durMs / 1000);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + spec.durMs / 1000);
  }

  /** Engine 'countdown' handler: beep only before a push. */
  handleCountdown(next: Intensity) {
    if (shouldBeepBeforeNext(next)) {
      this.playTone({ startHz: 880, endHz: 880, durMs: 90 });
    }
  }

  /** Engine 'transition' handler. */
  handleTransition(to: Intensity) {
    this.playTone(toneForTransition(to));
  }

  /** Engine 'complete' handler. */
  playComplete() {
    this.playTone({ startHz: 523, endHz: 784, durMs: 400 });
  }
}
