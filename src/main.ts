import { Storage, Density } from './core/storage';
import { SessionEngine } from './core/sessionEngine';
import { TonePlayer } from './core/audio';
import { Segment } from './core/types';
import { mountSetup } from './ui/setupView';
import { mountOverlay, MountedOverlay, OVERLAY_CSS } from './ui/overlayView';
import { isPipSupported } from './shell/overlayHost';
import { PipOverlayHost } from './shell/pipOverlayHost';

const app = document.querySelector<HTMLDivElement>('#app')!;
const storage = new Storage();
const tone = new TonePlayer();

let rafId = 0;
let mounted: MountedOverlay | null = null;
let fallbackEl: HTMLElement | null = null;

function wireAudio(engine: SessionEngine) {
  const prefs = storage.getPrefs();
  tone.setVolume(prefs.volume);
  tone.setMuted(prefs.muted);
  return engine.on((e) => {
    if (e.type === 'transition') tone.handleTransition(e.to.intensity);
    else if (e.type === 'countdown') tone.handleCountdown(e.next.intensity);
    else if (e.type === 'complete') tone.playComplete();
  });
}

function runLoop(engine: SessionEngine) {
  const step = () => {
    engine.tick();
    if (engine.getState().status === 'done') {
      cancelAnimationFrame(rafId);
      return;
    }
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

async function startSession(segments: Segment[]) {
  const engine = new SessionEngine(segments);
  const prefs = storage.getPrefs();
  tone.unlock(); // user gesture (Start click)
  wireAudio(engine);

  const overlayOpts = {
    density: prefs.density,
    onToggleDensity: () => {
      const next: Density = storage.getPrefs().density === 'pill' ? 'coach' : 'pill';
      storage.setPrefs({ density: next });
      mounted?.setDensity(next);
    },
    onStop: () => endSession(),
  };

  if (isPipSupported()) {
    const host = new PipOverlayHost();
    const doc = await host.open({ width: 240, height: 220 });
    mounted = mountOverlay(doc, engine, overlayOpts);
    host.onClosed(() => engine.pause());
  } else {
    // In-page fallback overlay (non-Chrome): fixed in the corner of this page.
    fallbackEl = document.createElement('div');
    fallbackEl.style.cssText =
      'position:fixed;top:16px;right:16px;z-index:2147483647;';
    const note = document.createElement('div');
    note.textContent =
      'Picture-in-Picture needs Chrome — running the overlay in-page instead.';
    note.style.cssText = 'font:12px system-ui;color:#b00;margin-bottom:8px;';
    document.body.append(note, fallbackEl);
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);
    mounted = mountOverlay(document, engine, overlayOpts);
    // mountOverlay appends to document.body; move it into the fixed container
    const root = document.body.querySelector('.ov-root');
    if (root) fallbackEl.appendChild(root);
  }

  engine.start();
  runLoop(engine);
}

function endSession() {
  cancelAnimationFrame(rafId);
  mounted?.unmount();
  mounted = null;
  fallbackEl?.remove();
  fallbackEl = null;
}

mountSetup(app, { storage, onStart: startSession });
