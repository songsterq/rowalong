import { INTENSITY_META, Intensity, Segment, Template, makeId } from '../core/types';
import { Storage, Density } from '../core/storage';
import { generate, snapMinutes, SUPPORTED_MINUTES } from '../core/generator';
import { PushStyle, PUSH_STYLES } from '../core/pushStyles';
import { starterTemplates } from '../core/starters';
import { parseWorkout, SHARE_LIMITS } from '../core/shareFormat';
import { renderEditor, readEditor } from './segmentEditor';
import { escapeHtml, formatClock, timelineGradient } from './format';
import { SETUP_CSS } from './setupStyles';
import { renderHistory } from './historyPanel';
import { mountExportMenu } from './exportMenu';

const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);
const INTENSITY_ORDER: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[], programName: string) => void;
  /** Called when the start button is clicked while a session is active. */
  onStop?: () => void;
}

/** Handle returned by mountSetup so the host can sync the start/stop button. */
export interface MountedSetup {
  /** Flip the start button between "Start workout" and "Stop workout". */
  setSessionActive(active: boolean): void;
  /** Re-read history from storage and repaint the panel (call after a session ends). */
  refreshHistory(): void;
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
  generate: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7M21 4v4h-4"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM7 3v5h8M7 21v-7h10v7"/></svg>',
  export:
    '<svg viewBox="0 0 24 24"><path d="M12 15V4M7 9l5-5 5 5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  import: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
};

/** The program name an imported workout runs under when its name is blank. */
const IMPORTED_PROGRAM_NAME = 'Imported workout';

function injectStyles(doc: Document): void {
  if (doc.getElementById('wh-setup-css')) return;
  const style = doc.createElement('style');
  style.id = 'wh-setup-css';
  style.textContent = SETUP_CSS;
  doc.head.appendChild(style);
}

export function mountSetup(container: HTMLElement, opts: SetupOpts): MountedSetup {
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
          <h1>RowAlong</h1>
          <p>Rowing intervals that ride on top of whatever you're watching</p>
        </div>
      </header>

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
              <button class="btn setup-export" aria-haspopup="true" aria-expanded="false" aria-controls="setup-export-menu">${ICON.export} Export</button>
            </div>

            <details class="import">
              <summary>Import a workout</summary>
              <div class="import-body">
                <textarea class="setup-import-text" rows="3" spellcheck="false"
                  aria-label="Shared workout text"
                  placeholder="Paste a shared workout here, or choose its .json file"></textarea>
                <div class="import-actions">
                  <button type="button" class="btn setup-import-paste">${ICON.import} Import pasted text</button>
                  <button type="button" class="btn setup-import-choose">Choose file…</button>
                  <input class="setup-import-file" type="file" accept=".json,application/json" hidden />
                </div>
                <p class="setup-import-msg" aria-live="polite" hidden></p>
              </div>
            </details>
          </section>
        </div>

        <div>
          <section class="panel">
            <div class="panel-head"><h2>Templates</h2></div>
            <div class="setup-tpl-list"></div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>History</h2></div>
            <div class="setup-history"></div>
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
  const historyEl = container.querySelector('.setup-history') as HTMLElement;
  const importText = container.querySelector('.setup-import-text') as HTMLTextAreaElement;
  const importFile = container.querySelector('.setup-import-file') as HTMLInputElement;
  const importMsg = container.querySelector('.setup-import-msg') as HTMLElement;
  const exportMenu = mountExportMenu(container.querySelector('.setup') as HTMLElement);
  // Provenance label for the workout currently in the editor: where it came from,
  // not what it now contains, so it survives manual block edits.
  let programName = '';
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

  const renderWorkout = (segments: Segment[], name: string) => {
    programName = name;
    renderEditor(editor, segments, { onChange: refreshSummary });
    refreshSummary();
  };

  const doGenerate = () => {
    // Re-rolls each call; only the random strategy varies (fixed styles ignore the seed).
    seed += 1;
    const mins = snapMinutes(Number(minutesEl.value) || 20);
    const style = strategyEl.value as PushStyle;
    opts.storage.setPrefs({ lastTotalMin: mins, lastPushStyle: style });
    renderWorkout(generate(mins, { pushStyle: style }, seed), `${mins} min · ${style}`);
  };

  const renderTemplates = () => {
    const list = container.querySelector('.setup-tpl-list') as HTMLElement;
    exportMenu.close(); // its anchor may be one of the rows about to be replaced
    const templates = [...starterTemplates(), ...opts.storage.listTemplates()];
    list.innerHTML = templates
      .map((t) => {
        const s = summarize(t.segments);
        const swatches = INTENSITY_ORDER.filter((i) => t.segments.some((seg) => seg.intensity === i))
          .map((i) => `<i style="background:${INTENSITY_META[i].color}"></i>`)
          .join('');
        // Names and ids can come from localStorage or an imported file: escape them.
        const id = escapeHtml(t.id);
        return `<div class="setup-tpl" data-id="${id}">
             <button class="setup-load" data-id="${id}">
               <span class="t-name">${escapeHtml(t.name)}</span>
               <span class="t-meta">${formatClock(s.totalSec)} · ${s.blocks} block${s.blocks === 1 ? '' : 's'}</span>
             </button>
             <span class="t-swatches">${swatches}</span>
             <button class="setup-tpl-export icon-btn" data-id="${id}" title="Export" aria-label="Export ${escapeHtml(t.name)}" aria-haspopup="true" aria-expanded="false" aria-controls="setup-export-menu">${ICON.export}</button>
             <button class="setup-del icon-btn" data-id="${id}" title="Delete" aria-label="Delete">✕</button>
           </div>`;
      })
      .join('');
    list.querySelectorAll<HTMLButtonElement>('.setup-load').forEach((b) =>
      b.addEventListener('click', () => {
        const t = templates.find((x) => x.id === b.dataset.id);
        if (t) renderWorkout(t.segments.map((s) => ({ ...s, id: makeId() })), t.name);
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('.setup-tpl-export').forEach((b) =>
      b.addEventListener('click', () => {
        const t = templates.find((x) => x.id === b.dataset.id);
        if (t) exportMenu.toggle(b, () => ({ name: t.name, segments: t.segments }));
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('.setup-del').forEach((b) =>
      b.addEventListener('click', () => {
        opts.storage.deleteTemplate(b.dataset.id!);
        renderTemplates();
      }),
    );
  };

  const renderHistoryPanel = () => {
    renderHistory(historyEl, opts.storage.listSessions(), {
      onPick: (segments, name) =>
        renderWorkout(
          segments.map((s) => ({ ...s, id: makeId() })),
          name,
        ),
    });
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

  // Export the builder as it stands when an action is picked: named from the name
  // field, else from where the workout came from (a template, a generation, history).
  const exportBtn = container.querySelector('.setup-export') as HTMLButtonElement;
  exportBtn.addEventListener('click', () =>
    exportMenu.toggle(exportBtn, () => ({
      name: nameEl.value.trim() || programName || 'Workout',
      segments: readEditor(editor),
    })),
  );

  // Import: a shared workout replaces what's in the builder, name and all, but is
  // never saved; Save above keeps it as a template if the user wants it. Bad input
  // is rejected whole, with the builder left exactly as it was.
  const showImportMsg = (kind: 'ok' | 'error', text: string) => {
    importMsg.dataset.kind = kind;
    importMsg.textContent = text; // names are untrusted: text only, never markup
    importMsg.hidden = false;
  };
  const clearImportMsg = () => {
    importMsg.hidden = true;
    importMsg.textContent = '';
  };
  /** Validate a share payload and, only if it's good, load it. Returns whether it loaded. */
  const importWorkout = (text: string): boolean => {
    const result = parseWorkout(text);
    if (!result.ok) {
      showImportMsg('error', result.error);
      return false;
    }
    const { name, segments } = result.workout;
    nameEl.value = name;
    renderWorkout(segments, name.trim() || IMPORTED_PROGRAM_NAME);
    showImportMsg(
      'ok',
      `Loaded “${name.trim() || IMPORTED_PROGRAM_NAME}”. Save it to keep it as a template.`,
    );
    return true;
  };

  container.querySelector('.setup-import-paste')!.addEventListener('click', () => {
    if (!importText.value.trim()) {
      showImportMsg('error', 'Paste a shared workout into the box first.');
      return;
    }
    if (importWorkout(importText.value)) importText.value = '';
  });
  importText.addEventListener('input', clearImportMsg);

  container.querySelector('.setup-import-choose')!.addEventListener('click', () => importFile.click());
  // Each choice gets a token, so a slow read can't land on top of a later choice.
  let fileToken = 0;
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = ''; // so choosing the same file again still fires change
    if (!file) return;
    const token = ++fileToken;
    // Don't read what parseWorkout would reject for size anyway.
    if (file.size >= SHARE_LIMITS.maxInputBytes) {
      showImportMsg(
        'error',
        `This file is too large to be a workout: it must be under ${SHARE_LIMITS.maxInputBytes / 1024} KB.`,
      );
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      if (token === fileToken) showImportMsg('error', 'That file couldn’t be read.');
      return;
    }
    if (token === fileToken) importWorkout(text);
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

  // The start button is a Start⇄Stop toggle. While a session is active it stops
  // the running session instead of launching a second one — under Electron a
  // second Start would race the overlay window and crash the main process.
  const startBtn = container.querySelector('.setup-start') as HTMLButtonElement;
  let sessionActive = false;
  const setSessionActive = (active: boolean) => {
    sessionActive = active;
    startBtn.classList.toggle('is-active', active);
    startBtn.innerHTML = active ? `${ICON.stop} Stop workout` : `${ICON.play} Start workout`;
  };
  startBtn.addEventListener('click', () => {
    if (sessionActive) {
      opts.onStop?.();
      return;
    }
    const segments = readEditor(editor);
    if (segments.length === 0) return;
    opts.onStart(segments, programName);
  });

  renderTemplates();
  renderHistoryPanel();
  // Start with a ready-to-run workout so the page is never an empty form.
  renderWorkout(
    generate(initialMin, { pushStyle: initialStyle }, seed),
    `${initialMin} min · ${initialStyle}`,
  );

  return { setSessionActive, refreshHistory: renderHistoryPanel };
}
