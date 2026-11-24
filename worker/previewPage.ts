import { INTENSITY_META } from '../src/core/types';
import { SHARE_BASE_URL, type SharedWorkout, deepLinkFor, shareUrlFor } from '../src/core/share';
import { escapeHtml, formatClock, timelineGradient } from '../src/ui/format';

/** The HTML pages the Worker serves at /w/<id>: a shared workout's preview, and
 *  a friendly not-found page. Pure string rendering, styled by the landing
 *  page's own site/styles.css (the "share preview page" section at its end), so
 *  the two look alike and a style change is one file. Every piece of shared
 *  content (the name and segment labels) goes through escapeHtml. */

/** The current Mac download. Must match every DOWNLOAD-URL href in
 *  site/index.html (a test checks); bump them together (site/DEPLOY.md). */
export const DOWNLOAD_URL =
  'https://rowalongcdn.endlessrainstudio.com/release/RowAlong-1.0.2-arm64.dmg';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Saira:wght@500;600;700;800&family=Hanken+Grotesk:wght@400;500;600&display=swap';

const WAVES_PATH =
  'M2 9c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0M2 15c2.3-2.5 4.6-2.5 6.9 0s4.6 2.5 6.9 0 4.6-2.5 6.2 0';

const ICON_OPEN =
  '<svg class="pv-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
const ICON_DOWNLOAD =
  '<svg class="pv-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0l-4-4m4 4l4-4M5 21h14"/></svg>';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The document shell shared by both pages: head, the site header and footer. */
function page(opts: { title: string; description: string; head?: string; main: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <meta name="description" content="${opts.description}" />
  <meta name="robots" content="noindex" />
  <meta name="theme-color" content="#121214" />
  ${opts.head ?? ''}
  <link rel="icon" type="image/png" href="/icon.png" />
  <link rel="apple-touch-icon" href="/icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="${FONTS_HREF}" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="wordmark" href="/" aria-label="RowAlong home">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${WAVES_PATH}"/></svg>
        RowAlong
      </a>
    </div>
  </header>
  <hr class="ramp-rule" />

  <main class="pv">
    <div class="wrap">
${opts.main}
    </div>
  </main>

  <footer class="site-footer">
    <div class="wrap footer-inner">
      <a class="wordmark" href="/">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${WAVES_PATH}"/></svg>
        RowAlong
      </a>
      <span>Rowing intervals that ride on top of whatever you're watching.</span>
    </div>
  </footer>
</body>
</html>
`;
}

/** The preview of one shared workout: name, total time, intensity timeline,
 *  the blocks, and the Open in RowAlong / Download buttons. */
export function renderPreviewPage(id: string, workout: SharedWorkout): string {
  const name = escapeHtml(workout.name);
  const totalSec = workout.segments.reduce((sum, s) => sum + s.durationSec, 0);
  const total = formatClock(totalSec);
  const blocks = workout.segments.length;
  const work = workout.segments.filter((s) => INTENSITY_META[s.intensity].kind === 'work').length;
  const description = escapeHtml(
    `A ${total} rowing workout in ${plural(blocks, 'block')}, shared from RowAlong.`,
  );

  const rows = workout.segments
    .map((s, i) => {
      const meta = INTENSITY_META[s.intensity];
      const label = s.label === undefined ? '' : ` <span class="pv-block-label">· ${escapeHtml(s.label)}</span>`;
      return `        <li style="--c: ${meta.color}">
          <span class="pv-block-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="pv-block-name">${meta.label}${label}</span>
          <span class="pv-block-spm">${meta.spmLabel} spm</span>
          <span class="pv-block-dur">${formatClock(s.durationSec)}</span>
        </li>`;
    })
    .join('\n');

  const main = `      <section class="pv-head">
        <p class="eyebrow">Shared workout</p>
        <h1 class="pv-title">${name}</h1>
        <p class="pv-stats">
          <span class="pv-total">${total}</span><span>total</span>
          <span class="dot" aria-hidden="true"></span><span>${plural(blocks, 'block')}</span>${
            work ? `\n          <span class="dot" aria-hidden="true"></span><span>${work} work</span>` : ''
          }
        </p>
        <div class="pv-timeline" role="img" aria-label="Intensity timeline; the blocks are listed below"
             style="background-image: ${timelineGradient(workout.segments)}"></div>
        <div class="pv-actions">
          <a class="btn-dl" href="${escapeHtml(deepLinkFor(id))}">${ICON_OPEN} Open in RowAlong</a>
          <a class="pv-btn-alt" href="${DOWNLOAD_URL}">${ICON_DOWNLOAD} Download RowAlong</a>
        </div>
        <p class="pv-note"><b>Open in RowAlong</b> saves this workout to your Templates and loads it into the builder of RowAlong for Mac. No app yet? Download it, open it once, then come back and press Open. You can also paste this page's link into <b>Import</b> under Templates.</p>
      </section>

      <section class="pv-list" aria-label="Blocks">
        <h2 class="eyebrow">Blocks</h2>
        <ol class="pv-blocks">
${rows}
        </ol>
      </section>`;

  const url = escapeHtml(shareUrlFor(id));
  return page({
    title: `${name} · RowAlong`,
    description,
    head: `<meta property="og:title" content="${name}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="RowAlong" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${SHARE_BASE_URL}/icon.png" />`,
    main,
  });
}

/** For an unknown, malformed or unreadable id. */
export function renderNotFoundPage(): string {
  const main = `      <section class="pv-head">
        <p class="eyebrow">Shared workout</p>
        <h1 class="pv-title">We couldn't find that workout</h1>
        <p class="pv-lede">The link may be cut short: a share link ends in <b>/w/</b> and a 10-character code. Check that it was copied in full, or ask whoever sent it to share it again. If it was shared just now, wait a minute and reload.</p>
        <div class="pv-actions">
          <a class="btn-dl" href="/">Go to RowAlong</a>
          <a class="pv-btn-alt" href="${DOWNLOAD_URL}">${ICON_DOWNLOAD} Download RowAlong</a>
        </div>
      </section>`;
  return page({
    title: 'Workout not found · RowAlong',
    description: 'This shared RowAlong workout link does not point at a workout.',
    main,
  });
}
