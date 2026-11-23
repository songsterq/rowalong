import { INTENSITY_META, Intensity, Segment, Template, makeId } from '../core/types';
import { Storage, Density } from '../core/storage';
import { generate, snapMinutes, SUPPORTED_MINUTES } from '../core/generator';
import { PushStyle, PUSH_STYLES } from '../core/pushStyles';
import { starterTemplates } from '../core/starters';
import { parseWorkout, MAX_INPUT_BYTES, TOO_LARGE_ERROR } from '../core/shareFormat';
import { renderEditor, readEditor } from './segmentEditor';
import { escapeHtml, formatClock, timelineGradient } from './format';
import { SETUP_CSS } from './setupStyles';
import { renderHistory } from './historyPanel';
import { ShareIO, webShareIO, prepareExport } from './shareActions';

const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);
const INTENSITY_ORDER: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[], programName: string) => void;
  /** Called when the start button is clicked while a session is active. */
  onStop?: () => void;
  /** Where exports go. Defaults to the web APIs (a Blob download and navigator.clipboard). */
  share?: ShareIO;
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
  play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  export: '<svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  import: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 10l5 5 5-5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>', // export, reversed
};

/** How long an export confirmation stays up; failures stay longer so they can be read. */
const TOAST_MS = { ok: 2500, error: 6000 } as const;

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
              <div class="head-end">
                <span class="hint">Generate or import a workout, then fine-tune the blocks</span>
                <button class="btn btn-sm setup-import-toggle" aria-expanded="false" aria-controls="setup-import">${ICON.import} Import</button>
              </div>
            </div>

            <div class="import-box setup-import" id="setup-import" hidden>
              <textarea class="setup-import-text" rows="5" spellcheck="false" aria-label="Workout to import"
                placeholder="Paste an exported workout here"></textarea>
              <p class="import-error setup-import-error" role="alert" hidden></p>
              <div class="import-actions">
                <label class="btn btn-sm import-file">
                  <input class="setup-import-file" type="file" accept=".json,application/json" />
                  Choose file…
                </label>
                <span class="import-note">Loads into the builder. Nothing is saved until you press Save.</span>
                <button class="btn btn-sm setup-import-cancel">Cancel</button>
                <button class="btn btn-sm setup-import-load">Load</button>
              </div>
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
              <span class="export-anchor">
                <button class="btn setup-export" aria-haspopup="menu" aria-expanded="false">${ICON.export} Export</button>
              </span>
            </div>
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

      <div class="setup-toast" role="status" aria-live="polite" data-show="false"></div>

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
  const importToggle = container.querySelector('.setup-import-toggle') as HTMLButtonElement;
  const importBox = container.querySelector('.setup-import') as HTMLElement;
  const importText = container.querySelector('.setup-import-text') as HTMLTextAreaElement;
  const importFile = container.querySelector('.setup-import-file') as HTMLInputElement;
  const importError = container.querySelector('.setup-import-error') as HTMLElement;
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

  // ---- export: one menu (Download / Copy), moved under whichever control opened it ----
  const doc = container.ownerDocument;
  const share = opts.share ?? webShareIO;
  const toastEl = container.querySelector('.setup-toast') as HTMLElement;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  /** Brief status line. textContent only: workout names can come from a shared file. */
  const notify = (message: string, tone: keyof typeof TOAST_MS = 'ok') => {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.dataset.tone = tone;
    toastEl.dataset.show = 'true';
    toastTimer = setTimeout(() => (toastEl.dataset.show = 'false'), TOAST_MS[tone]);
  };

  const exportMenu = doc.createElement('div');
  exportMenu.className = 'export-menu';
  exportMenu.setAttribute('role', 'menu');
  exportMenu.hidden = true;
  exportMenu.innerHTML = `
    <button type="button" role="menuitem" data-action="download">${ICON.download} Download .json file</button>
    <button type="button" role="menuitem" data-action="copy">${ICON.copy} Copy as text</button>`;
  const menuItems = Array.from(exportMenu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  let menuTrigger: HTMLButtonElement | null = null;
  let menuPayload: { name: string; fileName: string; text: string } | null = null;

  const onPointerOutside = (ev: Event) => {
    const target = ev.target as Node;
    if (exportMenu.contains(target) || menuTrigger?.contains(target)) return;
    closeExportMenu();
  };
  const closeExportMenu = (refocus = false) => {
    if (!menuTrigger) return;
    exportMenu.hidden = true;
    menuTrigger.setAttribute('aria-expanded', 'false');
    if (refocus) menuTrigger.focus();
    menuTrigger = null;
    menuPayload = null;
    doc.removeEventListener('pointerdown', onPointerOutside, true);
  };
  /** Open the menu for a workout, or say why it can't be exported. A second click
   *  on the control that opened it closes it. */
  const openExportMenu = (trigger: HTMLButtonElement, name: string, segments: Segment[]) => {
    const toggledOff = menuTrigger === trigger;
    closeExportMenu();
    if (toggledOff) return;
    const prepared = prepareExport(name, segments);
    if (!prepared.ok) {
      notify(prepared.error, 'error');
      return;
    }
    menuPayload = prepared;
    menuTrigger = trigger;
    trigger.parentElement!.appendChild(exportMenu);
    exportMenu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    doc.addEventListener('pointerdown', onPointerOutside, true);
    menuItems[0].focus();
  };

  exportMenu.addEventListener('click', (ev) => {
    const item = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!item || !menuPayload) return;
    const { name, fileName, text } = menuPayload;
    closeExportMenu(true);
    if (item.dataset.action === 'download') {
      try {
        share.download(fileName, text);
        notify(`Downloading ${fileName}`);
      } catch {
        notify("Couldn't download the file. Try Copy as text instead.", 'error');
      }
    } else {
      share.copy(text).then(
        () => notify(`Copied “${name}” to the clipboard`),
        () => notify("Couldn't copy to the clipboard. Try Download .json file instead.", 'error'),
      );
    }
  });
  exportMenu.addEventListener('keydown', (ev) => {
    const at = menuItems.indexOf(doc.activeElement as HTMLButtonElement);
    if (ev.key === 'Escape') closeExportMenu(true);
    else if (ev.key === 'ArrowDown') menuItems[(at + 1) % menuItems.length].focus();
    else if (ev.key === 'ArrowUp') menuItems[(at - 1 + menuItems.length) % menuItems.length].focus();
    else return;
    ev.preventDefault();
  });
  // Tabbing away closes it. (A click elsewhere is caught by onPointerOutside; a null
  // relatedTarget is left to it, so clicking the trigger again still toggles.)
  exportMenu.addEventListener('focusout', (ev) => {
    const next = (ev as FocusEvent).relatedTarget as Node | null;
    if (next && !exportMenu.contains(next) && !menuTrigger?.contains(next)) closeExportMenu();
  });

  const exportBtn = container.querySelector('.setup-export') as HTMLButtonElement;
  exportBtn.addEventListener('click', () =>
    openExportMenu(exportBtn, nameEl.value.trim() || programName || 'Untitled', readEditor(editor)),
  );

  const renderTemplates = () => {
    closeExportMenu(); // its row is about to be replaced
    const list = container.querySelector('.setup-tpl-list') as HTMLElement;
    const templates = [...starterTemplates(), ...opts.storage.listTemplates()];
    list.innerHTML = templates
      .map((t) => {
        const s = summarize(t.segments);
        const swatches = INTENSITY_ORDER.filter((i) => t.segments.some((seg) => seg.intensity === i))
          .map((i) => `<i style="background:${INTENSITY_META[i].color}"></i>`)
          .join('');
        // Names and ids can come from a shared file, so escape them before they hit innerHTML.
        const id = escapeHtml(t.id);
        return `<div class="setup-tpl" data-id="${id}">
             <button class="setup-load" data-id="${id}">
               <span class="t-name">${escapeHtml(t.name)}</span>
               <span class="t-meta">${formatClock(s.totalSec)} · ${s.blocks} block${s.blocks === 1 ? '' : 's'}</span>
             </button>
             <span class="t-swatches">${swatches}</span>
             <span class="export-anchor">
               <button class="setup-export-tpl icon-btn" data-id="${id}" title="Export" aria-label="Export"
                 aria-haspopup="menu" aria-expanded="false">${ICON.export}</button>
             </span>
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
    list.querySelectorAll<HTMLButtonElement>('.setup-export-tpl').forEach((b) =>
      b.addEventListener('click', () => {
        const t = templates.find((x) => x.id === b.dataset.id);
        if (t) openExportMenu(b, t.name, t.segments);
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('.setup-del').forEach((b) =>
      b.addEventListener('click', () => {
        opts.storage.deleteTemplate(b.dataset.id!);
        renderTemplates();
      }),
    );
  };

  const showImportError = (message: string) => {
    importError.textContent = message; // text, not markup: never trust what's being imported
    importError.hidden = false;
  };
  const setImportOpen = (open: boolean) => {
    importBox.hidden = !open;
    importToggle.setAttribute('aria-expanded', String(open));
    importText.value = '';
    importError.hidden = true;
    importError.textContent = '';
    if (open) importText.focus();
  };
  // All or nothing: bad input shows parseWorkout's message and leaves the builder as
  // it was. A good one replaces the builder's workout but saves nothing; the user
  // keeps it as a template with Save if they want.
  const importWorkout = (text: string) => {
    const result = parseWorkout(text);
    if (!result.ok) return showImportError(result.error);
    const { name, segments } = result.workout; // segments come with fresh ids
    renderWorkout(segments, name.trim() || 'Imported workout');
    nameEl.value = name;
    setImportOpen(false);
  };

  importToggle.addEventListener('click', () => setImportOpen(Boolean(importBox.hidden)));
  container.querySelector('.setup-import-cancel')!.addEventListener('click', () => setImportOpen(false));
  container.querySelector('.setup-import-load')!.addEventListener('click', () => {
    if (!importText.value.trim()) return showImportError('Paste an exported workout first, or choose a file.');
    importWorkout(importText.value);
  });
  importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = ''; // so picking the same file again still fires change
    if (!file) return;
    // Refuse by size before reading: a wrong pick (a video, say) shouldn't be read into memory.
    if (file.size >= MAX_INPUT_BYTES) return showImportError(TOO_LARGE_ERROR);
    let text: string;
    try {
      text = await file.text();
    } catch {
      return showImportError("That file couldn't be read.");
    }
    importWorkout(text);
  });

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
