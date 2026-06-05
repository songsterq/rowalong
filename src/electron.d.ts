import type { Segment } from './core/types';
import type { Prefs } from './core/storage';

/** Payload handed from the setup window to the native overlay window. */
export interface SessionPayload {
  segments: Segment[];
  prefs: Prefs;
}

/** Bridge exposed by electron/preload.cjs via contextBridge. Present only under Electron. */
export interface ElectronAPI {
  /** Setup window → main: open the overlay window and run this session. */
  startSession(payload: SessionPayload): void;
  /** Overlay window → main: end the session and close the overlay window. */
  stopSession(): void;
  /** Overlay window: receive the session payload from main once after load. */
  onSessionPayload(cb: (payload: SessionPayload) => void): void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
