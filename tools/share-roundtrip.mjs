// Manual end-to-end check of Share -> /w/:id preview -> Import, in headless
// Chromium against a running `wrangler dev` (:8787) and the app's dev server
// (:5173) started with VITE_SHARE_BASE_URL=http://localhost:8787.
//
// playwright-core is not a dependency of this repo; install it anywhere and
// point PW_DIR at that folder. CHROME is any Chromium binary, for example
// Playwright's chrome-headless-shell.
//   PW_DIR=/path/with/node_modules CHROME=/path/to/chromium SHOTS=/tmp/shots \
//     node tools/share-roundtrip.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire((process.env.PW_DIR ?? process.cwd()) + '/');
const { chromium } = require('playwright-core');
const APP = process.env.APP ?? 'http://localhost:5173/';
const SHOTS = process.env.SHOTS;
const NAME = 'E2E <b>Friday</b> & 20'; // markup on purpose: must render as text
const shot = (page, n) => SHOTS && page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const strip = (segs) =>
  segs.map(({ intensity, durationSec, label }) => ({ intensity, durationSec, ...(label ? { label } : {}) }));
const toneIs = (sel, tones) =>
  `${JSON.stringify(tones)}.includes(document.querySelector(${JSON.stringify(sel)})?.dataset.tone)`;

const browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
const ctx = () => browser.newContext({ viewport: { width: 1280, height: 1000 } });
try {
  // Profile A: generate a workout, name it, Share.
  const pa = await (await ctx()).newPage();
  let posted = null;
  pa.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/api/workouts')) posted = JSON.parse(r.postData());
  });
  await pa.goto(APP);
  await pa.click('.setup-generate');
  await pa.fill('.setup-name', NAME);
  await pa.click('.setup-share');
  await pa.waitForSelector('.setup-share-result:not([hidden])', { timeout: 10000 });
  const link = await pa.inputValue('.setup-share-link');
  assert.match(link, /\/w\/[A-Za-z0-9]{8}$/);
  console.log('shared:', link, `(${posted.segments.length} blocks)`);
  await shot(pa, '1-share');

  // A fresh profile opens the link as a plain web page.
  const pv = await (await ctx()).newPage();
  const res = await pv.goto(link);
  assert.equal(res.status(), 200);
  assert.equal((await pv.textContent('h1')).trim(), NAME);
  const total = (await pv.textContent('.pv-total')).trim();
  assert.equal(await pv.$$eval('.pv-timeline > *', (e) => e.length), posted.segments.length);
  assert.equal(await pv.$$eval('.pv-segs li', (e) => e.length), posted.segments.length);
  console.log('preview:', total);
  await shot(pv, '2-preview');

  // Profile B (empty storage): paste the link into Import.
  const pb = await (await ctx()).newPage();
  await pb.goto(APP);
  await pb.fill('.setup-import-input', link);
  await pb.click('.setup-import');
  await pb.waitForFunction(toneIs('.setup-import-msg', ['ok', 'error']), null, { timeout: 10000 });
  console.log('import:', await pb.textContent('.setup-import-msg'));
  const tpls = await pb.evaluate(() => JSON.parse(localStorage.getItem('wh.templates') || '[]'));
  const t = tpls.find((x) => x.name === NAME);
  assert.ok(t, 'imported template saved under its shared name');
  assert.deepEqual(strip(t.segments), strip(posted.segments));
  assert.ok(await pb.$$eval('.setup-tpl .t-name', (els, n) => els.some((e) => e.textContent === n), NAME));
  assert.equal(await pb.$$eval('.setup-editor select', (e) => e.length), posted.segments.length);
  await shot(pb, '3-import');

  // Error paths through the real Worker.
  await pb.fill('.setup-import-input', 'ZZZZZZZZ');
  await pb.click('.setup-import');
  await pb.waitForFunction(toneIs('.setup-import-msg', ['error']));
  assert.match(await pb.textContent('.setup-import-msg'), /No shared workout/);
  console.log('round trip OK');
} finally {
  await browser.close();
}
