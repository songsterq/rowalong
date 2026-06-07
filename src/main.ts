import { Storage, Density } from './core/storage';
import { SessionEngine } from './core/sessionEngine';
import { TonePlayer } from './core/audio';
import { Segment } from './core/types';
import { mountSetup } from './ui/setupView';
import { mountOverlay, MountedOverlay } from './ui/overlayView';
import { isPipSupported } from './shell/overlayHost';
import { PipOverlayHost } from './shell/pipOverlayHost';

const app = document.querySelector<HTMLDivElement>('#app')!;
const storage = new Storage();
const tone = new TonePlayer();

let rafId = 0;
let mounted: MountedOverlay | null = null;
let fallbackEl: HTMLElement | null = null;
let host: PipOverlayHost | null = null;
let tearingDown = false;
let sessionActive = false;
let currentSegments: Segment[] = [];

function wireAudio(engine: SessionEngine) {
  const prefs = storage.getPrefs();
  tone.setVolume(prefs.volume);
  tone.setMuted(prefs.muted);
  engine.on((e) => {
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

function overlayOpts(_engine: SessionEngine) {
  return {
    density: storage.getPrefs().density,
    segments: currentSegments,
    onToggleDensity: () => {
      const next: Density = storage.getPrefs().density === 'pill' ? 'coach' : 'pill';
      storage.setPrefs({ density: next });
      mounted?.setDensity(next);
    },
    onStop: () => endSession(),
  };
}

async function openPipOverlay(engine: SessionEngine) {
  host = new PipOverlayHost();
  const doc = await host.open({ width: 240, height: 220 });
  mounted = mountOverlay(doc, engine, overlayOpts(engine));
  host.onClosed(() => {
    if (tearingDown) return; // we closed it ourselves during endSession
    // User closed the PiP window mid-session: pause, tear down the overlay,
    // and offer to reopen.
    engine.pause();
    cancelAnimationFrame(rafId);
    mounted?.unmount();
    mounted = null;
    host = null;
    showReopen(engine);
  });
}

function showReopen(engine: SessionEngine) {
  if (document.querySelector('.reopen-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'reopen-bar';
  bar.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:2147483647;font:14px system-ui;';
  const btn = document.createElement('button');
  btn.textContent = '▶ Reopen overlay';
  btn.addEventListener('click', async () => {
    bar.remove();
    await openPipOverlay(engine);
    engine.resume();
    runLoop(engine);
  });
  bar.appendChild(btn);
  document.body.appendChild(bar);
}

async function startSession(segments: Segment[]) {
  if (window.electronAPI) {
    // Electron: hand the session off to the native always-on-top overlay window,
    // which floats over native-app fullscreen (where PiP can't). The setup button
    // becomes "Stop workout" so a second Start can't be sent (it would race the
    // overlay window and crash the main process); main fires onSessionEnded to reset.
    window.electronAPI.startSession({ segments, prefs: storage.getPrefs() });
    sessionActive = true;
    setup.setSessionActive(true);
    return;
  }
  // Ignore repeat Start clicks: a session is already running (or paused with the
  // reopen bar showing). Re-running would orphan the live overlay/engine and throw.
  if (sessionActive) return;
  sessionActive = true;
  setup.setSessionActive(true);
  tearingDown = false;
  currentSegments = segments;
  const engine = new SessionEngine(segments);
  tone.unlock(); // user gesture (Start click)
  wireAudio(engine);

  if (isPipSupported()) {
    await openPipOverlay(engine);
  } else {
    // In-page fallback overlay (non-Chrome): fixed in the corner of this page.
    fallbackEl = document.createElement('div');
    fallbackEl.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;';
    const note = document.createElement('div');
    note.textContent =
      'Picture-in-Picture needs Chrome — running the overlay in-page instead.';
    note.style.cssText = 'font:12px system-ui;color:#b00;margin-bottom:8px;';
    fallbackEl.appendChild(note);
    document.body.appendChild(fallbackEl);
    mounted = mountOverlay(document, engine, overlayOpts(engine));
    const root = document.body.querySelector('.ov-root');
    if (root) fallbackEl.appendChild(root);
  }

  engine.start();
  runLoop(engine);
}

// Stop an active session from the setup window's toggle button.
function stopSession() {
  if (window.electronAPI) {
    // Tell main to close the overlay window; it echoes back onSessionEnded, but
    // reset the toggle now so the button feels instant.
    window.electronAPI.stopSession();
    sessionActive = false;
    setup.setSessionActive(false);
    return;
  }
  endSession();
}

function endSession() {
  tearingDown = true;
  sessionActive = false;
  setup.setSessionActive(false);
  cancelAnimationFrame(rafId);
  mounted?.unmount();
  mounted = null;
  host?.close();
  host = null;
  fallbackEl?.remove();
  fallbackEl = null;
  document.querySelector('.reopen-bar')?.remove();
}

const setup = mountSetup(app, { storage, onStart: startSession, onStop: stopSession });

// Electron only: the overlay runs in its own window, so the setup page learns the
// session ended (natural completion, the overlay's stop button, or the window
// closing) only through this signal — reset the Start/Stop toggle when it fires.
window.electronAPI?.onSessionEnded(() => {
  sessionActive = false;
  setup.setSessionActive(false);
});
