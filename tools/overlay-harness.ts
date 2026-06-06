/**
 * Overlay visual harness (dev tool — not part of the test suite or typecheck).
 *
 * Renders the REAL overlay (the exact `OVERLAY_CSS` + the DOM that `mountOverlay`
 * produces) for every density / intensity / status into a single self-contained
 * HTML file. Because everything is inlined (no module imports), the output opens
 * in any browser over `file://` — handy for eyeballing layout and for taking
 * deterministic screenshots.
 *
 * Run:  npm run harness     → writes .harness/overlay.html and prints the path
 * Then: open that file in a browser. A control bar lets you freeze the stroke
 *       animation at the catch / drive / finish / recovery, scrub it, or play.
 *
 * It runs under Vitest purely to borrow the jsdom environment + TS transpile;
 * it is excluded from `npm test` (own config) and from `tsc` (lives in tools/).
 */
import { test } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mountOverlay, OVERLAY_CSS } from '../src/ui/overlayView';
import type { SessionState } from '../src/core/sessionEngine';
import type { Intensity, Segment } from '../src/core/types';
import type { Density } from '../src/core/storage';

function fakeEngine(state: SessionState) {
  return {
    on: () => () => {},
    getState: () => state,
    pause: () => {}, resume: () => {}, skipNext: () => {}, skipPrev: () => {}, stop: () => {},
  };
}

const segments: Segment[] = [
  { id: 's0', intensity: 'easy', durationSec: 60 },
  { id: 's1', intensity: 'medium', durationSec: 60 },
  { id: 's2', intensity: 'hard', durationSec: 60 },
  { id: 's3', intensity: 'allout', durationSec: 90 },
  { id: 's4', intensity: 'easy', durationSec: 60 },
];

function stateAt(index: number, status: 'running' | 'paused'): SessionState {
  return {
    status,
    currentIndex: index,
    segment: segments[index],
    segmentElapsedSec: 30,
    segmentRemainingSec: 90,
    totalElapsedSec: 200,
    totalRemainingSec: 400,
    totalSegments: segments.length,
  };
}

// Each card: which segment to show, the density, the status, and a caption.
const CARDS: Array<{ index: number; density: Density; status: 'running' | 'paused'; label: string }> = [
  { index: 0, density: 'pill', status: 'running', label: 'PILL · easy (24 spm)' },
  { index: 2, density: 'pill', status: 'running', label: 'PILL · hard (28 spm)' },
  { index: 3, density: 'pill', status: 'running', label: 'PILL · all-out (30 spm)' },
  { index: 0, density: 'coach', status: 'running', label: 'COACH · easy (24 spm)' },
  { index: 2, density: 'coach', status: 'running', label: 'COACH · hard (28 spm)' },
  { index: 3, density: 'coach', status: 'running', label: 'COACH · all-out (30 spm)' },
  { index: 3, density: 'coach', status: 'paused', label: 'COACH · all-out · PAUSED' },
];

test('generate overlay harness', () => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';

  const container = document.createElement('div');
  container.id = 'cards';

  for (const c of CARDS) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const label = document.createElement('div');
    label.className = 'cell-label';
    label.textContent = c.label;
    cell.appendChild(label);
    container.appendChild(cell);
    mountOverlay(document, fakeEngine(stateAt(c.index, c.status)) as never, {
      density: c.density,
      segments,
    });
    const root = document.body.querySelector('.ov-root:last-of-type') as HTMLElement;
    cell.appendChild(root); // move it out of body into its labelled cell
  }

  const harnessCss = `
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin:0; padding:0 28px 48px; background:#0c0c0e;
      font-family:-apple-system,system-ui,sans-serif; color:#e9e9ec; }
    #bar { position:sticky; top:0; z-index:10; display:flex; align-items:center; gap:8px;
      padding:14px 0; margin-bottom:8px; background:#0c0c0e;
      border-bottom:1px solid rgba(255,255,255,.08); flex-wrap:wrap; }
    #bar b { font-size:13px; margin-right:6px; }
    #bar button { font:inherit; font-size:12px; padding:5px 11px; border-radius:99px; cursor:pointer;
      border:1px solid rgba(255,255,255,.25); background:transparent; color:inherit; }
    #bar button:hover { background:rgba(255,255,255,.1); }
    #bar input[type=range] { width:200px; }
    #bar .hint { font-size:11px; opacity:.5; margin-left:auto; }
    #cards { display:grid; grid-template-columns:repeat(3,max-content); gap:30px 44px; padding-top:16px; }
    @media (max-width:980px){ #cards { grid-template-columns:repeat(2,max-content); } }
    .cell-label { font-size:11px; letter-spacing:.05em; text-transform:uppercase; opacity:.55; margin-bottom:10px; }
    .ov-root { width:300px; }`;

  // Inlined controller (runs in the browser, not jsdom). No backticks / ${} here.
  const controller =
    '<div id="bar">' +
      '<b>Stroke phase:</b>' +
      '<button data-frac="0">Catch</button>' +
      '<button data-frac="0.16">Drive</button>' +
      '<button data-frac="0.33">Finish</button>' +
      '<button data-frac="0.72">Recovery</button>' +
      '<button id="play">▶ Play</button>' +
      '<input id="scrub" type="range" min="0" max="1" step="0.01" value="0">' +
      '<span class="hint">freezes all cards at the same point in the cycle</span>' +
    '</div>' +
    '<script>' +
      'function setFrac(f){document.getAnimations().forEach(function(a){a.pause();a.currentTime=f*a.effect.getTiming().duration;});}' +
      'function play(){document.getAnimations().forEach(function(a){a.play();});}' +
      'document.querySelectorAll("#bar [data-frac]").forEach(function(b){b.onclick=function(){document.getElementById("scrub").value=b.dataset.frac;setFrac(parseFloat(b.dataset.frac));};});' +
      'document.getElementById("play").onclick=play;' +
      'document.getElementById("scrub").oninput=function(e){setFrac(parseFloat(e.target.value));};' +
    '</script>';

  const html =
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Overlay harness</title>' +
    `<style>${OVERLAY_CSS}</style><style>${harnessCss}</style>` +
    `</head><body>${controller}${container.outerHTML}</body></html>`;

  // `npm run harness` runs from the repo root, so cwd is the project root.
  const outDir = join(process.cwd(), '.harness');
  const outPath = join(outDir, 'overlay.html');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, html);
  // eslint-disable-next-line no-console
  console.log(`\n  overlay harness → ${outPath}\n  open it in a browser (file://) to view.\n`);
});
