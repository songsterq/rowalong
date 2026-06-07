// Preload for both windows. Exposes a minimal, typed bridge (see src/electron.d.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // setup window → main
  startSession: (payload) => ipcRenderer.send('start-session', payload),
  // overlay window → main
  stopSession: () => ipcRenderer.send('stop-session'),
  moveOverlayBy: (dx, dy) => ipcRenderer.send('move-overlay-by', { dx, dy }),
  setOverlayHeight: (h) => ipcRenderer.send('set-overlay-height', h),
  // main → overlay window (delivered once after load)
  onSessionPayload: (cb) =>
    ipcRenderer.on('session-payload', (_event, payload) => cb(payload)),
  // main → setup window: the overlay closed, so the session ended — reset the toggle.
  onSessionEnded: (cb) => ipcRenderer.on('session-ended', () => cb()),
});
