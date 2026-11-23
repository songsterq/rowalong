import { Segment } from '../core/types';
import { exportWorkout, parseWorkout, MAX_NAME_LENGTH } from '../core/shareFormat';

/** Where an exported workout goes. mountSetup defaults to the web implementation
 *  (webShareIO); tests pass a fake. Electron uses the same web APIs. */
export interface ShareIO {
  /** Save the text as a downloaded file. */
  download(fileName: string, text: string): void;
  /** Put the text on the clipboard. Rejects if the clipboard is unavailable or refuses. */
  copy(text: string): Promise<void>;
}

export type PreparedExport =
  | { ok: true; name: string; fileName: string; text: string }
  | { ok: false; error: string };

/** How long a downloaded file's object URL is kept alive after the click. A save
 *  dialog (Electron, or Chrome's "ask where to save") may still be reading it. */
const REVOKE_AFTER_MS = 60_000;

/** `<name>.json`, with characters that file systems reject replaced. Never empty or hidden. */
export function exportFileName(name: string): string {
  const base = name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/[\s\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  return `${base || 'workout'}.json`;
}

/**
 * Build the share payload for a workout, checked by the codec's own parser so that
 * every file or text we hand out imports again. A name over the share format's
 * limit is shortened rather than refused (saved templates have no length limit and
 * can't be renamed); anything else that wouldn't import is refused with the reason.
 */
export function prepareExport(name: string, segments: readonly Segment[]): PreparedExport {
  const shareName = Array.from(name).slice(0, MAX_NAME_LENGTH).join('');
  const text = exportWorkout(shareName, segments);
  const check = parseWorkout(text);
  if (!check.ok) return { ok: false, error: `Can't export this workout. ${check.error}` };
  return { ok: true, name: shareName, fileName: exportFileName(shareName), text };
}

/** Download `text` as a file, through a Blob and a temporary `<a download>` link. */
export function downloadText(fileName: string, text: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  doc.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
  }
}

/** Copy `text` with the async Clipboard API. Always returns a promise, rejected
 *  when there is no clipboard (an insecure context) or it refuses the write. */
export async function copyText(
  text: string,
  clipboard: Pick<Clipboard, 'writeText'> | null | undefined = navigator.clipboard,
): Promise<void> {
  if (!clipboard) throw new Error('The clipboard is not available here.');
  await clipboard.writeText(text);
}

export const webShareIO: ShareIO = {
  download: (fileName, text) => downloadText(fileName, text),
  copy: (text) => copyText(text),
};
