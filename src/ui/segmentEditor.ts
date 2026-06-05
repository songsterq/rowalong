import { Intensity, Segment, makeId, INTENSITY_META } from '../core/types';

const INTENSITIES: Intensity[] = ['easy', 'medium', 'hard', 'allout'];

function rowHtml(seg: Segment): string {
  const opts = INTENSITIES.map(
    (i) =>
      `<option value="${i}" ${i === seg.intensity ? 'selected' : ''}>${INTENSITY_META[i].label}</option>`,
  ).join('');
  return `
    <div class="seg-row" data-id="${seg.id}">
      <select class="seg-intensity">${opts}</select>
      <input class="seg-dur" type="number" min="5" step="5" value="${seg.durationSec}" /> s
      <button class="seg-up" title="Move up">↑</button>
      <button class="seg-down" title="Move down">↓</button>
      <button class="seg-del" title="Remove">✕</button>
    </div>`;
}

export function renderEditor(container: HTMLElement, segments: Segment[]): void {
  container.innerHTML = `
    <div class="seg-list">${segments.map(rowHtml).join('')}</div>
    <button class="seg-add">+ Add segment</button>`;
  const list = container.querySelector('.seg-list') as HTMLElement;

  container.querySelector('.seg-add')!.addEventListener('click', () => {
    list.insertAdjacentHTML(
      'beforeend',
      rowHtml({ id: makeId(), intensity: 'easy', durationSec: 30 }),
    );
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
