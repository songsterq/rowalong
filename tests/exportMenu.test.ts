import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { copyText, downloadText, exportFileName } from '../src/ui/exportMenu';

describe('exportFileName', () => {
  it('names the file after the workout', () => {
    expect(exportFileName('Quick 20')).toBe('Quick 20.json');
    expect(exportFileName('20 min · random')).toBe('20 min · random.json');
  });

  it('replaces characters a file name cannot hold', () => {
    expect(exportFileName('Intervals: 4/4 <hard>')).toBe('Intervals 4 4 hard.json');
    expect(exportFileName('a\\b|c?d*e"f')).toBe('a b c d e f.json');
    expect(exportFileName('tab\there\nnewline')).toBe('tab here newline.json');
  });

  it('drops leading and trailing dots and spaces', () => {
    expect(exportFileName('  ..hidden. ')).toBe('hidden.json');
  });

  it('falls back to "workout" when nothing usable is left', () => {
    expect(exportFileName('')).toBe('workout.json');
    expect(exportFileName(' / : ')).toBe('workout.json');
    expect(exportFileName('...')).toBe('workout.json');
  });

  it('keeps at most 80 characters of the name', () => {
    expect(exportFileName('x'.repeat(200))).toBe(`${'x'.repeat(80)}.json`);
  });
});

describe('downloadText', () => {
  let blobs: Blob[];
  let clicks: { href: string; download: string; attached: boolean }[];

  beforeEach(() => {
    vi.useFakeTimers();
    blobs = [];
    clicks = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b);
      return `blob:test/${blobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ href: this.href, download: this.download, attached: this.isConnected });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clicks an <a download> link to a JSON Blob of the text', async () => {
    downloadText(document, 'Quick 20.json', '{"a":1}');
    expect(clicks).toEqual([{ href: 'blob:test/1', download: 'Quick 20.json', attached: true }]);
    expect(blobs[0].type).toBe('application/json');
    expect(await blobs[0].text()).toBe('{"a":1}');
  });

  it('removes the link and later revokes the Blob URL', () => {
    downloadText(document, 'w.json', '{}');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
});

describe('copyText', () => {
  it('writes the text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyText('hello', { writeText } as unknown as Clipboard);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('rejects when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    await expect(copyText('hello', { writeText } as unknown as Clipboard)).rejects.toThrow();
  });

  it('rejects when there is no clipboard API', async () => {
    await expect(copyText('hello', undefined)).rejects.toThrow(/clipboard/i);
  });
});
