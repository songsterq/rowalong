// HTML for the browser preview of a share link (GET /w/:id). Pure string
// rendering so it can be unit-tested without a Worker runtime. The page links
// the landing site's /styles.css (served by the assets layer) and adds a small
// inline stylesheet for the preview-only pieces.
//
// Everything that came from a user (workout name, segment labels) goes through
// escapeHtml. The share URL is built from our own origin + a validated id, but
// is escaped too since it lands in attributes.
import { SharedWorkout } from '../src/core/share';
import { INTENSITY_META } from '../src/core/types';
import { formatClock } from '../src/ui/format';

/** Same DMG the landing page's three DOWNLOAD-URL buttons point at (site/index.html).
 *  Bump it together with those. */
export const DOWNLOAD_URL =
  'https://rowalongcdn.endlessrainstudio.com/release/RowAlong-1.0.2-arm64.dmg';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** Human total, e.g. 1200 -> '20 min', 1290 -> '21 min 30 s', 45 -> '45 s'. */
export function formatTotal(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

export interface PreviewOptions {
  /** Canonical link to this workout (origin + /w/:id). */
  shareUrl: string;
  /** CSP nonce for the inline copy-link script. */
  nonce: string;
}

const WAVE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 9c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0M2 15c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0"/></svg>';
const DOWNLOAD_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 21h14"/></svg>';

const PREVIEW_CSS = `
.pv { padding-block: clamp(2.5rem, 7vw, 5rem); }
.pv h1 { margin: 0.7rem 0 0.4rem; font-weight: 700; letter-spacing: -0.02em;
  font-size: clamp(2rem, 1.4rem + 3vw, 3.2rem); line-height: 1.05; overflow-wrap: anywhere; }
.pv-total { margin: 0 0 1.75rem; color: var(--fg-mut); font-size: 1.1rem; }
.pv-total b { color: var(--fg); font-family: "Saira", system-ui, sans-serif; font-weight: 600; }
.pv-timeline { display: flex; gap: 2px; height: 18px; border-radius: 6px; overflow: hidden;
  background: var(--bg-3); margin-bottom: 0.6rem; }
.pv-timeline > span { display: block; min-width: 2px; }
.pv-legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.1rem; margin: 0 0 2.25rem;
  font-size: 0.85rem; color: var(--fg-dim); }
.pv-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%;
  margin-right: 0.4rem; vertical-align: 0.05em; }
.pv-grid { display: grid; gap: clamp(2rem, 5vw, 3.5rem); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 860px) { .pv-grid { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); } }
.pv-segs { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
.pv-segs li { display: grid; grid-template-columns: 2rem 1fr auto auto; gap: 0.9rem; align-items: baseline;
  padding: 0.6rem 0; border-bottom: 1px solid var(--line); }
.pv-n { color: var(--fg-dim); font-variant-numeric: tabular-nums; font-size: 0.85rem; }
.pv-name { font-weight: 600; color: var(--c); overflow-wrap: anywhere; }
.pv-name small { color: var(--fg-mut); font-weight: 400; font-size: 0.9rem; margin-left: 0.4rem; }
.pv-spm { color: var(--fg-dim); font-size: 0.88rem; }
.pv-dur { font-variant-numeric: tabular-nums; font-family: "Saira", system-ui, sans-serif; font-weight: 600; }
.pv h2 { margin: 0 0 1rem; font-weight: 600; font-size: 1.2rem; letter-spacing: -0.01em; }
.pv-link { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
.pv-link input { flex: 1 1 auto; min-width: 0; font: inherit; font-size: 0.92rem; color: var(--fg);
  background: var(--bg-2); border: 1px solid var(--line-2); border-radius: 8px; padding: 0.55rem 0.75rem; }
.pv-copy { font-family: "Saira", sans-serif; font-weight: 600; font-size: 0.92rem; cursor: pointer;
  color: var(--fg); background: var(--bg-3); border: 1px solid var(--line-2); border-radius: 8px;
  padding: 0.5rem 0.95rem; white-space: nowrap; }
.pv-copy:hover { border-color: var(--fg-dim); }
.pv-steps { margin: 0 0 2rem; padding-left: 1.3rem; color: var(--fg-mut); }
.pv-steps li { margin-bottom: 0.35rem; }
.pv-steps b { color: var(--fg); font-weight: 600; }
.pv-missing { text-align: center; }
.pv-missing p { color: var(--fg-mut); margin: 0 auto 1.8rem; max-width: 44ch; }
.pv-missing .dl-group { align-items: center; }
`;

function page(opts: { title: string; nonce?: string; body: string; script?: string }): string {
  const script =
    opts.script && opts.nonce ? `\n  <script nonce="${opts.nonce}">${opts.script}</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <meta name="robots" content="noindex" />
  <meta name="theme-color" content="#121214" />
  <link rel="icon" type="image/png" href="/icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Saira:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
  <style>${PREVIEW_CSS}</style>
</head>
<body>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="wordmark" href="/" aria-label="RowAlong home">${WAVE_SVG}RowAlong</a>
      <a class="header-cta" href="${DOWNLOAD_URL}">Download</a>
    </div>
  </header>
  <hr class="ramp-rule" />
  <main>
${opts.body}
  </main>
  <footer class="site-footer">
    <div class="wrap footer-inner">
      <span class="wordmark">${WAVE_SVG}RowAlong</span>
      <span>Endless Rain Studio</span>
    </div>
  </footer>${script}
</body>
</html>
`;
}

function downloadButton(): string {
  return `<div class="dl-group">
        <a class="btn-dl" href="${DOWNLOAD_URL}">${DOWNLOAD_SVG}Download for Mac</a>
        <p class="dl-note">Free · macOS · Apple Silicon</p>
      </div>`;
}

// Copies the link; falls back to selecting the field where the Clipboard API
// is unavailable (e.g. not a secure context).
const COPY_SCRIPT = `
(function () {
  var btn = document.getElementById('pv-copy');
  var field = document.getElementById('pv-url');
  if (!btn || !field) return;
  function done(text) { btn.textContent = text; setTimeout(function () { btn.textContent = 'Copy link'; }, 1800); }
  btn.addEventListener('click', function () {
    field.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(field.value).then(function () { done('Copied'); }, function () { done('Press \\u2318C'); });
    } else {
      done(document.execCommand && document.execCommand('copy') ? 'Copied' : 'Press \\u2318C');
    }
  });
})();
`;

export function renderPreviewPage(w: SharedWorkout, opts: PreviewOptions): string {
  const name = escapeHtml(w.name);
  const url = escapeHtml(opts.shareUrl);
  const totalSec = w.segments.reduce((sum, s) => sum + s.durationSec, 0);
  const total = formatTotal(totalSec);

  const timeline = w.segments
    .map((s) => {
      const meta = INTENSITY_META[s.intensity];
      const title = escapeHtml(`${s.label ?? meta.label} · ${formatClock(s.durationSec)}`);
      return `<span style="flex-grow: ${s.durationSec}; background: ${meta.color}" title="${title}"></span>`;
    })
    .join('');

  const used = (Object.keys(INTENSITY_META) as (keyof typeof INTENSITY_META)[]).filter((k) =>
    w.segments.some((s) => s.intensity === k),
  );
  const legend = used
    .map((k) => `<span><i style="background: ${INTENSITY_META[k].color}"></i>${INTENSITY_META[k].label}</span>`)
    .join('');

  const rows = w.segments
    .map((s, i) => {
      const meta = INTENSITY_META[s.intensity];
      const label = s.label ? `<small>${escapeHtml(s.label)}</small>` : '';
      return `<li style="--c: ${meta.color}"><span class="pv-n">${i + 1}</span><span class="pv-name">${meta.label}${label}</span><span class="pv-spm">${meta.spmLabel} spm</span><span class="pv-dur">${formatClock(s.durationSec)}</span></li>`;
    })
    .join('\n          ');

  const body = `    <section class="pv">
      <div class="wrap">
        <p class="eyebrow">Shared RowAlong workout</p>
        <h1>${name}</h1>
        <p class="pv-total"><b>${total}</b> · ${w.segments.length} ${w.segments.length === 1 ? 'block' : 'blocks'}</p>
        <div class="pv-timeline" role="img" aria-label="Intensity timeline, ${total}">${timeline}</div>
        <div class="pv-legend">${legend}</div>
        <div class="pv-grid">
          <div>
            <h2>Blocks</h2>
            <ol class="pv-segs">
          ${rows}
            </ol>
          </div>
          <div>
            <h2>Row it in RowAlong</h2>
            <div class="pv-link">
              <input id="pv-url" type="text" readonly value="${url}" aria-label="Share link" />
              <button id="pv-copy" class="pv-copy" type="button">Copy link</button>
            </div>
            <ol class="pv-steps">
              <li><b>Copy link</b> above.</li>
              <li>Open RowAlong (download it below if you don't have it yet).</li>
              <li>Paste the link into <b>Import</b> on the setup page. The workout is saved as a template and loaded into the editor.</li>
            </ol>
            ${downloadButton()}
          </div>
        </div>
      </div>
    </section>`;

  return page({ title: `${name} · RowAlong workout`, nonce: opts.nonce, body, script: COPY_SCRIPT });
}

export function renderNotFoundPage(): string {
  const body = `    <section class="pv">
      <div class="wrap">
        <div class="cta pv-missing">
          <h2>Workout not found</h2>
          <p>This share link doesn't point to a workout. Check that the whole link was copied, or ask for a new one.</p>
          ${downloadButton()}
        </div>
      </div>
    </section>`;
  return page({ title: 'Workout not found · RowAlong', body });
}
