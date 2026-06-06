import { Segment, Template, makeId } from '../core/types';
import { Storage, Density } from '../core/storage';
import { generate, snapMinutes, SUPPORTED_MINUTES } from '../core/generator';
import { PushStyle, PUSH_STYLES } from '../core/pushStyles';
import { starterTemplates } from '../core/starters';
import { renderEditor, readEditor } from './segmentEditor';

const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1);

export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[]) => void;
}

export function mountSetup(container: HTMLElement, opts: SetupOpts): void {
  const prefs = opts.storage.getPrefs();
  const initialStyle: PushStyle = PUSH_STYLES.includes(prefs.lastPushStyle)
    ? prefs.lastPushStyle
    : 'random';
  container.innerHTML = `
    <div class="setup">
      <h1>Workout Helper</h1>
      <section class="setup-templates"><h2>Templates</h2><div class="setup-tpl-list"></div></section>
      <section>
        <h2>Build</h2>
        <label>Total minutes
          <select class="setup-minutes">
            ${SUPPORTED_MINUTES.map(
              (m) =>
                `<option value="${m}" ${m === snapMinutes(prefs.lastTotalMin) ? 'selected' : ''}>${m}</option>`,
            ).join('')}
          </select>
        </label>
        <label>Push strategy
          <select class="setup-strategy">
            ${PUSH_STYLES.map(
              (s) =>
                `<option value="${s}" ${s === initialStyle ? 'selected' : ''}>${titleCase(s)}</option>`,
            ).join('')}
          </select>
        </label>
        <button class="setup-generate">Generate</button>
        <div class="setup-editor"></div>
        <label>Name <input class="setup-name" type="text" placeholder="My session" /></label>
        <button class="setup-save">Save as template</button>
      </section>
      <section>
        <h2>Preferences</h2>
        <label>Density
          <select class="setup-density">
            <option value="pill" ${prefs.density === 'pill' ? 'selected' : ''}>Minimal</option>
            <option value="coach" ${prefs.density === 'coach' ? 'selected' : ''}>Coach</option>
          </select>
        </label>
        <label>Volume <input class="setup-volume" type="range" min="0" max="1" step="0.05" value="${prefs.volume}" /></label>
        <label><input class="setup-muted" type="checkbox" ${prefs.muted ? 'checked' : ''} /> Mute</label>
      </section>
      <button class="setup-start">▶ Start</button>
    </div>`;

  const editor = container.querySelector('.setup-editor') as HTMLElement;
  const minutesEl = container.querySelector('.setup-minutes') as HTMLSelectElement;
  const strategyEl = container.querySelector('.setup-strategy') as HTMLSelectElement;
  const nameEl = container.querySelector('.setup-name') as HTMLInputElement;
  let seed = 0;

  const doGenerate = () => {
    // Re-rolls each click; only the random strategy varies (fixed styles ignore the seed).
    seed += 1;
    const mins = snapMinutes(Number(minutesEl.value) || 20);
    const style = strategyEl.value as PushStyle;
    opts.storage.setPrefs({ lastTotalMin: mins, lastPushStyle: style });
    renderEditor(editor, generate(mins, { pushStyle: style }, seed));
  };

  const renderTemplates = () => {
    const list = container.querySelector('.setup-tpl-list') as HTMLElement;
    const templates = [...starterTemplates(), ...opts.storage.listTemplates()];
    list.innerHTML = templates
      .map(
        (t) =>
          `<div class="setup-tpl" data-id="${t.id}">
             <button class="setup-load" data-id="${t.id}">${t.name}</button>
             <button class="setup-del" data-id="${t.id}">✕</button>
           </div>`,
      )
      .join('');
    list.querySelectorAll<HTMLButtonElement>('.setup-load').forEach((b) =>
      b.addEventListener('click', () => {
        const t = templates.find((x) => x.id === b.dataset.id);
        if (t) renderEditor(editor, t.segments.map((s) => ({ ...s, id: makeId() })));
      }),
    );
    list.querySelectorAll<HTMLButtonElement>('.setup-del').forEach((b) =>
      b.addEventListener('click', () => {
        opts.storage.deleteTemplate(b.dataset.id!);
        renderTemplates();
      }),
    );
  };

  container.querySelector('.setup-generate')!.addEventListener('click', doGenerate);

  container.querySelector('.setup-save')!.addEventListener('click', () => {
    const segments = readEditor(editor);
    if (segments.length === 0) return;
    const tpl: Template = {
      id: makeId(),
      name: nameEl.value.trim() || 'Untitled',
      segments,
    };
    opts.storage.saveTemplate(tpl);
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
}
