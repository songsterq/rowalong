import { OverlayHost } from './overlayHost';

// Minimal shape of the Document Picture-in-Picture API (no official TS types yet).
interface DocumentPiP {
  requestWindow(opts: { width: number; height: number }): Promise<Window>;
}

export class PipOverlayHost implements OverlayHost {
  private pipWindow: Window | null = null;
  private closedCb: (() => void) | null = null;

  get isOpen() {
    return this.pipWindow !== null;
  }

  async open(size: { width: number; height: number }): Promise<Document> {
    const api = (window as unknown as { documentPictureInPicture?: DocumentPiP })
      .documentPictureInPicture;
    if (!api) throw new Error('Document Picture-in-Picture not supported');
    const win = await api.requestWindow(size);
    this.pipWindow = win;
    win.document.body.style.margin = '0';
    win.addEventListener('pagehide', () => {
      this.pipWindow = null;
      this.closedCb?.();
    });
    return win.document;
  }

  close() {
    this.pipWindow?.close();
    this.pipWindow = null;
  }

  onClosed(cb: () => void) {
    this.closedCb = cb;
  }
}
