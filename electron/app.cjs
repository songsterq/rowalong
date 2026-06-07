// Electron main process: a normal app with a setup window, plus an on-demand
// always-on-top overlay window that floats over native macOS fullscreen apps
// (Apple TV / Netflix / QuickTime) — the thing Chrome Document PiP cannot do.
//
// Run: npm run electron:dev  (starts Vite, then launches this)
//
// The overlay-floats-over-fullscreen recipe (verified by electron/main.cjs spike):
//   setAlwaysOnTop(true, 'screen-saver')
//   setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })

const { app, BrowserWindow, ipcMain, screen, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { pickStartBounds } = require('./windowBounds.cjs');

// Let the overlay window play tone cues without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const DEV_URL = process.env.WH_DEV_URL || 'http://localhost:5173';
const isDev = !app.isPackaged;

// In dev, load from the Vite dev server; when packaged, load the built page from
// dist/ (bundled into app.asar, reachable from electron/.. → dist).
function loadPage(win, page /* 'index' | 'overlay' */) {
  if (isDev) {
    win.loadURL(page === 'index' ? DEV_URL : `${DEV_URL}/${page}.html`);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', `${page}.html`));
  }
}

let setupWin = null;
let overlayWin = null;

// Overlay window default size + enforced minimum (Electron minWidth/minHeight).
// minHeight is a small safety floor only — the card's measured height drives the
// real window height (see the 'set-overlay-height' handler). It must stay below the
// compact pill (~140px) or it would clamp the hug and leave a dead strip.
const OVERLAY_DEFAULTS = { width: 250, height: 240, minWidth: 200, minHeight: 80 };

// Persist the overlay window's last bounds in userData (the renderer's localStorage
// is not readable from the main process at window-creation time). Best-effort: any
// read/write failure just falls back to the default centred window.
function boundsFile() {
  return path.join(app.getPath('userData'), 'overlay-bounds.json');
}

function readSavedBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
  } catch {
    return null;
  }
}

function writeSavedBounds(bounds) {
  try {
    fs.writeFileSync(boundsFile(), JSON.stringify(bounds));
  } catch {
    // ignore — remembering position is best-effort
  }
}

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 760,
    height: 820,
    title: 'RowAlong',
    // Match the app's dark surface: hide the native title bar so the page's own
    // background fills that strip (traffic lights stay, floating over the content),
    // and paint the pre-load background the same near-black so there's no flash.
    titleBarStyle: 'hidden',
    backgroundColor: '#151310',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  loadPage(setupWin, 'index');
  setupWin.on('closed', () => {
    setupWin = null;
  });
}

// Tell the setup window the session ended so it can flip its button back to
// "Start workout". Best-effort: no setup window → nothing to update.
function notifySessionEnded() {
  if (setupWin && !setupWin.isDestroyed()) setupWin.webContents.send('session-ended');
}

function openOverlay(payload) {
  // A previous overlay still open? Close it first. The toggle button normally
  // prevents a second Start, so this is defensive — but it must be race-free:
  // each window's event handlers below capture their own `win` (not the shared
  // `overlayWin`), and the 'closed' handler only acts when it's still current,
  // so a superseded window closing late can't null out the new one. (That stale
  // closure was the `webContents of null` crash.)
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
  overlayWin = null;

  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const start = pickStartBounds(readSavedBounds(), displays, OVERLAY_DEFAULTS);

  const win = new BrowserWindow({
    ...start,
    // macOS non-activating NSPanel: floats over another app's native fullscreen
    // even though the app runs as a normal Dock (Regular) app — this is why we no
    // longer hide the Dock. (Electron 25+; see the design spec.)
    type: 'panel',
    minWidth: OVERLAY_DEFAULTS.minWidth,
    minHeight: OVERLAY_DEFAULTS.minHeight,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });

  overlayWin = win;

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });

  // Remember where the user parks/sizes the overlay. 'moved'/'resized' fire once
  // when the drag/resize finishes, so there's no per-pixel write thrashing.
  const saveBounds = () => {
    if (!win.isDestroyed()) writeSavedBounds(win.getBounds());
  };
  win.on('moved', saveBounds);
  win.on('resized', saveBounds);
  win.on('close', saveBounds); // JS-driven setPosition may not fire 'moved'

  loadPage(win, 'overlay');
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('session-payload', payload);
  });
  win.showInactive(); // show without stealing focus from the video app
  win.on('closed', () => {
    // Only act if this is still the current overlay — a window we superseded in a
    // close+reopen must not null out its replacement or send a stale "ended".
    if (overlayWin === win) {
      overlayWin = null;
      notifySessionEnded();
    }
  });
}

ipcMain.on('start-session', (_event, payload) => {
  openOverlay(payload);
});

ipcMain.on('stop-session', () => {
  // Close the overlay; its 'closed' handler nulls overlayWin and notifies setup,
  // so there's exactly one place that ends a session.
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
  if (setupWin && !setupWin.isDestroyed()) setupWin.focus();
});

ipcMain.on('move-overlay-by', (_event, { dx, dy }) => {
  if (overlayWin && !overlayWin.isDestroyed()) {
    const [x, y] = overlayWin.getPosition();
    overlayWin.setPosition(Math.round(x + dx), Math.round(y + dy));
  }
});

ipcMain.on('set-overlay-height', (_event, height) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  if (typeof height !== 'number' || !Number.isFinite(height) || height <= 0) return;
  // Keep current width + position (x/y); only the bottom edge moves so the card
  // stays anchored at the top-left.
  const [w] = overlayWin.getContentSize();
  overlayWin.setContentSize(w, Math.ceil(height));
});

app.whenReady().then(() => {
  // Normal Dock (Regular) app. The overlay floats over another app's native
  // fullscreen because its window is a non-activating NSPanel (type: 'panel' in
  // openOverlay), which works independent of Dock/accessory status — so we do
  // NOT hide the Dock here. (The earlier activation-policy-transform attempt that
  // kept the Dock icon WITHOUT a panel failed to float; see the design spec.)
  nativeTheme.themeSource = 'dark'; // dark traffic-light glyphs + native menus
  createSetupWindow();
  app.on('activate', () => {
    if (!setupWin) createSetupWindow();
  });
});

app.on('window-all-closed', () => {
  // Standard macOS Dock app: stay alive when all windows close (the Dock icon /
  // ⌘-Tab reopen the setup window via the 'activate' handler). Quit elsewhere.
  if (process.platform !== 'darwin') app.quit();
});
