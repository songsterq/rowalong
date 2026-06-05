import { INTENSITY_META, Intensity } from '../core/types';
import type { SessionEngine, SessionState } from '../core/sessionEngine';
import type { Density } from '../core/storage';

export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function spmText(i: Intensity): string {
  const meta = INTENSITY_META[i];
  return `${meta.label} · ${meta.spmLabel} spm`;
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
    font-size:54px; margin:6px 0 10px; }
  .ov-bar { height:6px; border-radius:99px; background:rgba(255,255,255,.15); overflow:hidden; }
  .ov-bar > span { display:block; height:100%; border-radius:99px; }
  .ov-extra, .ov-ctrls { display:none; }
  .ov-root[data-density="coach"] .ov-extra { display:flex; justify-content:space-between;
    font-size:12px; opacity:.65; margin-top:10px; }
  .ov-root[data-density="coach"] .ov-ctrls { display:flex; }
  .ov-root:hover .ov-ctrls { display:flex; }
  .ov-ctrls { gap:12px; justify-content:center; margin-top:10px; font-size:16px; }
  .ov-ctrls button { background:none; border:none; color:#fff; cursor:pointer; font-size:16px; opacity:.85; }
  .ov-paused-tag { display:none; font-size:11px; opacity:.8; margin-top:4px; }
  .ov-root[data-status="paused"] .ov-paused-tag { display:block; }
  @keyframes ov-flash { from { background:rgba(255,255,255,.35);} to { background:rgba(18,18,20,.92);} }
  .ov-root.ov-flash { animation: ov-flash .5s ease; }
`;

export interface OverlayOpts {
  density: Density;
  onToggleDensity?: () => void;
  onStop?: () => void;
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
    <div class="ov-label"></div>
    <div class="ov-spm"></div>
    <div class="ov-count"></div>
    <div class="ov-bar"><span></span></div>
    <div class="ov-extra"><span class="ov-next"></span><span class="ov-remain"></span></div>
    <div class="ov-paused-tag">PAUSED — click to resume</div>
    <div class="ov-ctrls">
      <button data-act="prev" title="Previous">⏮</button>
      <button data-act="pause" title="Pause/Resume">⏯</button>
      <button data-act="next" title="Next">⏭</button>
      <button data-act="density" title="Toggle density">▣</button>
      <button data-act="stop" title="Stop">⏹</button>
    </div>`;
  doc.body.appendChild(root);

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;

  const apply = (state: SessionState) => {
    root.dataset.status = state.status;
    const seg = state.segment;
    if (!seg) return;
    const meta = INTENSITY_META[seg.intensity];
    root.dataset.intensity = seg.intensity;
    $('.ov-label').textContent = seg.label ?? meta.label;
    $('.ov-label').style.color = meta.color;
    $('.ov-spm').textContent = spmText(seg.intensity);
    $('.ov-count').textContent = formatCountdown(state.segmentRemainingSec);
    const pct = seg.durationSec ? (state.segmentElapsedSec / seg.durationSec) * 100 : 0;
    const bar = $('.ov-bar > span') as HTMLElement;
    bar.style.width = `${Math.min(100, pct)}%`;
    bar.style.background = meta.color;
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

  root.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('.ov-ctrls')) return; // controls handled below
    const st = engine.getState();
    if (st.status === 'paused') engine.resume();
    else engine.pause();
  });

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
      off();
      root.remove();
      style.remove();
    },
    setDensity(d: Density) {
      root.dataset.density = d;
    },
  };
}
