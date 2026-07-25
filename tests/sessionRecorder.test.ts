import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, type KeyValueStore } from '../src/core/storage';
import { createRecorder } from '../src/core/sessionRecorder';
import { Segment } from '../src/core/types';

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

  it('snapshots the segments so later edits cannot mutate history', () => {
    const live: Segment[] = [{ id: 'a', intensity: 'easy', durationSec: 60 }];
    const rec = createRecorder(store, { segments: live, programName: 'X', startedAt: 1 });
    rec.finish(60, true);
    live[0].durationSec = 999;
    expect(store.listSessions()[0].segments[0].durationSec).toBe(60);
  });
});
