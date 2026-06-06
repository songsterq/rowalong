import { Intensity, Segment, makeId, INTENSITY_META } from '../core/types';
import { formatClock } from './format';

const INTENSITIES: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

export interface EditorOpts {
  /** Fires after any edit that changes the segment list (add/remove/reorder/intensity/duration). */
  onChange?: () => void;
}

function rowHtml(seg: Segment): string {
  const meta = INTENSITY_META[seg.intensity];
  const opts = INTENSITIES.map(
    (i) =>
      `<option value="${i}" ${i === seg.intensity ? 'selected' : ''}>${INTENSITY_META[i].label}</option>`,
  ).join('');
  return `
    <div class="seg-row" data-id="${seg.id}" style="--c:${meta.color}">
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
      <span class="seg-spm">${meta.spmLabel} spm</span>
      <span class="seg-actions">
        <button class="icon-btn seg-up" title="Move up" aria-label="Move up">↑</button>
        <button class="icon-btn seg-down" title="Move down" aria-label="Move down">↓</button>
        <button class="icon-btn seg-del" title="Remove" aria-label="Remove">✕</button>
      </span>
    </div>`;
}

export function renderEditor(
  container: HTMLElement,
  segments: Segment[],
  opts: EditorOpts = {},
): void {
  container.innerHTML = `
    <div class="seg-list">${segments.map(rowHtml).join('')}</div>
    <button class="seg-add">+ Add segment</button>`;
  const list = container.querySelector('.seg-list') as HTMLElement;
  const fire = () => opts.onChange?.();

  container.querySelector('.seg-add')!.addEventListener('click', () => {
    list.insertAdjacentHTML(
      'beforeend',
      rowHtml({ id: makeId(), intensity: 'easy', durationSec: 30 }),
    );
    fire();
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
    return { id: el.dataset.id || makeId(), intensity, durationSec };
  });
}
