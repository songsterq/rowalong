import { INTENSITY_META, Intensity, Segment, Template, makeId } from '../core/types';
import { Storage, Density } from '../core/storage';
import { generate, snapMinutes, SUPPORTED_MINUTES } from '../core/generator';
import { PushStyle, PUSH_STYLES } from '../core/pushStyles';
import { starterTemplates } from '../core/starters';
import { renderEditor, readEditor } from './segmentEditor';
import { escapeHtml, formatClock, timelineGradient } from './format';
import { SETUP_CSS } from './setupStyles';
import { renderHistory } from './historyPanel';
import { fromSharedWorkout, toSharedWorkout } from '../core/share';
import { createShareClient, ShareClient } from '../core/shareClient';

const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);
const INTENSITY_ORDER: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[], programName: string) => void;
  /** Called when the start button is clicked while a session is active. */
  onStop?: () => void;
  /** Share API client. Defaults to one on SHARE_BASE_URL using the global fetch. */
  shareClient?: ShareClient;
  /** Put text on the clipboard. Defaults to navigator.clipboard.writeText. */
  copyText?: (text: string) => Promise<void>;
}

export type ImportOutcome = { ok: true; template: Template } | { ok: false; error: string };

/** Handle returned by mountSetup so the host can sync the start/stop button. */
export interface MountedSetup {
  /** Flip the start button between "Start workout" and "Stop workout". */
  setSessionActive(active: boolean): void;
  /** Re-read history from storage and repaint the panel (call after a session ends). */
  refreshHistory(): void;
  /**
   * Import a shared workout from a web link, a rowalong:// deep link or a bare id:
   * save it to Templates under the sharer's name and load it into the builder.
   * The outcome shows under the Import box; on failure nothing else changes.
   * The Import box calls this, and so does the Electron deep-link handler.
   */
  importShareLink(link: string): Promise<ImportOutcome>;
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
  share: '<svg viewBox="0 0 24 24"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/></svg>',
  import: '<svg viewBox="0 0 24 24"><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
};

type NoteState = 'idle' | 'busy' | 'ok' | 'error';

/** Show a one-line status under a control; 'idle' hides it. Text only, never HTML. */
function setNote(el: HTMLElement, state: NoteState, text = ''): void {
  el.dataset.state = state;
  el.textContent = text;
  el.hidden = state === 'idle';
}

const clipboardWrite = (text: string): Promise<void> => navigator.clipboard.writeText(text);

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
              <input class="setup-name" type="text" placeholder="Name this session to save or share it" aria-label="Session name" />
              <button class="btn setup-save">${ICON.save} Save</button>
              <button class="btn setup-share" title="Upload this workout and copy a link to it">${ICON.share} Share</button>
            </div>
            <div class="share-out">
              <p class="note setup-share-msg" role="status" aria-live="polite" hidden></p>
              <input class="share-link setup-share-link" type="text" readonly aria-label="Share link" hidden />
            </div>
          </section>
        </div>

        <div>
          <section class="panel">
            <div class="panel-head"><h2>Templates</h2></div>
            <div class="setup-tpl-list"></div>
            <div class="import-row">
              <input class="setup-import-link" type="text" placeholder="Paste a share link" aria-label="Share link to import" />
              <button class="btn setup-import">${ICON.import} Import</button>
            </div>
            <p class="note setup-import-msg" role="status" aria-live="polite" hidden></p>
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
  const shareBtn = container.querySelector('.setup-share') as HTMLButtonElement;
  const shareMsg = container.querySelector('.setup-share-msg') as HTMLElement;
  const shareLink = container.querySelector('.setup-share-link') as HTMLInputElement;
  const importInput = container.querySelector('.setup-import-link') as HTMLInputElement;
  const importBtn = container.querySelector('.setup-import') as HTMLButtonElement;
  const importMsg = container.querySelector('.setup-import-msg') as HTMLElement;
  const shareClient = opts.shareClient ?? createShareClient();
  const copyText = opts.copyText ?? clipboardWrite;
  // Provenance label for the workout currently in the editor: where it came from,
  // not what it now contains, so it survives manual block edits.
  let programName = '';
  let seed = 0;

  let sharing = false;
  const clearShareNote = () => {
    if (sharing) return;
    setNote(shareMsg, 'idle');
    shareLink.hidden = true;
    shareLink.value = '';
  };

  const refreshSummary = () => {
    // A shown link (or share error) is about the workout as it was; drop it on any change.
    clearShareNote();
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
    const templates = [...starterTemplates(), ...opts.storage.listTemplates()];
    list.innerHTML = templates
      .map((t) => {
        const s = summarize(t.segments);
        const swatches = INTENSITY_ORDER.filter((i) => t.segments.some((seg) => seg.intensity === i))
          .map((i) => `<i style="background:${INTENSITY_META[i].color}"></i>`)
          .join('');
        // Names can come from a share link, so they're untrusted: escape them.
        const id = escapeHtml(t.id);
        return `<div class="setup-tpl" data-id="${id}">
             <button class="setup-load" data-id="${id}">
               <span class="t-name">${escapeHtml(t.name)}</span>
               <span class="t-meta">${formatClock(s.totalSec)} · ${s.blocks} block${s.blocks === 1 ? '' : 's'}</span>
             </button>
             <span class="t-swatches">${swatches}</span>
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

  shareBtn.addEventListener('click', async () => {
    if (sharing) return;
    const segments = readEditor(editor);
    if (segments.length === 0) {
      setNote(shareMsg, 'error', 'Add some blocks before sharing.');
      return;
    }
    const name = nameEl.value.trim() || programName || 'Untitled';
    clearShareNote();
    sharing = true;
    shareBtn.disabled = true;
    setNote(shareMsg, 'busy', 'Uploading…');
    try {
      const r = await shareClient.share(toSharedWorkout(name, segments));
      if (!r.ok) {
        setNote(shareMsg, 'error', r.error);
        return;
      }
      shareLink.value = r.url;
      shareLink.hidden = false;
      let copied = false;
      try {
        await copyText(r.url);
        copied = true;
      } catch {
        // No clipboard access (permission, unfocused window): the link is shown to copy by hand.
      }
      setNote(
        shareMsg,
        'ok',
        copied ? `Link copied. Anyone with it can import “${name}”.` : 'Link ready. Copy it below.',
      );
      if (!copied) shareLink.select();
    } finally {
      sharing = false;
      shareBtn.disabled = false;
    }
  });
  // Tab or click selects the whole link, ready for Cmd-C (on focus alone, the
  // click's mouseup can drop the selection again).
  for (const ev of ['focus', 'click']) shareLink.addEventListener(ev, () => shareLink.select());

  // Imports can overlap (a deep link while the box is busy); keep the box locked
  // until the last one settles.
  let importsInFlight = 0;
  const importShareLink = async (link: string): Promise<ImportOutcome> => {
    importsInFlight += 1;
    importBtn.disabled = true;
    setNote(importMsg, 'busy', 'Importing…');
    try {
      const r = await shareClient.fetchShared(link);
      if (!r.ok) {
        setNote(importMsg, 'error', r.error);
        return r;
      }
      // Keyed by the share id, so importing the same link again replaces this
      // template instead of piling up copies (links are content-hashed snapshots).
      const template: Template = { ...fromSharedWorkout(r.workout), id: `shared-${r.id}` };
      opts.storage.saveTemplate(template);
      renderTemplates();
      renderWorkout(
        template.segments.map((s) => ({ ...s, id: makeId() })),
        template.name,
      );
      setNote(importMsg, 'ok', `Imported “${template.name}” into Templates and loaded it.`);
      return { ok: true, template };
    } finally {
      importsInFlight -= 1;
      importBtn.disabled = importsInFlight > 0;
    }
  };

  const importFromBox = async () => {
    if (importBtn.disabled) return;
    const r = await importShareLink(importInput.value);
    if (r.ok) importInput.value = '';
  };
  importBtn.addEventListener('click', importFromBox);
  importInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void importFromBox();
    }
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

  return { setSessionActive, refreshHistory: renderHistoryPanel, importShareLink };
}
