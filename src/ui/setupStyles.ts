// Injected once by mountSetup (mirrors the overlay's "ship CSS as a string" pattern).
// Everything is scoped under `.setup` so it can't leak into the overlay document.
export const SETUP_CSS = `
  .setup {
    /* warm-tinted neutrals — same near-black family as the overlay, never pure #000/#fff */
    --bg:        oklch(0.15 0.006 70);
    --bg-2:      oklch(0.13 0.006 70);
    --surface:   oklch(0.205 0.006 70);
    --surface-2: oklch(0.245 0.006 70);
    --inset:     oklch(0.18 0.006 70);
    --border:    oklch(1 0 0 / 0.09);
    --border-2:  oklch(1 0 0 / 0.05);
    --text:      oklch(0.97 0.004 80);
    --dim:       oklch(0.97 0.004 80 / 0.62);
    --mute:      oklch(0.97 0.004 80 / 0.4);
    --cta: linear-gradient(135deg, #ff8c42, #ff4d4f);
    --radius: 16px;
    --ease: cubic-bezier(0.22, 1, 0.36, 1);
    font-family: -apple-system, system-ui, "Segoe UI", sans-serif;
    color: var(--text);
    line-height: 1.45;
    max-width: 1000px;
    margin: 0 auto;
    padding: 40px 24px 124px;
    -webkit-font-smoothing: antialiased;
  }
  body:has(> #app > .setup), body:has(> #app .setup) {
    margin: 0;
    background: oklch(0.15 0.006 70);
    background-image: radial-gradient(120% 80% at 50% -20%, oklch(0.6 0.16 45 / 0.10), transparent 60%);
    background-attachment: fixed;
  }
  .setup *, .setup *::before, .setup *::after { box-sizing: border-box; }

  /* Electron-only: drag region filling the (now title-bar-less) top strip, plus
     clearance so the brand doesn't collide with the macOS traffic lights. */
  .setup .setup-dragbar { display: none; }
  .setup.is-electron { padding-top: 52px; }
  .setup.is-electron .setup-dragbar { display: block; position: fixed; top: 0; left: 0; right: 0;
    height: 52px; z-index: 5; -webkit-app-region: drag; }

  /* ---------- header ---------- */
  /* Wordmark matches the landing page header: an inline orange waves mark and
     "RowAlong" set in Saira, mixed case, near-white (no filled badge tile). */
  .setup .brand { display: flex; align-items: center; gap: 11px; margin-bottom: 26px; }
  .setup .brand-mark { display: grid; place-items: center; flex: none; }
  .setup .brand-mark svg { width: 28px; height: 28px; stroke: #ff8c42; stroke-width: 2;
    fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .setup h1 { margin: 0; font-family: "Saira", -apple-system, system-ui, sans-serif;
    font-size: 19px; font-weight: 700; letter-spacing: 0.01em; }
  .setup .brand p { margin: 2px 0 0; font-size: 12.5px; color: var(--mute); letter-spacing: 0.02em; }

  /* ---------- tabs ---------- */
  .setup .tabs { display: inline-flex; gap: 4px; margin-bottom: 24px;
    background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 5px; }
  .setup .tab { position: relative; display: flex; align-items: center; gap: 8px;
    padding: 11px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 650;
    color: var(--dim); border: 1px solid transparent; user-select: none;
    transition: color .2s var(--ease), background .2s var(--ease); }
  .setup .tab svg { width: 18px; height: 18px; stroke: currentColor; stroke-width: 1.7; fill: none;
    stroke-linecap: round; stroke-linejoin: round; }
  .setup .tab.active { color: var(--text);
    background: linear-gradient(180deg, var(--surface-2), oklch(0.22 0.006 70));
    border-color: var(--border);
    box-shadow: 0 1px 0 oklch(1 0 0 / 0.06) inset, 0 8px 22px oklch(0 0 0 / 0.35); }
  .setup .tab.active::after { content: ""; position: absolute; left: 22%; right: 22%; bottom: -1px;
    height: 2.5px; border-radius: 2px; background: var(--cta); }
  .setup .tab[aria-disabled="true"] { color: var(--mute); cursor: not-allowed; }
  .setup .tab .soon { font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--mute); background: oklch(1 0 0 / 0.06); padding: 2px 6px; border-radius: 99px; }

  /* ---------- layout ---------- */
  .setup .grid { display: grid; grid-template-columns: 1.85fr 1fr; gap: 18px; align-items: start; }
  @media (max-width: 880px) { .setup .grid { grid-template-columns: 1fr; } }
  .setup .panel { background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 20px; }
  .setup .panel + .panel { margin-top: 18px; }
  .setup .panel-head { display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; margin-bottom: 16px; }
  .setup .panel-head h2 { margin: 0; font-size: 11.5px; font-weight: 750; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--dim); }
  .setup .panel-head .hint { font-size: 11.5px; color: var(--mute); text-align: right; }

  /* ---------- build controls ---------- */
  .setup .controls { display: grid; grid-template-columns: 1fr 1fr auto; gap: 14px; align-items: end; }
  @media (max-width: 560px) { .setup .controls { grid-template-columns: 1fr; } }
  .setup .field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
  .setup .field > label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--mute); }

  /* segmented duration */
  .setup .seg-group { display: flex; gap: 4px; background: var(--inset);
    border: 1px solid var(--border-2); border-radius: 11px; padding: 4px; }
  .setup .seg-group button { flex: 1; border: 0; background: transparent; color: var(--dim);
    font: inherit; font-weight: 650; font-size: 14px; padding: 9px 6px; border-radius: 8px;
    cursor: pointer; transition: color .15s, background .2s var(--ease); }
  .setup .seg-group button .u { font-size: 10.5px; color: var(--mute); margin-left: 3px; font-weight: 600; }
  .setup .seg-group button[aria-pressed="true"] { background: var(--surface-2); color: var(--text);
    box-shadow: 0 1px 0 oklch(1 0 0 / 0.08) inset, 0 4px 12px oklch(0 0 0 / 0.3); }
  /* the real <select> kept for tests/a11y, removed from the visual flow */
  .setup .setup-minutes { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

  /* styled native selects */
  .setup .select { position: relative; }
  .setup .select select { appearance: none; width: 100%; font: inherit; font-size: 14px; font-weight: 600;
    color: var(--text); background: var(--inset); border: 1px solid var(--border-2); border-radius: 11px;
    padding: 11px 38px 11px 13px; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
  .setup .select::after { content: ""; position: absolute; right: 14px; top: 50%; width: 8px; height: 8px;
    border-right: 1.8px solid var(--dim); border-bottom: 1.8px solid var(--dim);
    transform: translateY(-65%) rotate(45deg); pointer-events: none; }
  .setup .select select:focus-visible { outline: none; border-color: oklch(0.7 0.13 45);
    box-shadow: 0 0 0 3px oklch(0.7 0.16 45 / 0.25); }

  /* buttons */
  .setup .btn { font: inherit; font-weight: 650; font-size: 13.5px; cursor: pointer; border-radius: 11px;
    padding: 11px 16px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text);
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;
    transition: transform .15s var(--ease), background .2s, border-color .2s; }
  .setup .btn:hover { background: oklch(0.28 0.006 70); transform: translateY(-1px); }
  .setup .btn:active { transform: translateY(0); }
  .setup .btn svg { width: 15px; height: 15px; stroke: currentColor; stroke-width: 1.8; fill: none;
    stroke-linecap: round; stroke-linejoin: round; }
  /* the editor's "+ Add segment" button (styled via its .seg-add hook) */
  .setup .seg-add { font: inherit; font-weight: 650; font-size: 13.5px; cursor: pointer; width: 100%;
    margin-top: 10px; padding: 12px; border-radius: 11px; border: 1px dashed var(--border);
    background: transparent; color: var(--dim);
    transition: background .2s, color .2s, border-color .2s; }
  .setup .seg-add:hover { background: oklch(1 0 0 / 0.03); color: var(--text); border-color: var(--mute); }

  /* ---------- workout timeline ---------- */
  .setup .timeline-wrap { margin: 20px 0 14px; }
  .setup .timeline-label { display: flex; justify-content: space-between; align-items: center;
    font-size: 11px; color: var(--mute); letter-spacing: 0.04em; margin-bottom: 8px;
    text-transform: uppercase; font-weight: 650; }
  .setup .timeline { height: 12px; border-radius: 99px;
    box-shadow: 0 1px 0 oklch(1 0 0 / 0.05) inset, 0 0 0 1px var(--border-2);
    background-color: var(--inset); }
  .setup .legend { display: flex; gap: 16px; margin-top: 12px; flex-wrap: wrap; }
  .setup .legend span { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--dim); }
  .setup .legend i { width: 9px; height: 9px; border-radius: 3px; }

  /* ---------- segment rows ---------- */
  .setup .seg-list { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
  .setup .seg-row { display: flex; align-items: center; gap: 12px; background: var(--inset);
    border: 1px solid var(--border-2); border-radius: 12px; padding: 9px 12px 9px 10px;
    transition: border-color .15s, background .15s; }
  .setup .seg-row:hover { border-color: var(--border); background: oklch(0.2 0.006 70); }
  .setup .seg-handle { color: var(--mute); cursor: grab; font-size: 15px; line-height: 1; letter-spacing: -1px; }
  .setup .seg-kind { position: relative; display: inline-flex; align-items: center; min-width: 128px;
    background: color-mix(in oklab, var(--c) 16%, transparent);
    border: 1px solid color-mix(in oklab, var(--c) 35%, transparent); border-radius: 9px; }
  .setup .seg-dot { position: absolute; left: 12px; width: 9px; height: 9px; border-radius: 50%;
    background: var(--c); box-shadow: 0 0 8px color-mix(in oklab, var(--c) 70%, transparent); pointer-events: none; }
  .setup .seg-intensity { appearance: none; width: 100%; font: inherit; font-weight: 650; font-size: 13px;
    color: var(--text); background: transparent; border: 0; cursor: pointer;
    padding: 7px 28px 7px 28px; }
  .setup .seg-intensity:focus-visible { outline: none; box-shadow: 0 0 0 2px color-mix(in oklab, var(--c) 60%, transparent); border-radius: 9px; }
  .setup .seg-kind::after { content: ""; position: absolute; right: 11px; top: 50%; width: 6px; height: 6px;
    border-right: 1.6px solid var(--dim); border-bottom: 1.6px solid var(--dim);
    transform: translateY(-65%) rotate(45deg); pointer-events: none; }
  .setup .seg-time { display: inline-flex; align-items: center; gap: 6px; }
  .setup .seg-dur { width: 58px; font: inherit; font-size: 13.5px; font-weight: 600; text-align: right;
    color: var(--text); background: var(--surface); border: 1px solid var(--border-2); border-radius: 8px;
    padding: 7px 8px; font-variant-numeric: tabular-nums; }
  .setup .seg-unit { color: var(--mute); font-size: 12px; }
  .setup .seg-mmss { color: var(--dim); font-size: 12px; font-variant-numeric: tabular-nums; min-width: 36px; }
  .setup .seg-spm { margin-left: auto; font-size: 11.5px; color: var(--mute); font-variant-numeric: tabular-nums; }
  .setup .seg-actions { display: flex; gap: 2px; }
  .setup .icon-btn { width: 30px; height: 30px; display: grid; place-items: center; border: 0;
    background: transparent; color: var(--mute); cursor: pointer; border-radius: 8px; font-size: 13px;
    transition: color .15s, background .15s; }
  .setup .icon-btn:hover { background: oklch(1 0 0 / 0.06); color: var(--text); }
  .setup .icon-btn.del:hover, .setup .seg-del:hover { color: #ff4d4f; background: oklch(0.6 0.2 25 / 0.15); }

  /* save row */
  .setup .save-row { display: flex; gap: 10px; margin-top: 16px; padding-top: 16px;
    border-top: 1px solid var(--border-2); }
  .setup .setup-name { flex: 1; font: inherit; font-size: 13.5px; color: var(--text);
    background: var(--inset); border: 1px solid var(--border-2); border-radius: 11px; padding: 11px 13px; }
  .setup .setup-name::placeholder { color: var(--mute); }

  /* ---------- templates ---------- */
  .setup .setup-tpl-list { display: flex; flex-direction: column; gap: 8px; }
  .setup .setup-tpl { display: flex; align-items: center; gap: 8px; background: var(--inset);
    border: 1px solid var(--border-2); border-radius: 12px; padding-right: 8px;
    transition: border-color .15s, transform .15s var(--ease); }
  .setup .setup-tpl:hover { border-color: var(--border); transform: translateY(-1px); }
  .setup .setup-load { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
    border: 0; background: transparent; color: var(--text); cursor: pointer;
    padding: 11px 4px 11px 14px; text-align: left; font: inherit; }
  .setup .setup-tpl .t-name { font-size: 13.5px; font-weight: 650; }
  .setup .setup-tpl .t-meta { font-size: 11px; color: var(--mute); font-variant-numeric: tabular-nums; }
  .setup .setup-tpl .t-swatches { display: flex; gap: 3px; }
  .setup .setup-tpl .t-swatches i { width: 5px; height: 16px; border-radius: 2px; opacity: 0.85; }
  .setup .setup-tpl .setup-del { color: var(--mute); }

  /* ---------- preferences ---------- */
  .setup .pref { display: flex; flex-direction: column; gap: 16px; }
  .setup .pref-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .setup .pref-row > label { font-size: 13px; color: var(--dim); }
  .setup .pref .select { width: 132px; }
  .setup .pref .select select { padding: 9px 36px 9px 12px; font-size: 13px; }
  .setup .setup-volume { -webkit-appearance: none; appearance: none; width: 132px; height: 6px;
    border-radius: 99px; background: var(--inset); outline: none; }
  .setup .setup-volume::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px;
    border-radius: 50%; background: var(--text); cursor: pointer; border: 3px solid oklch(0.3 0.05 50);
    box-shadow: 0 2px 6px oklch(0 0 0 / 0.4); }
  .setup .toggle { position: relative; width: 42px; height: 24px; flex: none; }
  .setup .toggle input { opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
  .setup .toggle .track { position: absolute; inset: 0; border-radius: 99px; background: var(--inset);
    border: 1px solid var(--border); transition: background .2s var(--ease); pointer-events: none; }
  .setup .toggle .track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px;
    border-radius: 50%; background: var(--dim); transition: transform .22s var(--ease), background .2s; }
  .setup .toggle input:checked + .track { background: oklch(0.6 0.16 40 / 0.5); border-color: transparent; }
  .setup .toggle input:checked + .track::after { transform: translateX(18px); background: var(--text); }

  /* ---------- sticky start bar ---------- */
  .setup-startbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
    background: linear-gradient(180deg, oklch(0.15 0.006 70 / 0), oklch(0.13 0.006 70) 32%);
    border-top: 1px solid var(--border); }
  .setup-startbar-inner { max-width: 1000px; margin: 0 auto; padding: 16px 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 20px;
    font-family: -apple-system, system-ui, sans-serif; color: oklch(0.97 0.004 80); }
  .setup-startbar .summary { display: flex; align-items: baseline; gap: 12px; }
  .setup-startbar .summary .total { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em; }
  .setup-startbar .summary .sub { font-size: 12.5px; color: oklch(0.97 0.004 80 / 0.4); }
  .setup-startbar .summary .sub b { color: oklch(0.97 0.004 80 / 0.62); font-weight: 650; }
  .setup-start { font: inherit; font-weight: 750; font-size: 15px; letter-spacing: 0.04em;
    text-transform: uppercase; font-family: -apple-system, system-ui, sans-serif;
    color: oklch(0.16 0.02 50); background: linear-gradient(135deg, #ff8c42, #ff4d4f); border: 0;
    cursor: pointer; padding: 15px 30px; border-radius: 13px; display: inline-flex; align-items: center; gap: 10px;
    box-shadow: 0 8px 26px oklch(0.6 0.2 35 / 0.4), inset 0 1px 0 oklch(1 0 0 / 0.3);
    transition: transform .15s cubic-bezier(0.22,1,0.36,1), box-shadow .2s, opacity .2s; }
  .setup-start:hover { transform: translateY(-2px);
    box-shadow: 0 12px 34px oklch(0.6 0.2 35 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.3); }
  .setup-start svg { width: 17px; height: 17px; fill: currentColor; }
  /* Stop state: neutral surface so it reads as "running, click to end" not "go". */
  .setup-start.is-active { color: oklch(0.97 0.004 80 / 0.92);
    background: linear-gradient(135deg, oklch(0.32 0.02 50), oklch(0.26 0.02 50));
    box-shadow: 0 8px 26px oklch(0 0 0 / 0.4), inset 0 1px 0 oklch(1 0 0 / 0.12); }
  .setup-start.is-active:hover { box-shadow: 0 12px 34px oklch(0 0 0 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.12); }
  /* While active the workout is non-empty, but keep Stop clickable regardless. */
  .setup-startbar[data-empty="true"] .setup-start:not(.is-active) { opacity: 0.4; pointer-events: none; }

  @media (prefers-reduced-motion: reduce) { .setup *, .setup-startbar * { transition: none !important; } }
`;
