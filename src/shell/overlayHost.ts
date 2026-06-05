export interface OverlayHost {
  /** Create the floating window and return its Document to render into. */
  open(size: { width: number; height: number }): Promise<Document>;
  close(): void;
  readonly isOpen: boolean;
  /** Fires if the user closes the floating window manually. */
  onClosed(cb: () => void): void;
}

export function isPipSupported(win: Window = window): boolean {
  return typeof win !== 'undefined' && 'documentPictureInPicture' in win;
}
