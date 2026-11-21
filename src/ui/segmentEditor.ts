import { Intensity, Segment, makeId, INTENSITY_META } from '../core/types';
import { escapeHtml, formatClock } from './format';

const INTENSITIES: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

export interface EditorOpts {
  /** Fires after any edit that changes the segment list (add/remove/reorder/intensity/duration). */
  onChange?: () => void;
}

// The row's markup, minus its label: see buildRow.
function rowHtml(seg: Segment): string {
  const meta = INTENSITY_META[seg.intensity];
  const opts = INTENSITIES.map(
    (i) =>
      `<option value="${i}" ${i === seg.intensity ? 'selected' : ''}>${INTENSITY_META[i].label}</option>`,
  ).join('');
  return `
    <div class="seg-row" data-id="${escapeHtml(seg.id)}" style="--c:${meta.color}">
      <span class="seg-handle" aria-hidden="true">⠿</span>
      <span class="seg-kind">
        <span class="seg-dot"></span>
        <select class="seg-intensity" aria-label="Intensity">${opts}</select>
      </span>
      <span class="seg-time">
        <input class="seg-dur" type="number" min="5" step="5" value="${seg.durationSec}" aria-label="Duration in seconds" />
        <span class="seg-unit">s</span>
        <span class="seg-mmss">${formatClock(seg.durationSec)}</span>
      </span>
      <span class="seg-label" hidden></span>
      <span class="seg-spm">${meta.spmLabel} spm</span>
      <span class="seg-actions">
        <button class="icon-btn seg-up" title="Move up" aria-label="Move up">↑</button>
        <button class="icon-btn seg-down" title="Move down" aria-label="Move down">↓</button>
        <button class="icon-btn seg-del" title="Remove" aria-label="Remove">✕</button>
      </span>
    </div>`;
}

/**
 * Builds one row. A segment's label rides on the row as `data-label` (read back by
 * readEditor) and is shown in `.seg-label`. Both are set through the DOM rather than
 * the HTML string: a label can come from an imported file, so it must never be parsed
 * as markup, and the HTML parser would also rewrite it (CRs become LFs), breaking an
 * import → export round trip.
 */
function buildRow(doc: Document, seg: Segment): HTMLElement {
  const tpl = doc.createElement('template');
  tpl.innerHTML = rowHtml(seg).trim();
  const row = tpl.content.firstElementChild as HTMLElement;
  if (seg.label !== undefined) {
    row.dataset.label = seg.label;
    const shown = row.querySelector('.seg-label') as HTMLElement;
    shown.textContent = seg.label;
    shown.title = seg.label;
    shown.hidden = seg.label === '';
  }
  return row;
}

export function renderEditor(
  container: HTMLElement,
  segments: Segment[],
  opts: EditorOpts = {},
): void {
  const doc = container.ownerDocument;
  container.innerHTML = `
    <div class="seg-list"></div>
    <button class="seg-add">+ Add segment</button>`;
  const list = container.querySelector('.seg-list') as HTMLElement;
  list.append(...segments.map((seg) => buildRow(doc, seg)));
  const fire = () => opts.onChange?.();

  container.querySelector('.seg-add')!.addEventListener('click', () => {
    list.append(buildRow(doc, { id: makeId(), intensity: 'easy', durationSec: 30 }));
    fire();
  });

  list.addEventListener('pointerdown', (ev) => {
    const pe = ev as PointerEvent;
    if (pe.button !== 0) return;
    const handle = (ev.target as HTMLElement).closest('.seg-handle');
    if (!handle) return;
    const row = handle.closest('.seg-row') as HTMLElement;
    if (!row) return;
    ev.preventDefault(); // avoid selecting page text while dragging

    // Listeners live on `document`, not the handle: reordering moves `row`
    // (the handle's ancestor) via insertBefore, and relocating a captured
    // element mid-drag makes the browser drop pointer capture, silently
    // ending the gesture. Document-level listeners keep receiving events
    // regardless of where the dragged row ends up in the DOM.
    const initialOrder = Array.from(list.children).map((el) => (el as HTMLElement).dataset.id);
    row.classList.add('seg-row--dragging');

    const onMove = (mv: Event) => {
      const clientY = (mv as PointerEvent).clientY;
      const siblings = Array.from(list.querySelectorAll<HTMLElement>('.seg-row')).filter(
        (r) => r !== row,
      );
      let target: HTMLElement | null = null;
      for (const sib of siblings) {
        const rect = sib.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          target = sib;
          break;
        }
      }
      // Only touch the DOM when the position actually changes: a call that
      // fires on every pointermove (even no-ops) is what drops capture above.
      if (target !== row.nextElementSibling) list.insertBefore(row, target);
    };

    const onUp = () => {
      row.classList.remove('seg-row--dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      const finalOrder = Array.from(list.children).map((el) => (el as HTMLElement).dataset.id);
      if (finalOrder.join() !== initialOrder.join()) fire();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });

  list.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button');
    if (!btn) return;
    const row = btn.closest('.seg-row') as HTMLElement;
    if (btn.classList.contains('seg-del')) row.remove();
    else if (btn.classList.contains('seg-up') && row.previousElementSibling)
      row.parentElement!.insertBefore(row, row.previousElementSibling);
    else if (btn.classList.contains('seg-down') && row.nextElementSibling)
      row.parentElement!.insertBefore(row.nextElementSibling, row);
    else return; // a click that changed nothing shouldn't fire onChange
    fire();
  });

  // Recolor the row + refresh its stroke-rate hint when the intensity changes.
  list.addEventListener('change', (ev) => {
    const sel = (ev.target as HTMLElement).closest('.seg-intensity') as HTMLSelectElement | null;
    if (!sel) return;
    const row = sel.closest('.seg-row') as HTMLElement;
    const meta = INTENSITY_META[sel.value as Intensity];
    row.style.setProperty('--c', meta.color);
    const spm = row.querySelector('.seg-spm');
    if (spm) spm.textContent = `${meta.spmLabel} spm`;
    fire();
  });

  // Keep the m:ss readout in step with the seconds input as the user types.
  list.addEventListener('input', (ev) => {
    const input = (ev.target as HTMLElement).closest('.seg-dur') as HTMLInputElement | null;
    if (!input) return;
    const row = input.closest('.seg-row') as HTMLElement;
    const mmss = row.querySelector('.seg-mmss');
    if (mmss) mmss.textContent = formatClock(Math.max(0, Number(input.value) || 0));
    fire();
  });
}

export function readEditor(container: HTMLElement): Segment[] {
  return Array.from(container.querySelectorAll('.seg-row')).map((row) => {
    const el = row as HTMLElement;
    const intensity = (el.querySelector('.seg-intensity') as HTMLSelectElement)
      .value as Intensity;
    const durationSec = Math.max(
      5,
      Math.round(Number((el.querySelector('.seg-dur') as HTMLInputElement).value) || 0),
    );
    const id = el.dataset.id || makeId();
    // Only a row that was given a label has data-label; an empty one is still a label.
    const { label } = el.dataset;
    return label === undefined ? { id, intensity, durationSec } : { id, intensity, durationSec, label };
  });
}
