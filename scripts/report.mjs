#!/usr/bin/env node
// Collect the evidence for a finished run into experiments/results/.
//
//   node scripts/report.mjs --run prod1 --env production [--experiment 12] [--out experiments/results]
//
// Writes:
//   guests.csv             one row per AI guest (version, outcome, actions, tokens, audit)
//   summary.json           per-version totals, means, exact bounds and the token breakdown
//   flagsmith-*.json       the experiment and its results exactly as Flagsmith's API returns them
//   results.html / .png    the results figure
//   transcripts/           a few complete guest transcripts
//
// The Flagsmith payloads are fetched with the Flagsmith CLI, so run
// `source .flagsmith/flagsmith.env` first.

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { minimumActions } from '../guests/briefs.mjs';
import { ROOT, flagsmithState, parseArgs } from './env.mjs';

const args = parseArgs();
const runId = String(args.run || '');
const envName = String(args.env || 'production');
const out = resolve(String(args.out || join(ROOT, 'experiments', 'results')));
if (!runId) throw new Error('--run <run id> is required');
const runDir = join(process.env.ONSEN_DATA_DIR || join(ROOT, 'data'), 'runs', runId);
mkdirSync(join(out, 'transcripts'), { recursive: true });

// ---- guests -----------------------------------------------------------------

const guests = readdirSync(runDir)
  .filter((f) => f.startsWith(`${runId}_g`))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(runDir, f), 'utf8')));

const runSummary = existsSync(join(runDir, 'summary.json')) ? JSON.parse(readFileSync(join(runDir, 'summary.json'), 'utf8')) : {};
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const rows = guests.map((g) => ({
  guest: g.guestId,
  version: g.variant ?? '',
  outcome: g.outcome,
  completed: g.audit?.completed ? 1 : 0,
  correct: g.audit?.correct ? 1 : 0,
  actions: g.actions,
  // Actions beyond the fewest that could have completed this guest's brief.
  extra_actions: g.actions - minimumActions(g.brief, runSummary.today),
  turns: g.turns,
  prompt_tokens: g.tokens.prompt,
  completion_tokens: g.tokens.completion,
  tokens: g.tokens.prompt + g.tokens.completion,
  problems: (g.audit?.problems ?? []).join('; '),
}));
writeFileSync(join(out, 'guests.csv'), [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(csvCell).join(','))].join('\n') + '\n');

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
// Exact (Clopper-Pearson) two-sided 95% interval for k successes in n, by bisection on the binomial tail.
function binomTail(n, k, p) {
  // P(X <= k)
  let term = (1 - p) ** n;
  let sum = term;
  for (let i = 0; i < k; i++) {
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
    sum += term;
  }
  return sum;
}
function exactInterval(k, n) {
  const solve = (f) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid)) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const lower = k === 0 ? 0 : solve((p) => 1 - binomTail(n, k - 1, p) < 0.025);
  const upper = k === n ? 1 : solve((p) => binomTail(n, k, p) > 0.025);
  return [lower, upper];
}

const versions = {};
for (const version of ['classic', 'accessible']) {
  const g = rows.filter((r) => r.version === version);
  if (!g.length) continue;
  const correct = g.filter((r) => r.correct).length;
  const completed = g.filter((r) => r.completed).length;
  const turns = g.reduce((a, r) => a + r.turns, 0);
  versions[version] = {
    guests: g.length,
    completed,
    correct,
    correctRate: correct / g.length,
    correctRateExact95: exactInterval(correct, g.length),
    actionsMean: mean(g.map((r) => r.actions)),
    guestsWithExtraActions: g.filter((r) => r.extra_actions > 0).length,
    extraActionsMean: mean(g.map((r) => r.extra_actions)),
    actionsSd: sd(g.map((r) => r.actions)),
    tokensMean: mean(g.map((r) => r.tokens)),
    tokensSd: sd(g.map((r) => r.tokens)),
    tokensMedian: median(g.map((r) => r.tokens)),
    turnsMean: turns / g.length,
    promptTokensPerTurn: g.reduce((a, r) => a + r.prompt_tokens, 0) / turns,
    completionTokensPerTurn: g.reduce((a, r) => a + r.completion_tokens, 0) / turns,
    problems: g.flatMap((r) => (r.problems ? r.problems.split('; ') : [])).reduce((acc, p) => ({ ...acc, [p]: (acc[p] ?? 0) + 1 }), {}),
  };
}
const neverReached = rows.filter((r) => !r.version).length;
const summary = {
  runId,
  env: envName,
  model: runSummary.model,
  seed: runSummary.seed,
  guests: rows.length,
  neverReachedTheForm: neverReached,
  tokensLift: versions.classic && versions.accessible ? versions.accessible.tokensMean / versions.classic.tokensMean - 1 : null,
  totalTokens: rows.reduce((a, r) => a + r.tokens, 0),
  versions,
};
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');

// A few complete transcripts: the shortest correct run of each version, every
// incorrect one (up to four), and the three guests who took the longest detours.
const extraOf = new Map(rows.map((r) => [r.guest, r.extra_actions]));
const pickTranscripts = [
  ...['classic', 'accessible'].map((v) => guests.filter((g) => g.variant === v && g.audit?.correct).sort((a, b) => a.actions - b.actions)[0]),
  ...guests.filter((g) => g.variant && !g.audit?.correct).slice(0, 4),
  ...guests
    .filter((g) => extraOf.get(g.guestId) > 0)
    .sort((a, b) => extraOf.get(b.guestId) - extraOf.get(a.guestId))
    .slice(0, 3),
].filter(Boolean);
for (const g of pickTranscripts) copyFileSync(join(runDir, `${g.guestId}.json`), join(out, 'transcripts', `${g.guestId}.json`));

// ---- Flagsmith's own numbers ------------------------------------------------

const state = flagsmithState();
const envKey = state.environments[envName].clientKey;
const api = (path) => JSON.parse(execFileSync('flagsmith', ['api', `api/v1/environments/${envKey}/${path}`], { encoding: 'utf8' }));
let experimentId = args.experiment ? Number(args.experiment) : null;
if (!experimentId) {
  const list = api('experiments/');
  experimentId = (list.results ?? list).sort((a, b) => b.id - a.id)[0]?.id;
}
const experiment = api(`experiments/${experimentId}/`);
const results = api(`experiments/${experimentId}/results/`);
writeFileSync(join(out, 'flagsmith-experiment.json'), JSON.stringify(experiment, null, 2) + '\n');
writeFileSync(join(out, 'flagsmith-results.json'), JSON.stringify(results, null, 2) + '\n');

// ---- figure -----------------------------------------------------------------
// Form: the headline numbers are a KPI row, not a bar chart. The one thing worth
// plotting is how the tokens-per-guest distribution shifts, as two small
// multiples on a shared axis. Series colours passed the palette validator on
// this surface (worst colour-blind separation 12.9, both at least 3:1 contrast).

const SERIES = { classic: '#c96f1a', accessible: '#0d9488' };
const fmt = (n, d = 0) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const c = versions.classic;
const a = versions.accessible;

function histogram() {
  const all = rows.filter((r) => r.version).map((r) => r.tokens);
  const step = 2500;
  const lo = Math.floor(Math.min(...all) / step) * step;
  const hi = Math.ceil((Math.max(...all) + 1) / step) * step;
  const bins = Math.round((hi - lo) / step);
  const W = 1000;
  const plotH = 120;
  const left = 150;
  const right = 30;
  const x = (v) => left + ((v - lo) / (hi - lo)) * (W - left - right);
  const counts = (version) => {
    const out = Array(bins).fill(0);
    for (const r of rows) if (r.version === version) out[Math.min(bins - 1, Math.floor((r.tokens - lo) / step))]++;
    return out;
  };
  const peak = Math.max(...counts('classic'), ...counts('accessible'));
  const band = (x(lo + step) - x(lo));
  const barW = Math.min(24, band - 2);
  const panel = (version, top) => {
    const base = top + plotH;
    const bars = counts(version)
      .map((n, i) => {
        if (!n) return '';
        const h = Math.max(2, (n / peak) * (plotH - 18));
        const bx = x(lo + i * step) + (band - barW) / 2;
        const r = Math.min(4, h);
        // Rounded at the data end, square on the baseline.
        return `<path d="M${bx},${base} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${SERIES[version]}"><title>${version}: ${n} guests used ${fmt(lo + i * step)} to ${fmt(lo + (i + 1) * step)} tokens</title></path>`;
      })
      .join('');
    const m = versions[version].tokensMean;
    return `
      <line x1="${left}" x2="${W - right}" y1="${base}" y2="${base}" stroke="#e7d9c4"/>
      ${bars}
      <line x1="${x(m)}" x2="${x(m)}" y1="${top + 4}" y2="${base}" stroke="#3a2a1f" stroke-width="2"/>
      <text x="${x(m) + 8}" y="${top + 16}" class="lbl">mean ${fmt(m)}</text>
      <circle cx="14" cy="${top + plotH / 2 - 5}" r="6" fill="${SERIES[version]}"/>
      <text x="28" y="${top + plotH / 2}" class="name">${version}</text>
      <text x="28" y="${top + plotH / 2 + 20}" class="tick">${versions[version].guests} guests</text>`;
  };
  const ticks = [];
  for (let v = Math.ceil(lo / 10000) * 10000; v <= hi; v += 10000) ticks.push(v);
  const axisY = 30 + plotH + 30 + plotH;
  return `<svg viewBox="0 0 ${W} ${axisY + 40}" width="${W}" height="${axisY + 40}" role="img" aria-label="Histogram of tokens used per guest, for each version of the form">
    ${panel('classic', 20)}
    ${panel('accessible', 20 + plotH + 30)}
    ${ticks.map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${axisY}" y2="${axisY + 5}" stroke="#cdbda7"/><text x="${x(v)}" y="${axisY + 22}" text-anchor="middle" class="tick">${v / 1000}K</text>`).join('')}
    <text x="28" y="${axisY + 22}" class="tick">tokens per guest</text>
  </svg>`;
}

const tile = (label, rowsHtml, note) => `<div class="tile"><div class="label">${label}</div>${rowsHtml}<div class="note">${note}</div></div>`;
const pair = (cv, av) =>
  `<div class="pair"><div><span class="dot" style="background:${SERIES.classic}"></span><span class="v">${cv}</span><span class="who">classic</span></div>` +
  `<div><span class="dot" style="background:${SERIES.accessible}"></span><span class="v">${av}</span><span class="who">accessible</span></div></div>`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Results: accessible booking form and AI guests</title><style>
  *{box-sizing:border-box} body{margin:0;background:#fbf4e6;color:#3a2a1f;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
  .fig{width:1100px;padding:36px 50px 30px;background:#fffdf8}
  h1{margin:0 0 4px;font-size:26px;font-weight:800;letter-spacing:-.01em} .sub{color:#7a6555;font-size:15px;margin-bottom:22px}
  .tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:26px}
  .tile{border:1px solid #e7d9c4;border-radius:14px;padding:16px 18px} .label{font-size:14px;font-weight:600;color:#7a6555;margin-bottom:6px}
  .pair>div{display:flex;align-items:baseline;gap:8px}
  .dot{width:11px;height:11px;border-radius:50%;display:inline-block;align-self:center} .v{font-size:29px;font-weight:700;letter-spacing:-.02em;min-width:118px} .who{font-size:13.5px;color:#7a6555}
  .note{margin-top:8px;font-size:13.5px;color:#7a6555;line-height:1.4} .note b{color:#3a2a1f}
  h2{margin:0 0 6px;font-size:16px;font-weight:700} .lbl{font-size:13px;font-weight:600;fill:#3a2a1f} .name{font-size:15px;font-weight:700;fill:#3a2a1f} .tick{font-size:12.5px;fill:#7a6555}
  .foot{margin-top:6px;font-size:12.5px;color:#7a6555}
</style></head><body><div class="fig">
  <h1>Correct bookings: ${pct(c.correctRate, 1)} classic, ${pct(a.correctRate, 1)} accessible. Tokens per guest: ${summary.tokensLift >= 0 ? '+' : ''}${pct(summary.tokensLift, 0)} on accessible.</h1>
  <div class="sub">${summary.guests} AI guests (${esc(summary.model ?? '')}), ${envName}, Flagsmith experiment ${experimentId}. Figures from the run log; Flagsmith's verdicts are in the table below the figure.</div>
  <div class="tiles">
    ${tile('Correct bookings', pair(`${c.correct}/${c.guests}`, `${a.correct}/${a.guests}`), `${pct(c.correctRate)} and ${pct(a.correctRate)}. Exact 95% lower bounds: <b>${pct(c.correctRateExact95[0])}</b> and <b>${pct(a.correctRateExact95[0])}</b>.`)}
    ${tile('Actions per guest', pair(fmt(c.actionsMean, 1), fmt(a.actionsMean, 1)), `Clicks and fills, mean. <b>${c.guestsWithExtraActions} of ${c.guests}</b> classic guests took a detour; <b>${a.guestsWithExtraActions} of ${a.guests}</b> accessible guests did.`)}
    ${tile('Tokens per guest', pair(fmt(c.tokensMean), fmt(a.tokensMean)), `Mean, prompt plus completion. Accessible is <b>${pct(Math.abs(summary.tokensLift), 0)} ${summary.tokensLift >= 0 ? 'higher' : 'lower'}</b>: ${fmt(a.promptTokensPerTurn)} against ${fmt(c.promptTokensPerTurn)} prompt tokens per turn.`)}
  </div>
  <h2>Tokens used per guest</h2>
  ${histogram()}
  <div class="foot">Bars count guests in 2,500-token bins, on one shared axis. The vertical line is each version's mean.</div>
</div></body></html>`;
function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}
writeFileSync(join(out, 'results.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 2 });
await page.goto(`file://${join(out, 'results.html')}`);
await page.locator('.fig').screenshot({ path: join(out, 'results.png') });
await browser.close();

console.log(`report for ${runId} (${rows.length} guests, experiment ${experimentId}) written to ${out}`);
for (const [v, s] of Object.entries(versions)) {
  console.log(`  ${v.padEnd(10)} ${s.correct}/${s.guests} correct, ${s.actionsMean.toFixed(2)} actions, ${Math.round(s.tokensMean)} tokens`);
}
