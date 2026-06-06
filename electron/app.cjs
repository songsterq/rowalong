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
  setupWin.loadURL(DEV_URL);
  setupWin.on('closed', () => {
    setupWin = null;
  });
}

function openOverlay(payload) {
  if (overlayWin) {
    overlayWin.close();
    overlayWin = null;
  }

  const displays = screen.getAllDisplays().map((d) => d.workArea);
  const start = pickStartBounds(readSavedBounds(), displays, OVERLAY_DEFAULTS);

  overlayWin = new BrowserWindow({
    ...start,
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

  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });

  // Remember where the user parks/sizes the overlay. 'moved'/'resized' fire once
  // when the drag/resize finishes, so there's no per-pixel write thrashing.
  const saveBounds = () => {
    if (overlayWin && !overlayWin.isDestroyed()) writeSavedBounds(overlayWin.getBounds());
  };
  overlayWin.on('moved', saveBounds);
  overlayWin.on('resized', saveBounds);
  overlayWin.on('close', saveBounds); // JS-driven setPosition may not fire 'moved'

  overlayWin.loadURL(`${DEV_URL}/overlay.html`);
  overlayWin.webContents.once('did-finish-load', () => {
    overlayWin.webContents.send('session-payload', payload);
  });
  overlayWin.showInactive(); // show without stealing focus from the video app
  overlayWin.on('closed', () => {
    overlayWin = null;
  });
}

ipcMain.on('start-session', (_event, payload) => {
  openOverlay(payload);
});

ipcMain.on('stop-session', () => {
  if (overlayWin) {
    overlayWin.close();
    overlayWin = null;
  }
  if (setupWin) setupWin.focus();
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
  // Accessory app (no Dock icon). This replicates the verified spike: ONLY as an
  // accessory (UIElement) process does the overlay's setVisibleOnAllWorkspaces
  // ({ visibleOnFullScreen: true, skipTransformProcessType: true }) actually
  // float over another app's native fullscreen. As a normal foreground app the
  // same flags float over nothing.
  if (app.dock) app.dock.hide();
  nativeTheme.themeSource = 'dark'; // dark traffic-light glyphs + native menus
  createSetupWindow();
  app.on('activate', () => {
    if (!setupWin) createSetupWindow();
  });
});

app.on('window-all-closed', () => {
  // No Dock icon to reactivate from, so quit when the last window closes.
  app.quit();
});
