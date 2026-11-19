import { INTENSITY_META, Segment } from '../core/types';

/**
 * Escape a string for interpolation into an innerHTML template, as element text or
 * inside a double-quoted attribute. Use it for anything a user or an imported file
 * controls (template names, program names, segment labels, ids). Single quotes are
 * left alone, so never put the result in a single-quoted attribute.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Format a whole number of seconds as `m:ss` (e.g. 90 -> '1:30'). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Build a single horizontal `linear-gradient` for the whole workout. Each segment
 * stays solid through its middle and cross-fades into its neighbour across a blend
 * zone centred on every boundary, so abutting colors meet smoothly instead of with
 * a hard edge. `blend` is a percentage of the total width applied on each side of a
 * boundary, clamped to half a segment so short slivers don't invert their stops.
 */
export function timelineGradient(segments: Segment[], blend = 0.8): string {
  const total = segments.reduce((sum, s) => sum + s.durationSec, 0);
  if (total <= 0) return 'transparent';

  const stops: string[] = [];
  let pos = 0;
  for (const s of segments) {
    const width = (s.durationSec / total) * 100;
    const inner = Math.min(blend, width / 2);
    const { color } = INTENSITY_META[s.intensity];
    stops.push(`${color} ${(pos + inner).toFixed(2)}%`);
    stops.push(`${color} ${(pos + width - inner).toFixed(2)}%`);
    pos += width;
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
