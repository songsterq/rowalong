import { Storage } from './storage';
import { Segment, makeId } from './types';

export interface SessionContext {
  segments: Segment[];
  programName: string;
  startedAt: number; // epoch ms
}

export interface SessionRecorder {
  /** Write the record. Safe to call more than once — only the first call lands. */
  finish(elapsedSec: number, completed: boolean): void;
}

/** Both hosts can reach the end of a session twice (the engine's `complete`
 *  event *and* teardown), so writing is guarded to one record per run. */
export function createRecorder(storage: Storage, ctx: SessionContext): SessionRecorder {
  let written = false;
  return {
    finish(elapsedSec: number, completed: boolean): void {
      if (written) return;
      written = true;
      storage.recordSession({
        id: makeId(),
        startedAt: ctx.startedAt,
        elapsedSec: Math.round(elapsedSec),
        plannedSec: ctx.segments.reduce((sum, s) => sum + s.durationSec, 0),
        completed,
        programName: ctx.programName,
        segments: ctx.segments.map((s) => ({ ...s })),
      });
    },
  };
}
