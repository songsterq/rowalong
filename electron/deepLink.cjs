'use strict';

// Pure helpers for rowalong:// deep links (the 'Open in RowAlong' button on a
// share preview page). No electron imports so this is unit-testable; app.cjs
// wires them to open-url, second-instance and the setup window.
//
// The main process only checks the scheme and a length cap: it forwards the link
// itself, and the setup window's importShareLink parses it with share-core's
// parseShareLink (the one parser), showing an error under Import if it's bad.

// Must match SHARE_DEEP_LINK_SCHEME in src/core/share.ts and the `protocols`
// entry in electron-builder.yml (tests check both).
const DEEP_LINK_SCHEME = 'rowalong';

// A real link is rowalong://w/<10-char id>; anything far longer is junk from
// some other app, not worth handing to the renderer.
const MAX_DEEP_LINK_LENGTH = 512;

const PREFIX = `${DEEP_LINK_SCHEME}://`;

/** The trimmed link if it's a rowalong:// URL within the cap, else null. */
function toDeepLink(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.length > MAX_DEEP_LINK_LENGTH) return null;
  return s.toLowerCase().startsWith(PREFIX) ? s : null;
}

/** The first deep link on a command line: a second instance's argv, or our own
 *  when launched from a terminal (`RowAlong rowalong://w/<id>`). macOS itself
 *  delivers links through open-url, not argv. */
function deepLinkFromArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    const link = toDeepLink(arg);
    if (link) return link;
  }
  return null;
}

/** Holds links until the setup page says it's listening (open), then hands
 *  them over in arrival order. close() when the page goes away (window closed,
 *  reload) so links arriving meanwhile wait for the next open(). A send that
 *  returns false or throws (the page went away first) closes the queue and keeps
 *  that link and the rest for the next open(); it never throws into the caller,
 *  which in the main process would be an open-url handler. */
function createLinkQueue() {
  const pending = [];
  let deliver = null;

  const flush = () => {
    while (deliver && pending.length > 0) {
      let sent;
      try {
        sent = deliver(pending[0]) !== false;
      } catch {
        sent = false;
      }
      if (!sent) {
        deliver = null;
        return;
      }
      pending.shift();
    }
  };

  return {
    push(link) {
      pending.push(link);
      flush();
    },
    open(fn) {
      deliver = fn;
      flush();
    },
    close() {
      deliver = null;
    },
    get isOpen() {
      return deliver !== null;
    },
    get size() {
      return pending.length;
    },
  };
}

module.exports = {
  DEEP_LINK_SCHEME,
  MAX_DEEP_LINK_LENGTH,
  toDeepLink,
  deepLinkFromArgv,
  createLinkQueue,
};
