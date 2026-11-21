import { exportWorkout, parseWorkout } from '../core/shareFormat';
import type { Segment } from '../core/types';

/** What an export control hands out: the workout's name and its segments. */
export interface ExportSource {
  name: string;
  segments: readonly Segment[];
}

/** Handle for the setup page's single, shared export menu. */
export interface ExportMenu {
  /**
   * Open the menu under `anchor`, or close it if it is already open there.
   * `source` is read when an action is chosen, not when the menu opens.
   */
  toggle(anchor: HTMLElement, source: () => ExportSource): void;
  close(): void;
}

// Characters Windows, macOS or Linux won't take in a file name, plus control chars.
const UNSAFE_FILE_CHARS = /[<>:"/\\|?*\x00-\x1f\x7f]+/g;
const MAX_FILE_BASE = 80; // code points, the same cap as an imported name

/** `<name>.json`, with characters a file system would refuse replaced by spaces. */
export function exportFileName(name: string): string {
  // Collapse runs of whitespace, and trim spaces and dots (a leading dot hides the file).
  const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '');
  const cleaned = tidy(name.replace(UNSAFE_FILE_CHARS, ' '));
  const base = tidy(Array.from(cleaned).slice(0, MAX_FILE_BASE).join(''));
  return `${base || 'workout'}.json`;
}

// Long enough for the browser to have read the Blob even if it asks where to save it.
const REVOKE_AFTER_MS = 60_000;

/** Save `text` as a JSON file through a Blob URL and a temporary `<a download>` link. */
export function downloadText(doc: Document, fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}

/** Put `text` on the clipboard. Rejects if there is no clipboard API or it refuses. */
export async function copyText(
  text: string,
  clipboard: Clipboard | undefined = navigator.clipboard,
): Promise<void> {
  if (!clipboard?.writeText) throw new Error('The clipboard is not available here.');
  await clipboard.writeText(text);
}

const ICON = {
  download: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
};

const TOAST_MS = { ok: 2500, error: 6000 } as const;
type ToastKind = keyof typeof TOAST_MS;

/**
 * Add the export menu (Download .json / Copy as text) and its confirmation toast to
 * `root`. One menu serves every export control on the page; each control calls
 * toggle() with a function that returns what it exports.
 *
 * Before handing anything out, the payload is run back through parseWorkout, so a
 * workout that wouldn't import (an empty builder, a 7 s block, a name over the cap)
 * is refused with the codec's own message instead of producing a dud file.
 */
export function mountExportMenu(root: HTMLElement): ExportMenu {
  const doc = root.ownerDocument;
  const view = doc.defaultView ?? window;

  const menu = doc.createElement('div');
  menu.className = 'setup-export-menu';
  menu.id = 'setup-export-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Export workout');
  menu.innerHTML = `
    <button type="button" role="menuitem" class="setup-export-download">${ICON.download} Download .json</button>
    <button type="button" role="menuitem" class="setup-export-copy">${ICON.copy} Copy as text</button>`;

  // Names are untrusted (they can come from an imported file): set as textContent only.
  const toast = doc.createElement('div');
  toast.className = 'setup-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.hidden = true;
  root.append(menu, toast);

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const notify = (message: string, kind: ToastKind = 'ok') => {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.hidden = false;
    toastTimer = setTimeout(() => (toast.hidden = true), TOAST_MS[kind]);
  };

  let current: { anchor: HTMLElement; source: () => ExportSource } | null = null;
  const items = () => Array.from(menu.querySelectorAll<HTMLButtonElement>('button'));

  const onPointerDown = (ev: Event) => {
    const target = ev.target as Node;
    // The anchor's own click toggles; let it, rather than closing and reopening.
    if (!menu.contains(target) && !current?.anchor.contains(target)) close();
  };
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      close();
      return;
    }
    // Tab leaves the menu: close it (focus goes back to the anchor) and let Tab move on.
    if (ev.key === 'Tab') {
      close();
      return;
    }
    const list = items();
    const at = list.indexOf(doc.activeElement as HTMLButtonElement);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const step = ev.key === 'ArrowDown' ? 1 : -1;
      list[(at + step + list.length) % list.length].focus();
    }
  };
  // The menu is position: fixed, so keep it on its anchor as the page scrolls or resizes.
  const onViewportChange = () => {
    if (current?.anchor.isConnected) place(current.anchor);
    else close();
  };

  function close(): void {
    if (!current) return;
    const { anchor } = current;
    current = null;
    const hadFocus = menu.contains(doc.activeElement);
    menu.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('scroll', onViewportChange, true);
    view.removeEventListener('resize', onViewportChange);
    if (hadFocus && anchor.isConnected) anchor.focus();
  }

  const place = (anchor: HTMLElement) => {
    const r = anchor.getBoundingClientRect();
    const gap = 6;
    const margin = 8;
    const { offsetWidth: w, offsetHeight: h } = menu;
    const left = Math.max(margin, Math.min(r.right - w, view.innerWidth - w - margin));
    const roomBelow = r.bottom + gap + h <= view.innerHeight - margin;
    const top = roomBelow || r.top - gap - h < margin ? r.bottom + gap : r.top - gap - h;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  };

  const open = (anchor: HTMLElement, source: () => ExportSource) => {
    close();
    current = { anchor, source };
    anchor.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    place(anchor);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('scroll', onViewportChange, true);
    view.addEventListener('resize', onViewportChange);
    items()[0].focus();
  };

  const run = async (action: 'download' | 'copy') => {
    const source = current?.source;
    close();
    if (!source) return;
    const { name, segments } = source();
    const text = exportWorkout(name, segments);
    const check = parseWorkout(text);
    if (!check.ok) {
      notify(`Can’t export this workout: ${check.error}`, 'error');
      return;
    }
    if (action === 'download') {
      const fileName = exportFileName(name);
      downloadText(doc, fileName, text);
      notify(`Exported ${fileName}`);
      return;
    }
    try {
      await copyText(text, view.navigator.clipboard);
      notify(`Copied “${name}” to the clipboard`);
    } catch {
      notify('Couldn’t copy to the clipboard. Use Download .json instead.', 'error');
    }
  };

  menu.querySelector('.setup-export-download')!.addEventListener('click', () => void run('download'));
  menu.querySelector('.setup-export-copy')!.addEventListener('click', () => void run('copy'));

  return {
    toggle(anchor, source) {
      if (current?.anchor === anchor) close();
      else open(anchor, source);
    },
    close,
  };
}
