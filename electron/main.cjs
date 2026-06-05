// Electron overlay spike — verifies an always-on-top window can float over
// ANOTHER app's native macOS fullscreen (Apple TV.app / Netflix.app / QuickTime),
// which Chrome Document Picture-in-Picture cannot do.
//
// Run: npm run spike:electron
//
// The key recipe (macOS):
//   - app.dock.hide()  → accessory (UIElement) app: no dock icon, never the
//     active app, so the overlay doesn't fight the video app for focus.
//   - setAlwaysOnTop(true, 'screen-saver')  → very high window level.
//   - setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true,
//       skipTransformProcessType: true })  → adds the fullScreenAuxiliary +
//     canJoinAllSpaces collection behavior that lets it cross into another
//     app's fullscreen Space.
//   - showInactive()  → show without stealing focus.

const { app, BrowserWindow } = require('electron');
const path = require('path');

function createOverlay() {
  const win = new BrowserWindow({
    width: 240,
    height: 170,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    // Keep focusable so we can rule out the known "needs manual focus" quirk
    // (electron/electron#36364) by clicking it during the test if needed.
    focusable: true,
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });

  win.loadFile(path.join(__dirname, 'overlay.html'));
  win.showInactive();
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  createOverlay();
});

app.on('window-all-closed', () => app.quit());
