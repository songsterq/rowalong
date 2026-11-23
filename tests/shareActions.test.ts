import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  exportFileName,
  prepareExport,
  downloadText,
  copyText,
} from '../src/ui/shareActions';
import { parseWorkout, MAX_NAME_LENGTH } from '../src/core/shareFormat';
import type { Segment } from '../src/core/types';

const SEGMENTS: Segment[] = [
  { id: 'a', intensity: 'easy', durationSec: 120 },
  { id: 'b', intensity: 'hard', durationSec: 90, label: 'Push' },
  { id: 'c', intensity: 'allout', durationSec: 30 },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('exportFileName', () => {
  it('names the file after the workout', () => {
    expect(exportFileName('Quick 20')).toBe('Quick 20.json');
    expect(exportFileName('20 min · random')).toBe('20 min · random.json');
  });

  it('replaces characters that are not allowed in file names', () => {
    expect(exportFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.json');
    expect(exportFileName('tab\there\nnewline')).toBe('tab here newline.json');
  });

  it('does not produce a hidden or empty file name', () => {
    expect(exportFileName('..secret')).toBe('secret.json');
    expect(exportFileName('   ')).toBe('workout.json');
    expect(exportFileName('')).toBe('workout.json');
  });
});

describe('prepareExport', () => {
  it('produces a payload that imports back to the same name and segments', () => {
    const prepared = prepareExport('Leg day', SEGMENTS);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.fileName).toBe('Leg day.json');
    expect(JSON.parse(prepared.text)).toMatchObject({ format: 'rowalong-workout', version: 1 });
    const back = parseWorkout(prepared.text);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.workout.name).toBe('Leg day');
    expect(back.workout.segments.map(({ id: _id, ...rest }) => rest)).toEqual(
      SEGMENTS.map(({ id: _id, ...rest }) => rest),
    );
  });

  it('shortens a name over the share limit so the file still imports', () => {
    const long = 'x'.repeat(MAX_NAME_LENGTH + 15);
    const prepared = prepareExport(long, SEGMENTS);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const back = parseWorkout(prepared.text);
    expect(back.ok && back.workout.name).toBe('x'.repeat(MAX_NAME_LENGTH));
  });

  it('refuses a workout that would not import, with the reason', () => {
    const bad: Segment[] = [{ id: 'a', intensity: 'easy', durationSec: 7 }];
    const prepared = prepareExport('Odd', bad);
    expect(prepared.ok).toBe(false);
    if (prepared.ok) return;
    expect(prepared.error).toMatch(/^Can't export this workout\./);
    expect(prepared.error).toContain('multiple of 5 seconds');
  });

  it('refuses an empty workout', () => {
    const prepared = prepareExport('Nothing', []);
    expect(prepared.ok).toBe(false);
  });
});

describe('downloadText', () => {
  it('downloads the text through a Blob and an <a download> link', async () => {
    vi.useFakeTimers();
    let blob: Blob | undefined;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      blob = b as Blob;
      return 'blob:test/1';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: { href: string; download: string; attached: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download, attached: this.isConnected });
    });

    downloadText('Quick 20.json', '{"a":1}');

    expect(create).toHaveBeenCalledOnce();
    expect(clicked).toEqual([{ href: 'blob:test/1', download: 'Quick 20.json', attached: true }]);
    expect(document.querySelector('a[download]')).toBeNull(); // the link is cleaned up
    expect(blob!.type).toBe('application/json');
    expect(await blob!.text()).toBe('{"a":1}');

    // The object URL outlives the click (a save dialog may still be reading it), then is freed.
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test/1');
  });
});

describe('copyText', () => {
  it('writes the text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await copyText('hello', { writeText });
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('rejects when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    await expect(copyText('hello', { writeText })).rejects.toThrow();
  });

  it('rejects when there is no clipboard API', async () => {
    await expect(copyText('hello', null)).rejects.toThrow();
  });
});
