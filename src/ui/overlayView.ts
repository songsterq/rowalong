import { INTENSITY_META, Intensity, Segment } from '../core/types';
import type { SessionEngine, SessionState } from '../core/sessionEngine';
import type { Density } from '../core/storage';

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function spmLabel(i: Intensity): string {
  // Just the recommended stroke rate; the intensity name already shows on line 1.
  return `${INTENSITY_META[i].spmLabel} spm`;
}

/** Seconds for one full stroke (drive + recovery) at the intensity's pace. */
export function strokePeriodSec(i: Intensity): number {
  return 60 / INTENSITY_META[i].spm;
}

export function comingUpLabel(next: Segment | null | undefined): string {
  if (!next) return '';
  return `next: ${next.label ?? INTENSITY_META[next.intensity].label}`;
}

export function densityIcon(d: Density): string {
  // pill = compact, so the action is "expand" to coach; coach = expanded, action "collapse".
  return d === 'coach' ? '⤡' : '⤢';
}

export const OVERLAY_CSS = `
  .ov-root { font-family: -apple-system, system-ui, sans-serif; color:#fff;
    border-radius:16px; padding:16px 18px; background:rgba(18,18,20,.92);
    user-select:none; cursor:pointer;
    transition: background .12s ease; }
  .ov-root[data-status="paused"] { opacity:.55; }
  .ov-label { font-weight:800; letter-spacing:.04em; text-transform:uppercase; font-size:15px; }
  .ov-spm { font-size:12px; opacity:.7; margin-top:2px; }
  .ov-count { font-weight:800; line-height:1; font-variant-numeric:tabular-nums;
    font-size:54px; margin:4px 0 0; }
  .ov-bar { height:6px; border-radius:99px; background:rgba(255,255,255,.15); overflow:hidden; }
  .ov-bar > span { display:block; height:100%; border-radius:99px; }
  .ov-extra, .ov-ctrls { display:none; }
  .ov-root[data-density="coach"] .ov-extra { display:flex; justify-content:space-between;
    font-size:12px; opacity:.65; margin-top:10px; }
  .ov-root[data-density="coach"] .ov-ctrls { display:flex; }
  .ov-root:hover .ov-ctrls { display:flex; }
  .ov-ctrls { gap:12px; justify-content:center; margin-top:10px; font-size:16px; }
  .ov-ctrls button { background:none; border:none; color:#fff; cursor:pointer; font-size:16px; opacity:.85; }
  /* Brand signature: a quiet footer that reveals with the controls (coach mode or
     hover), so heads-down pill mode stays pure numbers and the countdown never shifts. */
  .ov-brand { display:none; align-items:center; justify-content:center; gap:6px;
    margin-top:12px; font-size:10px; font-weight:700; letter-spacing:.14em;
    text-transform:uppercase; opacity:.4; }
  .ov-brand svg { width:13px; height:13px; fill:none; stroke:currentColor; stroke-width:2;
    stroke-linecap:round; stroke-linejoin:round; }
  .ov-root[data-density="coach"] .ov-brand { display:flex; }
  .ov-root:hover .ov-brand { display:flex; }
  .ov-paused-tag { display:none; font-size:11px; opacity:.8; margin-top:4px; }
  .ov-root[data-status="paused"] .ov-paused-tag { display:block; }
  @keyframes ov-flash { from { background:rgba(255,255,255,.35);} to { background:rgba(18,18,20,.92);} }
  .ov-root.ov-flash { animation: ov-flash .5s ease; }
  /* Stroke pace bar — fills fast on the drive (0→33%), drains slowly on the
     recovery (33→100%). Period = 60/spm via --stroke-period; pure CSS so it
     runs the same in PiP and Electron and pauses with the card. */
  .ov-head { display:flex; align-items:stretch; justify-content:space-between;
    gap:14px; margin:6px 0 10px; position:relative; }
  .ov-headcol { display:flex; flex-direction:column; min-width:0; }
  /* The stroke column stretches to the text block's height. In pill mode that's
     all bar (full height, flush right). In coach mode the caption sits in-column
     at the bottom — bottom-aligned with the countdown digits — so the bar
     shortens to make room; margin-right keeps the caption within the content. */
  .ov-stroke { position:relative; flex:0 0 auto; align-self:stretch;
    display:flex; flex-direction:column; }
  .ov-root[data-density="coach"] .ov-stroke { margin-right:16px; }
  .ov-stroke-track { width:20px; flex:1 1 auto; border-radius:9px; background:rgba(255,255,255,.15);
    overflow:hidden; display:flex; align-items:flex-end; }
  .ov-stroke-fill { display:block; width:100%; height:10%; border-radius:9px 9px 0 0;
    background:var(--stroke-color,#fff); animation: ov-stroke-bar var(--stroke-period,2s) infinite; }
  @keyframes ov-stroke-bar {
    0%   { height:10%;  animation-timing-function: cubic-bezier(.2,.7,.3,1); }
    33%  { height:100%; animation-timing-function: cubic-bezier(.4,0,.6,1); }
    100% { height:10%; }
  }
  .ov-stroke-cap { display:none; position:relative; margin-top:5px;
    height:11px; text-align:center;
    font-size:9px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; opacity:.6; }
  .ov-root[data-density="coach"] .ov-stroke-cap { display:block; }
  .ov-stroke-cap > span { position:absolute; left:50%; transform:translateX(-50%); white-space:nowrap; }
  .ov-stroke-cap .ov-cap-drive { animation: ov-cap-d var(--stroke-period,2s) infinite steps(1); }
  .ov-stroke-cap .ov-cap-recover { animation: ov-cap-r var(--stroke-period,2s) infinite steps(1); }
  @keyframes ov-cap-d { 0%{opacity:1} 33.34%{opacity:0} 100%{opacity:0} }
  @keyframes ov-cap-r { 0%{opacity:0} 33.34%{opacity:1} 100%{opacity:1} }
  .ov-root[data-status="paused"] .ov-stroke-fill,
  .ov-root[data-status="paused"] .ov-stroke-cap > span { animation-play-state: paused; }
  @media (prefers-reduced-motion: reduce) {
    .ov-stroke-fill { animation: none; height: 55%; }
    .ov-stroke-cap,
    .ov-root[data-density="coach"] .ov-stroke-cap { display: none; }
  }
`;

export interface OverlayOpts {
  density: Density;
  onToggleDensity?: () => void;
  onStop?: () => void;
  /** Drag the overlay body to reposition the host window. dx/dy are screen-px
   *  deltas since the last move. When omitted, the body is click-only (no drag). */
  onDrag?: (dx: number, dy: number) => void;
  /** Report the card's rendered border-box height (px) so an Electron host can
   *  resize its window to hug the content. Electron-only; omitted in the browser. */
  onResize?: (height: number) => void;
  /** The full workout, so the status line can name the upcoming segment. */
  segments?: Segment[];
}

type OverlayEngine = Pick<
  SessionEngine,
  'on' | 'getState' | 'pause' | 'resume' | 'skipNext' | 'skipPrev' | 'stop'
>;

export interface MountedOverlay {
  unmount(): void;
  setDensity(d: Density): void;
}

export function mountOverlay(
  doc: Document,
  engine: OverlayEngine,
  opts: OverlayOpts,
): MountedOverlay {
  const style = doc.createElement('style');
  style.textContent = OVERLAY_CSS;
  doc.head.appendChild(style);

  const root = doc.createElement('div');
  root.className = 'ov-root';
  root.dataset.density = opts.density;
  root.innerHTML = `
    <div class="ov-head">
      <div class="ov-headcol">
        <div class="ov-label"></div>
        <div class="ov-spm"></div>
        <div class="ov-count"></div>
      </div>
      <div class="ov-stroke" aria-hidden="true">
        <div class="ov-stroke-track"><span class="ov-stroke-fill"></span></div>
        <div class="ov-stroke-cap"><span class="ov-cap-drive">DRIVE</span><span class="ov-cap-recover">RECOVER</span></div>
      </div>
    </div>
    <div class="ov-bar"><span></span></div>
    <div class="ov-extra"><span class="ov-next"></span><span class="ov-remain"></span></div>
    <div class="ov-paused-tag">PAUSED — click to resume</div>
    <div class="ov-ctrls">
      <button data-act="prev" title="Previous">⏮</button>
      <button data-act="pause" title="Pause">⏸</button>
      <button data-act="next" title="Next">⏭</button>
      <button data-act="density"></button>
      <button data-act="stop" title="Stop">⏹</button>
    </div>
    <div class="ov-brand">
      <svg viewBox="0 0 24 24"><path d="M2 9c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0M2 15c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0"/></svg>
      <span>RowAlong</span>
    </div>`;
  doc.body.appendChild(root);

  // Electron host only: keep the overlay window hugging the card. The card height
  // changes on density toggle, hover-reveal of controls, and the paused tag — a
  // ResizeObserver catches them all. Countdown ticks don't change height, so this
  // stays quiet during normal running.
  let resizeObs: ResizeObserver | undefined;
  if (opts.onResize) {
    resizeObs = new ResizeObserver(() => opts.onResize!(root.offsetHeight));
    resizeObs.observe(root);
  }

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;

  const densityBtn = root.querySelector('[data-act="density"]') as HTMLButtonElement;
  const pauseBtn = root.querySelector('[data-act="pause"]') as HTMLButtonElement;
  const syncDensityBtn = (d: Density) => {
    densityBtn.textContent = densityIcon(d);
    densityBtn.title = d === 'coach' ? 'Collapse' : 'Expand';
  };
  syncDensityBtn(opts.density);

  const apply = (state: SessionState) => {
    root.dataset.status = state.status;
    const paused = state.status === 'paused';
    pauseBtn.textContent = paused ? '⏵' : '⏸';
    pauseBtn.title = paused ? 'Resume' : 'Pause';
    const seg = state.segment;
    if (!seg) return;
    const meta = INTENSITY_META[seg.intensity];
    root.dataset.intensity = seg.intensity;
    $('.ov-label').textContent = seg.label ?? meta.label;
    $('.ov-label').style.color = meta.color;
    const next = opts.segments?.[state.currentIndex + 1] ?? null;
    $('.ov-spm').textContent = [spmLabel(seg.intensity), comingUpLabel(next)]
      .filter(Boolean)
      .join(' · ');
    $('.ov-count').textContent = formatCountdown(state.segmentRemainingSec);
    // Bar tracks overall workout progress (the countdown already covers the segment).
    const totalDuration = state.totalElapsedSec + state.totalRemainingSec;
    const pct = totalDuration ? (state.totalElapsedSec / totalDuration) * 100 : 0;
    const bar = $('.ov-bar > span') as HTMLElement;
    bar.style.width = `${Math.min(100, pct)}%`;
    bar.style.background = meta.color;
    // Stroke bar: pace to this segment's spm and tint to its color.
    root.style.setProperty('--stroke-period', `${strokePeriodSec(seg.intensity).toFixed(2)}s`);
    root.style.setProperty('--stroke-color', meta.color);
    $('.ov-remain').textContent = `${formatCountdown(state.totalRemainingSec)} left`;
    $('.ov-next').textContent = `Block ${state.currentIndex + 1}/${state.totalSegments}`;
  };

  apply(engine.getState());

  const flash = () => {
    root.classList.remove('ov-flash');
    void root.offsetWidth; // restart animation
    root.classList.add('ov-flash');
  };

  const off = engine.on((e) => {
    if (e.type === 'tick') apply(e.state);
    if (e.type === 'transition') flash();
  });

  const DRAG_THRESHOLD_PX = 4;
  const togglePause = () => {
    const st = engine.getState();
    if (st.status === 'paused') engine.resume();
    else engine.pause();
  };

  if (opts.onDrag) {
    root.style.cursor = 'grab';
    let active = false;
    let dragging = false;
    let startX = 0, startY = 0, lastX = 0, lastY = 0;

    root.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement).closest('.ov-ctrls')) return;
      active = true;
      dragging = false;
      startX = lastX = ev.screenX;
      startY = lastY = ev.screenY;
      try { root.setPointerCapture(ev.pointerId); } catch { /* jsdom / no pointerId */ }
    });

    root.addEventListener('pointermove', (ev) => {
      if (!active) return;
      if (!dragging && Math.hypot(ev.screenX - startX, ev.screenY - startY) > DRAG_THRESHOLD_PX) {
        dragging = true;
        root.style.cursor = 'grabbing';
      }
      if (dragging) {
        opts.onDrag!(ev.screenX - lastX, ev.screenY - lastY);
        lastX = ev.screenX;
        lastY = ev.screenY;
      }
    });

    const finish = (ev: PointerEvent, asClick: boolean) => {
      if (!active) return;
      active = false;
      root.style.cursor = 'grab';
      try { root.releasePointerCapture(ev.pointerId); } catch { /* jsdom / no pointerId */ }
      // a clean pointerup with no real movement is a click; a pointercancel is
      // the OS aborting the gesture and must never toggle pause.
      if (asClick && !dragging) togglePause();
    };
    root.addEventListener('pointerup', (ev) => finish(ev, true));
    root.addEventListener('pointercancel', (ev) => finish(ev, false));
  } else {
    root.addEventListener('click', (ev) => {
      if ((ev.target as HTMLElement).closest('.ov-ctrls')) return;
      togglePause();
    });
  }

  $('.ov-ctrls').addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    ev.stopPropagation();
    switch (btn.dataset.act) {
      case 'prev':
        engine.skipPrev();
        break;
      case 'next':
        engine.skipNext();
        break;
      case 'pause': {
        const st = engine.getState();
        if (st.status === 'paused') engine.resume();
        else engine.pause();
        break;
      }
      case 'density':
        opts.onToggleDensity?.();
        break;
      case 'stop':
        engine.stop();
        opts.onStop?.();
        break;
    }
  });

  return {
    unmount() {
      resizeObs?.disconnect();
      off();
      root.remove();
      style.remove();
    },
    setDensity(d: Density) {
      root.dataset.density = d;
      syncDensityBtn(d);
    },
  };
}
