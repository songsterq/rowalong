import { Template } from './types';

export type Density = 'pill' | 'coach';

export interface Prefs {
  density: Density;
  volume: number; // 0..1
  muted: boolean;
  lastTotalMin: number;
}

export const DEFAULT_PREFS: Prefs = {
  density: 'pill',
  volume: 0.6,
  muted: false,
  lastTotalMin: 20,
};

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const TEMPLATES_KEY = 'wh.templates';
const PREFS_KEY = 'wh.prefs';

export class Storage {
  constructor(private readonly backend: KeyValueStore = localStorage) {}

  listTemplates(): Template[] {
    const raw = this.backend.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Template[]) : [];
    } catch {
      return [];
    }
  }

  getTemplate(id: string): Template | undefined {
    return this.listTemplates().find((t) => t.id === id);
  }

  saveTemplate(t: Template): void {
    const all = this.listTemplates().filter((x) => x.id !== t.id);
    all.push(t);
    this.backend.setItem(TEMPLATES_KEY, JSON.stringify(all));
  }

  deleteTemplate(id: string): void {
    const all = this.listTemplates().filter((t) => t.id !== id);
    this.backend.setItem(TEMPLATES_KEY, JSON.stringify(all));
  }

  getPrefs(): Prefs {
    const raw = this.backend.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    try {
      return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  setPrefs(patch: Partial<Prefs>): void {
    const next = { ...this.getPrefs(), ...patch };
    this.backend.setItem(PREFS_KEY, JSON.stringify(next));
  }
}
