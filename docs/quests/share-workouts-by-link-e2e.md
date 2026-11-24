# Share workouts by link: end-to-end check (ROW-5)

Run on 2026-11-23 on macOS (Apple Silicon), Node 24, wrangler 4.166, against
`wrangler dev` with local KV and rate limiter. Nothing was deployed.

## Steps

1. `npx wrangler dev --port 8787` (the `rowalong` Worker: `site/` + API + `/w/:id`).
2. `VITE_SHARE_BASE_URL=http://localhost:8787 npm run dev` (the app on :5173).
3. `node tools/share-roundtrip.mjs` in headless Chromium, three separate
   browser profiles (empty storage each):
   - **Profile A** (app): Generate a 20-minute workout, name it
     `E2E <b>Friday</b> & 20` (markup on purpose), click **Share**.
   - **Fresh profile**: open the returned link.
   - **Profile B** (app, no templates): paste the link into **Import**, then
     an unknown id (`ZZZZZZZZ`) and a non-share URL.
4. `curl` against :8787 for the API edges and the static site.

## Result: pass

| Check | Result |
| --- | --- |
| Share | `POST /api/workouts` → 201; link `http://localhost:8787/w/HBKH2h9P`; "Anyone with this link can view and import …" |
| Preview `/w/:id` | 200 with CSP; title and h1 show the name as text (escaped); "20 min · 17 blocks"; 17 timeline bars and 17 block rows |
| Import (profile B) | "Imported … and saved it to your templates"; templates 0 → 1 under the shared name; segments identical to what was shared (intensity, duration, label); editor loaded (20:00, 17 rows) |
| Import errors | unknown id → "No shared workout at that link…"; `https://example.com/nope` → "That doesn't look like a RowAlong share link…" |
| CORS | `OPTIONS /api/workouts` with `Origin: null` → 204, ACAO `*`, methods `GET, POST, OPTIONS`, headers `content-type`; `GET` with `Origin: null` → 200, ACAO `*`, `immutable` |
| Validation | unknown intensity → 400; 7 s duration → 400 "multiple of 5 seconds"; ~10 KB body → 413; unknown id → 404 JSON; `/w/ZZZZZZZZ` → 404 page |
| Rate limit | 7 creates in a row → 1 × 201 then 429s (the minute's other 4 were used by the steps above; limit is 5/60 s per IP) |
| Landing site | `/` → 200, byte-identical to `site/index.html`, `_headers` applied (nosniff, X-Frame-Options DENY); `/styles.css` 200 |
| Deploy bundle | `wrangler deploy --dry-run`: 6 asset files, bindings `SHARES` (KV), `CREATE_LIMITER` (5/60 s), `ASSETS` |
| Suite | `npm test` 280 passed; `npm run typecheck` clean |

Screenshots (preview page, and profile B after import) were checked by eye:
the preview matches the landing page's style, the imported template appears in
the list with its name shown literally.

## Not covered

- The Electron build: its Electron binary isn't installed in this sandbox. Its
  only difference for sharing is the `null` / `http://localhost:5173` Origin,
  covered by the CORS checks above.
- A real deploy to Cloudflare (KV provisioning, the custom domain).
