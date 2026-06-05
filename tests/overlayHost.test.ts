import { describe, it, expect } from 'vitest';
import { isPipSupported } from '../src/shell/overlayHost';

describe('isPipSupported', () => {
  it('is true when documentPictureInPicture exists', () => {
    expect(isPipSupported({ documentPictureInPicture: {} } as unknown as Window)).toBe(true);
  });

  it('is false when it does not', () => {
    expect(isPipSupported({} as unknown as Window)).toBe(false);
  });
});
