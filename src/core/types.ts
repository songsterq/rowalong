export type Intensity = 'easy' | 'medium' | 'hard' | 'allout';

export interface Segment {
  id: string;
  intensity: Intensity;
  durationSec: number;
  label?: string; // optional display override; future HIIT uses it for exercise names
}

export interface Template {
  id: string;
  name: string;
  segments: Segment[];
}

export type SessionStatus = 'idle' | 'running' | 'paused' | 'done';

export interface IntensityMeta {
  label: string; // 'Easy', 'Medium', 'Hard', 'All-out'
  color: string; // hex used by the overlay
  spmLabel: string; // recommended stroke rate, e.g. '24' or '30–32'
  spm: number; // numeric pace target for the stroke bar, e.g. 30
  kind: 'rest' | 'work';
}

export const INTENSITY_META: Record<Intensity, IntensityMeta> = {
  easy: { label: 'Easy', color: '#34d399', spmLabel: '24', spm: 24, kind: 'rest' },
  medium: { label: 'Medium', color: '#fbbf24', spmLabel: '26', spm: 26, kind: 'rest' },
  hard: { label: 'Hard', color: '#ff8c42', spmLabel: '28', spm: 28, kind: 'work' },
  allout: { label: 'All-out', color: '#ff4d4f', spmLabel: '30–32', spm: 30, kind: 'work' }, // spm = 30: pace to the lower bound of the 30–32 range
};

export function makeId(): string {
  return crypto.randomUUID();
}
