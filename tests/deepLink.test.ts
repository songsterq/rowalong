// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DEEP_LINK_SCHEME,
  MAX_DEEP_LINK_LENGTH,
  toDeepLink,
  deepLinkFromArgv,
  createLinkQueue,
} from '../electron/deepLink.cjs';
import { SHARE_DEEP_LINK_SCHEME, deepLinkFor } from '../src/core/share';
import builderYml from '../electron-builder.yml?raw';

const LINK = deepLinkFor('AbCdEfGh12');

describe('DEEP_LINK_SCHEME', () => {
  it('is the scheme share-core builds deep links with', () => {
    expect(DEEP_LINK_SCHEME).toBe(SHARE_DEEP_LINK_SCHEME);
  });

  it('is registered with macOS in electron-builder.yml', () => {
    expect(builderYml).toMatch(/^protocols:\s*\n(?:\s+.*\n)*?\s+schemes:\s*\[\s*rowalong\s*\]/m);
  });
});

describe('toDeepLink', () => {
  it('passes a rowalong:// link through', () => {
    expect(toDeepLink(LINK)).toBe(LINK);
  });

  it('trims it and accepts any case of the scheme', () => {
    expect(toDeepLink(`  ROWALONG://w/AbCdEfGh12\n`)).toBe('ROWALONG://w/AbCdEfGh12');
  });

  it('leaves checking the path to the importer', () => {
    // parseShareLink in the setup window is the one parser; it shows the error.
    expect(toDeepLink('rowalong://nope')).toBe('rowalong://nope');
  });

  it('rejects other schemes and look-alikes', () => {
    expect(toDeepLink('https://rowalong.endlessrainstudio.com/w/AbCdEfGh12')).toBeNull();
    expect(toDeepLink('rowalongx://w/AbCdEfGh12')).toBeNull();
    expect(toDeepLink('rowalong:w/AbCdEfGh12')).toBeNull();
    expect(toDeepLink('AbCdEfGh12')).toBeNull();
    expect(toDeepLink('')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(toDeepLink(undefined)).toBeNull();
    expect(toDeepLink(null)).toBeNull();
    expect(toDeepLink(42)).toBeNull();
    expect(toDeepLink({ url: LINK })).toBeNull();
  });

  it('rejects anything longer than the cap', () => {
    const long = `rowalong://w/${'a'.repeat(MAX_DEEP_LINK_LENGTH)}`;
    expect(toDeepLink(long)).toBeNull();
    const atCap = `rowalong://w/${'a'.repeat(MAX_DEEP_LINK_LENGTH - 'rowalong://w/'.length)}`;
    expect(toDeepLink(atCap)).toBe(atCap);
  });
});

describe('deepLinkFromArgv', () => {
  it('finds the link among the other arguments', () => {
    const argv = ['/Applications/RowAlong.app/Contents/MacOS/RowAlong', '--flag', LINK];
    expect(deepLinkFromArgv(argv)).toBe(LINK);
  });

  it('takes the first link when there are several', () => {
    expect(deepLinkFromArgv(['app', LINK, 'rowalong://w/ZZZZZZZZZZ'])).toBe(LINK);
  });

  it('is null when no argument is a deep link', () => {
    expect(deepLinkFromArgv(['electron', 'electron/app.cjs'])).toBeNull();
    expect(deepLinkFromArgv([])).toBeNull();
  });

  it('is null for something that is not a list', () => {
    expect(deepLinkFromArgv(undefined)).toBeNull();
    expect(deepLinkFromArgv(LINK)).toBeNull();
  });
});

describe('createLinkQueue', () => {
  it('holds links until the page is listening, then hands them over in order', () => {
    const q = createLinkQueue();
    q.push('a');
    q.push('b');
    expect(q.size).toBe(2);
    const got: string[] = [];
    q.open((l) => {
      got.push(l);
    });
    expect(got).toEqual(['a', 'b']);
    expect(q.size).toBe(0);
  });

  it('hands a link over at once while the page is listening', () => {
    const q = createLinkQueue();
    const got: string[] = [];
    q.open((l) => {
      got.push(l);
    });
    q.push('a');
    expect(got).toEqual(['a']);
    expect(q.size).toBe(0);
  });

  it('holds links again once closed (window closed or reloading)', () => {
    const q = createLinkQueue();
    const first: string[] = [];
    q.open((l) => {
      first.push(l);
    });
    q.close();
    q.push('a');
    expect(first).toEqual([]);
    expect(q.size).toBe(1);

    const second: string[] = [];
    q.open((l) => {
      second.push(l);
    });
    expect(second).toEqual(['a']);
    expect(first).toEqual([]);
  });

  it('reports whether it is listening', () => {
    const q = createLinkQueue();
    expect(q.isOpen).toBe(false);
    q.open(() => {});
    expect(q.isOpen).toBe(true);
    q.close();
    expect(q.isOpen).toBe(false);
  });

  it('keeps a link that fails to send and the ones after it', () => {
    const q = createLinkQueue();
    q.push('a');
    q.push('b');
    q.open(() => false);
    expect(q.size).toBe(2);
    expect(q.isOpen).toBe(false);

    const got: string[] = [];
    q.open((l) => {
      got.push(l);
    });
    expect(got).toEqual(['a', 'b']);
  });

  it('treats a send that throws as not sent, without throwing', () => {
    const q = createLinkQueue();
    q.open(() => {
      throw new Error('Object has been destroyed');
    });
    expect(() => q.push('a')).not.toThrow();
    expect(q.size).toBe(1);
    expect(q.isOpen).toBe(false);
  });
});
