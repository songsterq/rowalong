'use strict';

// Pure geometry helpers for restoring the overlay window's last bounds.
// No electron/fs imports so this is unit-testable; app.cjs supplies real data.

function isRect(b) {
  return (
    b != null &&
    typeof b.x === 'number' && Number.isFinite(b.x) &&
    typeof b.y === 'number' && Number.isFinite(b.y) &&
    typeof b.width === 'number' && b.width > 0 &&
    typeof b.height === 'number' && b.height > 0
  );
}

function intersects(a, b) {
  const ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ix > 0 && iy > 0;
}

// True when `bounds` has a positive-area overlap with at least one display work area.
// A window stranded on a disconnected monitor overlaps nothing → false.
function isVisibleOnSomeDisplay(bounds, displays) {
  if (!isRect(bounds) || !Array.isArray(displays)) return false;
  return displays.some((d) => isRect(d) && intersects(bounds, d));
}

// Returns the bounds to construct the overlay BrowserWindow with.
// - Unusable/missing/off-screen saved bounds → { width, height } only (Electron centres it).
// - Valid saved bounds → { x, y, width, height }, with size floored to the minimum.
function pickStartBounds(saved, displays, config) {
  const { width, height, minWidth, minHeight } = config;
  if (!isVisibleOnSomeDisplay(saved, displays)) {
    return { width, height };
  }
  return {
    x: saved.x,
    y: saved.y,
    width: Math.max(saved.width, minWidth),
    height: Math.max(saved.height, minHeight),
  };
}

module.exports = { pickStartBounds, isVisibleOnSomeDisplay };
