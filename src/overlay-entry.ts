import { SessionEngine } from './core/sessionEngine';
import { TonePlayer } from './core/audio';
import { Storage } from './core/storage';
import type { Density } from './core/storage';
import { mountOverlay } from './ui/overlayView';
import type { SessionPayload } from './electron';

// Entry point for the Electron overlay window. The setup window builds the
// workout; this window owns the running session: engine, tones, overlay, loop.
// It reuses the same core + overlay UI as the browser/PiP path.

const storage = new Storage();
let rafId = 0;

function runSession(payload: SessionPayload) {
  const { segments, prefs } = payload;

  const engine = new SessionEngine(segments);
  const tone = new TonePlayer();
  tone.setVolume(prefs.volume);
  tone.setMuted(prefs.muted);
  tone.unlock(); // autoplay is enabled in this window via the main process switch

  engine.on((e) => {
    if (e.type === 'transition') tone.handleTransition(e.to.intensity);
    else if (e.type === 'countdown') tone.handleCountdown(e.next.intensity);
    else if (e.type === 'complete') tone.playComplete();
  });

  let density: Density = prefs.density;
  const mounted = mountOverlay(document, engine, {
    density,
    onToggleDensity: () => {
      density = density === 'pill' ? 'coach' : 'pill';
      storage.setPrefs({ density }); // shared origin → setup picks it up next time
      mounted.setDensity(density);
    },
    onStop: () => {
      cancelAnimationFrame(rafId);
      window.electronAPI?.stopSession();
    },
  });

  const step = () => {
    engine.tick();
    if (engine.getState().status === 'done') {
      cancelAnimationFrame(rafId);
      // Let the finish tone ring out, then close the overlay window.
      setTimeout(() => window.electronAPI?.stopSession(), 1000);
      return;
    }
    rafId = requestAnimationFrame(step);
  };

  engine.start();
  rafId = requestAnimationFrame(step);
}

window.electronAPI?.onSessionPayload(runSession);
