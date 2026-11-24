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
const {
  DEEP_LINK_SCHEME,
  toDeepLink,
  deepLinkFromArgv,
  createLinkQueue,
} = require('./deepLink.cjs');

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

// --- rowalong:// deep links ('Open in RowAlong' on a share preview page) ---
//
// One RowAlong at a time. Launch Services already routes a clicked link to the
// running app (open-url below); this lock covers launches that bypass it, e.g.
// `RowAlong.app/Contents/MacOS/RowAlong rowalong://w/<id>` from a terminal: that
// second process hands its command line over ('second-instance') and quits.
const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) app.quit();

// Links wait here until the setup page has loaded and said it's listening
// ('share-link-ready'): a cold start delivers its link before 'ready', long
// before there's a page to send it to. The page then imports it.
const linkQueue = createLinkQueue();

// Bring the setup window forward, making one if it was closed (the app stays
// alive in the Dock with no windows); a new one opens focused and drains the
// queue once its page is listening.
function showSetupWindow() {
  // A clicked link should bring the app forward even if it wasn't active.
  if (process.platform === 'darwin') app.focus({ steal: true });
  if (!setupWin) {
    createSetupWindow();
    return;
  }
  if (setupWin.isMinimized()) setupWin.restore();
  setupWin.show();
  setupWin.focus();
}

function receiveDeepLink(value) {
  if (!isPrimary) return; // quitting: never open a window in a second instance
  const link = toDeepLink(value);
  if (!link) return;
  linkQueue.push(link);
  // Before 'ready' (a cold start) whenReady opens the window; the link waits.
  if (app.isReady()) showSetupWindow();
}

// macOS delivers links here, both to a running app and at a cold start (before
// 'ready', so this must be registered at startup, not in whenReady).
app.on('open-url', (event, url) => {
  event.preventDefault();
  receiveDeepLink(url);
});

// A second launch: take its link if it had one, else just come forward.
app.on('second-instance', (_event, argv) => {
  const link = deepLinkFromArgv(argv);
  if (link) receiveDeepLink(link);
  else if (app.isReady()) showSetupWindow();
});

// Our own command line can carry a link too (a terminal launch, or
// `electron electron/app.cjs rowalong://w/<id>` to try the path in dev).
receiveDeepLink(deepLinkFromArgv(process.argv));

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
    // Wide enough to clear the 880px breakpoint where `.grid` collapses to one
    // column — below that the right rail (templates, history, prefs) drops under
    // the builder instead of sitting beside it. 1048px is the page's own full
    // width (1000px max-width + 24px padding each side); the rest is slack.
    width: 1080,
    height: 860,
    title: 'RowAlong',
    // Match the app's dark surface: hide the native title bar so the page's own
    // background fills that strip (traffic lights stay, floating over the content),
    // and paint the pre-load background the same near-black so there's no flash.
    titleBarStyle: 'hidden',
    backgroundColor: '#151310',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  });
  // Stop handing links to this page as soon as it starts (re)loading; the new
  // page says 'share-link-ready' again once it's listening.
  setupWin.webContents.on('did-start-loading', () => linkQueue.close());
  loadPage(setupWin, 'index');
  setupWin.on('closed', () => {
    setupWin = null;
    linkQueue.close();
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

// The setup page registered its deep-link listener: hand it the queued links,
// and later ones as they arrive. Ignored from any other page (the overlay
// window shares the preload).
ipcMain.on('share-link-ready', (event) => {
  const wc = event.sender;
  if (!setupWin || setupWin.isDestroyed() || wc !== setupWin.webContents) return;
  linkQueue.open((link) => {
    if (wc.isDestroyed()) return false;
    wc.send('open-share-link', link);
    return true;
  });
});

ipcMain.on('start-session', (_event, payload) => {
  openOverlay(payload);
});

ipcMain.on('stop-session', () => {
  // Close the overlay; its 'closed' handler nulls overlayWin and notifies setup,
  // so there's exactly one place that ends a session.
  //
  // Deliberately no setupWin.focus() here: the whole point is that you're
  // watching something. The setup window is a normal window in your main Space,
  // so focusing it makes macOS switch Spaces and yanks you out of the
  // fullscreen video the moment a workout ends. Let the overlay just disappear
  // — setup still gets 'session-ended' and updates its button and history in
  // the background, ready for whenever you switch back.
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
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
  if (!isPrimary) return; // quitting: the running instance has the link
  // Make this app the default handler for rowalong:// links. The scheme itself
  // is declared in Info.plist (`protocols` in electron-builder.yml), which is
  // what lets macOS launch us for it. Packaged builds only: under electron:dev
  // the running bundle is the stock Electron.app, and claiming the scheme for it
  // would send real links to a bare Electron window.
  if (app.isPackaged) app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
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
