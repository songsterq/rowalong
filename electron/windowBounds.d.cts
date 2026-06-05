export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoundsConfig {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

export interface StartBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export function isVisibleOnSomeDisplay(bounds: unknown, displays: Rect[]): boolean;
export function pickStartBounds(saved: unknown, displays: Rect[], config: BoundsConfig): StartBounds;
