// Preload for both windows. Exposes a minimal, typed bridge (see src/electron.d.ts).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // setup window → main
  startSession: (payload) => ipcRenderer.send('start-session', payload),
  // overlay window → main
  stopSession: () => ipcRenderer.send('stop-session'),
  // main → overlay window (delivered once after load)
  onSessionPayload: (cb) =>
    ipcRenderer.on('session-payload', (_event, payload) => cb(payload)),
});
