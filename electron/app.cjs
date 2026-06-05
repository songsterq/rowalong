// Electron main process: a normal app with a setup window, plus an on-demand
// always-on-top overlay window that floats over native macOS fullscreen apps
// (Apple TV / Netflix / QuickTime) — the thing Chrome Document PiP cannot do.
//
// Run: npm run electron:dev  (starts Vite, then launches this)
//
// The overlay-floats-over-fullscreen recipe (verified by electron/main.cjs spike):
//   setAlwaysOnTop(true, 'screen-saver')
//   setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Let the overlay window play tone cues without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const DEV_URL = process.env.WH_DEV_URL || 'http://localhost:5173';

let setupWin = null;
let overlayWin = null;

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 760,
    height: 820,
    title: 'Workout Helper',
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
  overlayWin = new BrowserWindow({
    width: 250,
    height: 240,
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

app.whenReady().then(() => {
  createSetupWindow();
  app.on('activate', () => {
    if (!setupWin) createSetupWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
