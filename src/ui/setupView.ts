import { INTENSITY_META, Intensity, Segment, Template, makeId } from '../core/types';
import { Storage, Density } from '../core/storage';
import { generate, snapMinutes, SUPPORTED_MINUTES } from '../core/generator';
import { PushStyle, PUSH_STYLES } from '../core/pushStyles';
import { starterTemplates } from '../core/starters';
import { renderEditor, readEditor } from './segmentEditor';
import { formatClock, timelineGradient } from './format';
import { SETUP_CSS } from './setupStyles';

const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);
const INTENSITY_ORDER: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[]) => void;
}

export interface WorkoutSummary {
  totalSec: number;
  blocks: number;
  workBlocks: number;
}

/** Roll-up stats for the start bar. Work blocks are the higher-effort intensities. */
export function summarize(segments: Segment[]): WorkoutSummary {
  return {
    totalSec: segments.reduce((sum, s) => sum + s.durationSec, 0),
    blocks: segments.length,
    workBlocks: segments.filter((s) => INTENSITY_META[s.intensity].kind === 'work').length,
  };
}

const ICON = {
  waves:
    '<svg viewBox="0 0 24 24"><path d="M2 9c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0M2 15c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0"/></svg>',
  strength: '<svg viewBox="0 0 24 24"><path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/></svg>',
  generate: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM7 3v5h8M7 21v-7h10v7"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
};

function injectStyles(doc: Document): void {
  if (doc.getElementById('wh-setup-css')) return;
  const style = doc.createElement('style');
  style.id = 'wh-setup-css';
  style.textContent = SETUP_CSS;
  doc.head.appendChild(style);
}

export function mountSetup(container: HTMLElement, opts: SetupOpts): void {
  injectStyles(container.ownerDocument);

  const prefs = opts.storage.getPrefs();
  const initialStyle: PushStyle = PUSH_STYLES.includes(prefs.lastPushStyle)
    ? prefs.lastPushStyle
    : 'random';
  const initialMin = snapMinutes(prefs.lastTotalMin);

  const legend = INTENSITY_ORDER.map((i) => {
    const m = INTENSITY_META[i];
    return `<span><i style="background:${m.color}"></i>${m.label} · ${m.spmLabel} spm</span>`;
  }).join('');

  container.innerHTML = `
    <div class="setup">
      <div class="setup-dragbar"></div>
      <header class="brand">
        <div class="brand-mark">${ICON.waves}</div>
        <div>
          <h1>Workout Helper</h1>
          <p>Interval training, always on top of your screen</p>
        </div>
      </header>

      <nav class="tabs" role="tablist" aria-label="Workout type">
        <div class="tab active" role="tab" aria-selected="true">${ICON.waves} Rowing</div>
        <div class="tab" role="tab" aria-disabled="true">${ICON.strength} Strength <span class="soon">Soon</span></div>
      </nav>

      <div class="grid">
        <div>
          <section class="panel">
            <div class="panel-head">
              <h2>Build session</h2>
              <span class="hint">Generate a workout, then fine-tune the blocks</span>
            </div>

            <div class="controls">
              <div class="field">
                <label id="dur-label">Duration</label>
                <div class="seg-group setup-minutes-group" role="group" aria-labelledby="dur-label">
                  ${SUPPORTED_MINUTES.map(
                    (m) =>
                      `<button type="button" data-min="${m}" aria-pressed="${m === initialMin}">${m}<span class="u">min</span></button>`,
                  ).join('')}
                </div>
                <select class="setup-minutes" aria-hidden="true" tabindex="-1">
                  ${SUPPORTED_MINUTES.map(
                    (m) => `<option value="${m}" ${m === initialMin ? 'selected' : ''}>${m}</option>`,
                  ).join('')}
                </select>
              </div>
              <div class="field">
                <label>Push strategy</label>
                <div class="select">
                  <select class="setup-strategy">
                    ${PUSH_STYLES.map(
                      (s) =>
                        `<option value="${s}" ${s === initialStyle ? 'selected' : ''}>${titleCase(s)}</option>`,
                    ).join('')}
                  </select>
                </div>
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="btn setup-generate">${ICON.generate} Generate</button>
              </div>
            </div>

            <div class="timeline-wrap">
              <div class="timeline-label"><span>Workout shape</span><span class="setup-tl-total">0:00</span></div>
              <div class="timeline setup-timeline"></div>
              <div class="legend">${legend}</div>
            </div>

            <div class="setup-editor"></div>

            <div class="save-row">
              <input class="setup-name" type="text" placeholder="Name this session to save it as a template" />
              <button class="btn setup-save">${ICON.save} Save</button>
            </div>
          </section>
        </div>

        <div>
          <section class="panel">
            <div class="panel-head"><h2>Templates</h2></div>
            <div class="setup-tpl-list"></div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Preferences</h2></div>
            <div class="pref">
              <div class="pref-row">
                <label>Overlay density</label>
                <div class="select">
                  <select class="setup-density">
                    <option value="pill" ${prefs.density === 'pill' ? 'selected' : ''}>Minimal</option>
                    <option value="coach" ${prefs.density === 'coach' ? 'selected' : ''}>Coach</option>
                  </select>
                </div>
              </div>
              <div class="pref-row">
                <label>Cue volume</label>
                <input class="setup-volume" type="range" min="0" max="1" step="0.05" value="${prefs.volume}" />
              </div>
              <div class="pref-row">
                <label>Mute tones</label>
                <span class="toggle">
                  <input class="setup-muted" type="checkbox" ${prefs.muted ? 'checked' : ''} />
                  <span class="track"></span>
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div class="setup-startbar" data-empty="true">
        <div class="setup-startbar-inner">
          <div class="summary">
            <span class="total setup-summary-total">0:00</span>
            <span class="sub setup-summary-sub"></span>
          </div>
          <button class="setup-start">${ICON.play} Start workout</button>
        </div>
      </div>
    </div>`;

  // Electron hides the native title bar; give the top strip a drag region and clear
  // the traffic lights. In the browser this class is never added, so layout is unchanged.
  if (window.electronAPI) {
    (container.querySelector('.setup') as HTMLElement).classList.add('is-electron');
  }

  const editor = container.querySelector('.setup-editor') as HTMLElement;
  const minutesEl = container.querySelector('.setup-minutes') as HTMLSelectElement;
  const minuteBtns = Array.from(
    container.querySelectorAll<HTMLButtonElement>('.setup-minutes-group button'),
  );
  const strategyEl = container.querySelector('.setup-strategy') as HTMLSelectElement;
  const nameEl = container.querySelector('.setup-name') as HTMLInputElement;
  const timelineEl = container.querySelector('.setup-timeline') as HTMLElement;
  const tlTotalEl = container.querySelector('.setup-tl-total') as HTMLElement;
  const startbar = container.querySelector('.setup-startbar') as HTMLElement;
  const summaryTotal = container.querySelector('.setup-summary-total') as HTMLElement;
  const summarySub = container.querySelector('.setup-summary-sub') as HTMLElement;
  let seed = 0;

  const refreshSummary = () => {
    const segments = readEditor(editor);
    const s = summarize(segments);
    timelineEl.style.backgroundImage = segments.length ? timelineGradient(segments) : 'none';
    const total = formatClock(s.totalSec);
    tlTotalEl.textContent = total;
    summaryTotal.textContent = total;
    summarySub.innerHTML = `<b>${s.blocks} block${s.blocks === 1 ? '' : 's'}</b>${
      s.workBlocks ? ` · ${s.workBlocks} work` : ''
    }`;
    startbar.dataset.empty = String(s.blocks === 0);
  };

  const renderWorkout = (segments: Segment[]) => {
    renderEditor(editor, segments, { onChange: refreshSummary });
    refreshSummary();
  };

  const doGenerate = () => {
    // Re-rolls each call; only the random strategy varies (fixed styles ignore the seed).
    seed += 1;
    const mins = snapMinutes(Number(minutesEl.value) || 20);
    const style = strategyEl.value as PushStyle;
    opts.storage.setPrefs({ lastTotalMin: mins, lastPushStyle: style });
    renderWorkout(generate(mins, { pushStyle: style }, seed));
  };

  const renderTemplates = () => {
    const list = container.querySelector('.setup-tpl-list') as HTMLElement;
    const templates = [...starterTemplates(), ...opts.storage.listTemplates()];
    list.innerHTML = templates
      .map((t) => {
        const s = summarize(t.segments);
        const swatches = INTENSITY_ORDER.filter((i) => t.segments.some((seg) => seg.intensity === i))
          .map((i) => `<i style="background:${INTENSITY_META[i].color}"></i>`)
          .join('');
        return `<div class="setup-tpl" data-id="${t.id}">
             <button class="setup-load" data-id="${t.id}">
               <span class="t-name">${t.name}</span>
               <span class="t-meta">${formatClock(s.totalSec)} · ${s.blocks} block${s.blocks === 1 ? '' : 's'}</span>
             </button>
             <span class="t-swatches">${swatches}</span>
             <button class="setup-del icon-btn" data-id="${t.id}" title="Delete" aria-label="Delete">✕</button>
           </div>`;
      })
      .join('');
    list.querySelectorAll<HTMLButtonElement>('.setup-load').forEach((b) =>
      b.addEventListener('click', () => {
        const t = templates.find((x) => x.id === b.dataset.id);
        if (t) renderWorkout(t.segments.map((s) => ({ ...s, id: makeId() })));
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('.setup-del').forEach((b) =>
      b.addEventListener('click', () => {
        opts.storage.deleteTemplate(b.dataset.id!);
        renderTemplates();
      }),
    );
  };

  // Any config change rolls a fresh workout; manual block edits persist until then.
  container.querySelector('.setup-generate')!.addEventListener('click', doGenerate);
  strategyEl.addEventListener('change', doGenerate);
  minuteBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      minutesEl.value = btn.dataset.min!;
      minuteBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      doGenerate();
    }),
  );

  container.querySelector('.setup-save')!.addEventListener('click', () => {
    const segments = readEditor(editor);
    if (segments.length === 0) return;
    const tpl: Template = {
      id: makeId(),
      name: nameEl.value.trim() || 'Untitled',
      segments,
    };
    opts.storage.saveTemplate(tpl);
    nameEl.value = '';
    renderTemplates();
  });

  container.querySelector('.setup-density')!.addEventListener('change', (e) => {
    opts.storage.setPrefs({ density: (e.target as HTMLSelectElement).value as Density });
  });
  container.querySelector('.setup-volume')!.addEventListener('input', (e) => {
    opts.storage.setPrefs({ volume: Number((e.target as HTMLInputElement).value) });
  });
  container.querySelector('.setup-muted')!.addEventListener('change', (e) => {
    opts.storage.setPrefs({ muted: (e.target as HTMLInputElement).checked });
  });

  container.querySelector('.setup-start')!.addEventListener('click', () => {
    const segments = readEditor(editor);
    if (segments.length === 0) return;
    opts.onStart(segments);
  });

  renderTemplates();
  // Start with a ready-to-run workout so the page is never an empty form.
  renderWorkout(generate(initialMin, { pushStyle: initialStyle }, seed));
}
