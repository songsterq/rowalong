export const DEEP_LINK_SCHEME: string;
export const MAX_DEEP_LINK_LENGTH: number;

export function toDeepLink(value: unknown): string | null;
export function deepLinkFromArgv(argv: unknown): string | null;

export interface LinkQueue {
  push(link: string): void;
  /** `deliver` returns false (or throws) when it couldn't send; the link stays queued. */
  open(deliver: (link: string) => boolean | void): void;
  close(): void;
  readonly isOpen: boolean;
  readonly size: number;
}

export function createLinkQueue(): LinkQueue;
