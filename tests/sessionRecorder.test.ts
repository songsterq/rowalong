import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, type KeyValueStore } from '../src/core/storage';
import { createRecorder } from '../src/core/sessionRecorder';
import { Segment, SessionRecord } from '../src/core/types';

class Mem implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

/** Captures the exact SessionRecord object reference handed to recordSession,
 *  before Storage's JSON.stringify runs — so tests can inspect createRecorder's
 *  own copying behavior instead of Storage's serialization side effect. */
class CapturingStorage extends Storage {
  captured: SessionRecord | undefined;
  recordSession(r: SessionRecord): void {
    this.captured = r;
    super.recordSession(r);
  }
}

const segments: Segment[] = [
  { id: 'a', intensity: 'easy', durationSec: 600 },
  { id: 'b', intensity: 'hard', durationSec: 600 },
];

let store: Storage;
beforeEach(() => {
  store = new Storage(new Mem());
});

describe('createRecorder', () => {
  it('writes one record with the elapsed time and planned total', () => {
    const rec = createRecorder(store, { segments, programName: 'Quick 20', startedAt: 500 });
    rec.finish(725.4, false);

    const all = store.listSessions();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      startedAt: 500,
      elapsedSec: 725,
      plannedSec: 1200,
      completed: false,
      programName: 'Quick 20',
    });
  });

  it('marks a natural completion', () => {
    const rec = createRecorder(store, { segments, programName: 'Quick 20', startedAt: 500 });
    rec.finish(1200, true);
    expect(store.listSessions()[0].completed).toBe(true);
  });

  it('writes only once even when finish is called again', () => {
    const rec = createRecorder(store, { segments, programName: 'Quick 20', startedAt: 500 });
    rec.finish(600, true);
    rec.finish(600, true);
    rec.finish(900, false);
    expect(store.listSessions()).toHaveLength(1);
    expect(store.listSessions()[0].elapsedSec).toBe(600);
  });

  it('snapshots the segments so later edits cannot mutate the recorded object', () => {
    const capturing = new CapturingStorage(new Mem());
    const live: Segment[] = [{ id: 'a', intensity: 'easy', durationSec: 60 }];
    const rec = createRecorder(capturing, { segments: live, programName: 'X', startedAt: 1 });
    rec.finish(60, true);

    // Mutate the caller's segment *after* finish() returns, then inspect the
    // record object createRecorder actually handed to recordSession (captured
    // by reference, before any JSON serialization). If createRecorder stored
    // ctx.segments directly instead of copying, this mutation would show up
    // here too.
    live[0].durationSec = 999;
    expect(capturing.captured?.segments[0].durationSec).toBe(60);
  });

  it('keeps the write-once guard independent across separate recorder instances', () => {
    const recA = createRecorder(store, { segments, programName: 'A', startedAt: 1 });
    const recB = createRecorder(store, { segments, programName: 'B', startedAt: 2 });

    recA.finish(100, true);
    // recA's guard having tripped must not affect recB's independent guard.
    recB.finish(200, true);

    const all = store.listSessions();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.programName).sort()).toEqual(['A', 'B']);
    expect(all.map((s) => s.elapsedSec).sort((x, y) => x - y)).toEqual([100, 200]);
  });
});
