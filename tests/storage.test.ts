import { describe, it, expect, beforeEach } from 'vitest';
import { Storage, DEFAULT_PREFS, type KeyValueStore } from '../src/core/storage';
import { Template } from '../src/core/types';

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
});
