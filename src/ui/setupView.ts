import { Segment, Template, makeId } from '../core/types';
import { Storage, Density } from '../core/storage';
import { generate } from '../core/generator';
import { starterTemplates } from '../core/starters';
import { renderEditor, readEditor } from './segmentEditor';

export interface SetupOpts {
  storage: Storage;
  onStart: (segments: Segment[]) => void;
}

export function mountSetup(container: HTMLElement, opts: SetupOpts): void {
  const prefs = opts.storage.getPrefs();
  container.innerHTML = `
    <div class="setup">
      <h1>Workout Helper</h1>
      <section class="setup-templates"><h2>Templates</h2><div class="setup-tpl-list"></div></section>
      <section>
        <h2>Build</h2>
        <label>Total minutes
          <input class="setup-minutes" type="number" min="1" value="${prefs.lastTotalMin}" />
        </label>
        <button class="setup-generate">Generate</button>
        <button class="setup-regenerate">Regenerate</button>
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
  const minutesEl = container.querySelector('.setup-minutes') as HTMLInputElement;
  const nameEl = container.querySelector('.setup-name') as HTMLInputElement;
  let seed = 1;

  const doGenerate = () => {
    const mins = Math.max(1, Number(minutesEl.value) || 1);
    opts.storage.setPrefs({ lastTotalMin: mins });
    renderEditor(editor, generate(mins, {}, seed));
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

  container.querySelector('.setup-generate')!.addEventListener('click', () => {
    seed = 1;
    doGenerate();
  });
  container.querySelector('.setup-regenerate')!.addEventListener('click', () => {
    seed += 1;
    doGenerate();
  });

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
