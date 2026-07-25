import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, DEFAULT_PREFS, type KeyValueStore, MAX_SESSIONS } from '../src/core/storage';
import { Template, SessionRecord } from '../src/core/types';

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

const tpl = (id: string, name: string): Template => ({
  id,
  name,
  segments: [{ id: 'a', intensity: 'easy', durationSec: 60 }],
});

let store: Storage;
beforeEach(() => {
  store = new Storage(new Mem());
});

describe('Storage templates', () => {
  it('starts empty', () => {
    expect(store.listTemplates()).toEqual([]);
  });

  it('saves and lists a template', () => {
    store.saveTemplate(tpl('1', 'A'));
    expect(store.listTemplates().map((t) => t.id)).toEqual(['1']);
  });

  it('gets a template by id', () => {
    store.saveTemplate(tpl('1', 'A'));
    expect(store.getTemplate('1')?.name).toBe('A');
    expect(store.getTemplate('missing')).toBeUndefined();
  });

  it('upserts by id', () => {
    store.saveTemplate(tpl('1', 'A'));
    store.saveTemplate(tpl('1', 'A-renamed'));
    expect(store.listTemplates()).toHaveLength(1);
    expect(store.getTemplate('1')?.name).toBe('A-renamed');
  });

  it('deletes a template', () => {
    store.saveTemplate(tpl('1', 'A'));
    store.deleteTemplate('1');
    expect(store.listTemplates()).toEqual([]);
  });
});

describe('Storage prefs', () => {
  it('returns defaults when empty', () => {
    expect(store.getPrefs()).toEqual(DEFAULT_PREFS);
  });

  it('merges partial updates and persists them', () => {
    store.setPrefs({ density: 'coach', muted: true });
    const p = store.getPrefs();
    expect(p.density).toBe('coach');
    expect(p.muted).toBe(true);
    expect(p.volume).toBe(DEFAULT_PREFS.volume);
  });

  it('defaults the push strategy to random', () => {
    expect(DEFAULT_PREFS.lastPushStyle).toBe('random');
  });
});

function sess(id: string, startedAt: number): SessionRecord {
  return {
    id,
    startedAt,
    elapsedSec: 600,
    plannedSec: 1200,
    completed: false,
    programName: '20 min · random',
    segments: [{ id: 'a', intensity: 'easy', durationSec: 60 }],
  };
}

describe('Storage sessions', () => {
  it('starts empty', () => {
    expect(store.listSessions()).toEqual([]);
  });

  it('round-trips a record', () => {
    store.recordSession(sess('a', 1000));
    const all = store.listSessions();
    expect(all).toHaveLength(1);
    expect(all[0].programName).toBe('20 min · random');
    expect(all[0].segments).toHaveLength(1);
  });

  it('appends across calls, oldest first', () => {
    store.recordSession(sess('a', 2000));
    store.recordSession(sess('b', 1000));
    expect(store.listSessions().map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('keeps only the newest MAX_SESSIONS records', () => {
    for (let i = 0; i < MAX_SESSIONS + 5; i++) store.recordSession(sess(`s${i}`, i * 1000));
    const all = store.listSessions();
    expect(all).toHaveLength(MAX_SESSIONS);
    expect(all[0].id).toBe('s5');
    expect(all[all.length - 1].id).toBe(`s${MAX_SESSIONS + 4}`);
  });

  it('falls back to empty on a corrupt payload', () => {
    const mem = new Mem();
    mem.setItem('wh.sessions', '{ not json');
    expect(new Storage(mem).listSessions()).toEqual([]);
  });

  it('falls back to empty when the payload is not an array', () => {
    const mem = new Mem();
    mem.setItem('wh.sessions', '{"nope":true}');
    expect(new Storage(mem).listSessions()).toEqual([]);
  });

  it('does not throw when the backend fails to write (e.g. quota exceeded)', () => {
    class ThrowingSetItem implements KeyValueStore {
      getItem() {
        return null;
      }
      setItem(): void {
        throw new Error('QuotaExceededError');
      }
      removeItem() {}
    }
    const store = new Storage(new ThrowingSetItem());
    expect(() => store.recordSession(sess('a', 1000))).not.toThrow();
  });
});
