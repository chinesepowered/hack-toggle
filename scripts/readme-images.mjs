#!/usr/bin/env node
// Draws two pictures for the README: the architecture diagram and the still
// that links to the demo video.
//
//   node scripts/readme-images.mjs      # writes docs/architecture.png and docs/video-thumb.png

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { capybara } from '../app/views.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INK = '#3a2a1f';
const MUTED = '#7a6555';

const BASE = `*{box-sizing:border-box}html,body{margin:0}
body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:${INK};background:#fbf4e6}
.mono{font-family:'DejaVu Sans Mono',ui-monospace,Menlo,monospace}`;

// ---- architecture ------------------------------------------------------------

const W = 1400;
const H = 770;
const box = (x, y, w, h, cls, html) => `<div class="box ${cls}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px">${html}</div>`;
const label = (x, y, text, cls = '') => `<div class="lbl ${cls}" style="left:${x - 150}px;top:${y}px">${text}</div>`;
const arrow = (d) => `<path d="${d}" marker-end="url(#head)"/>`;

const architecture = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body{width:${W}px;height:${H}px;position:relative;overflow:hidden}
.lane{position:absolute;left:40px;font-size:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}}
.box{position:absolute;background:#fffdf8;border:2px solid #e7d9c4;border-radius:22px;padding:22px 24px;box-shadow:0 8px 28px rgba(58,42,31,.08)}
.box h3{margin:0 0 10px;font-size:25px;line-height:1.15;font-weight:800;letter-spacing:-.01em}
.box p{margin:0;font-size:17px;line-height:1.42;color:#5c4a3d}
.chip{display:inline-block;padding:4px 12px;border-radius:999px;font-size:15px;font-weight:700;background:#f4ecdf;color:${MUTED}}
.chip.teal{background:#e3f4f2;color:#2f7f79}.chip.orange{background:#fdeccb;color:#b5651a}
.pair{display:flex;gap:12px;margin:4px 0 12px}
.pair>div{flex:1;background:#fbf4e6;border-radius:14px;padding:12px 14px;font-size:15.5px;line-height:1.35;color:#5c4a3d}
.pair .chip{margin-bottom:7px}
.dark{background:#241a14;border-color:#241a14;color:#fffdf8}
.dark h3{color:#fffdf8}.dark .sub{font-size:16px;color:#cdbfae;margin:-4px 0 16px}
.tile{background:#3a2a1f;border-radius:14px;padding:13px 16px;margin-bottom:19px}
.tile b{display:block;font-size:18px;margin-bottom:3px}
.tile span{font-size:15.5px;line-height:1.35;color:#e2d6c6}
.cmds{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 12px}
.cmds .chip{background:#241a14;color:#f6b93b;font-family:'DejaVu Sans Mono',monospace;font-size:14.5px;font-weight:700}
.lbl{position:absolute;width:300px;text-align:center;font-size:15px;line-height:1.3;color:${INK};font-weight:600}
.lbl.soft{font-weight:500;color:${MUTED}}
.lbl.wide{width:640px;margin-left:-170px}
.mascot{position:absolute;right:18px;top:10px}
svg.wires{position:absolute;inset:0}
svg.wires path{fill:none;stroke:${MUTED};stroke-width:2.5}
</style></head><body>
<div class="lane" style="top:30px">The traffic and the data</div>
<div class="lane" style="top:472px">Who runs the experiment</div>

${box(40, 62, 300, 290, '', `<h3>AI guests</h3>
  <p>A language model drives a real Chromium browser through Playwright. It reads each page as an accessibility snapshot and answers with one click or one fill.</p>
  <p style="margin-top:12px"><span class="chip">no pixels</span> <span class="chip">no script</span></p>`)}

${box(490, 62, 390, 290, '', `<div class="mascot">${capybara({ size: 78 })}</div><h3>Capybara Onsen<br>booking site</h3>
  <div class="pair"><div><span class="chip orange">classic</span><br>&lt;div&gt;s, no names, state only in styling</div>
  <div><span class="chip teal">accessible</span><br>buttons, labels, ARIA state</div></div>
  <p>The same pixels. The flag decides which one a visitor gets.</p>`)}

${box(1030, 62, 330, 668, 'dark', `<h3>Flagsmith</h3><div class="sub">self-hosted, open source</div>
  <div class="tile"><b>Feature flag</b><span class="mono" style="font-size:14.5px">booking_form</span><span><br>classic or accessible</span></div>
  <div class="tile"><b>Experiment</b><span>50/50 split, four metrics, guardrails</span></div>
  <div class="tile"><b>Events</b><span>exposures and conversions, kept in Flagsmith's own database</span></div>
  <div class="tile"><b>Results</b><span>lift, 95% interval, chance to beat the control</span></div>
  <div class="tile" style="margin-bottom:0"><b>Rollout</b><span>the winner ships through the same flag</span></div>`)}

${box(40, 504, 300, 226, '', `<h3>A person</h3>
  <p>Reads the plan and the pre-launch check, then approves the start. Reads the results, then approves the ship.</p>`)}

${box(490, 504, 390, 226, '', `<h3>Coding agent + Agent Skill</h3>
  <div class="cmds">${['fx setup', 'check', 'start', 'status', 'results', 'ship', 'stop'].map((c) => `<span class="chip">${c}</span>`).join('')}</div>
  <p>Catches what would fail silently. Refuses to ship over a breached guardrail. Records every approval.</p>`)}

<svg class="wires" viewBox="0 0 ${W} ${H}"><defs><marker id="head" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:${MUTED};stroke:none"/></marker></defs>
  ${arrow('M342 190H486')}
  ${arrow('M882 150H1026')}
  ${arrow('M882 262H1026')}
  ${arrow('M190 354V418H1026')}
  ${arrow('M342 618H486')}
  ${arrow('M882 618H1026')}
</svg>
${label(415, 160, 'books a soak')}
${label(415, 199, 'through the form', 'soft')}
${label(955, 120, 'reads the flag')}
${label(955, 159, '= an exposure', 'soft')}
${label(955, 232, 'booking event')}
${label(955, 271, 'when stored', 'soft')}
${label(610, 388, 'after each visit, the harness audits the booking and sends', 'wide')}
${label(610, 427, '<span class="mono" style="font-size:14px">booking_correct · guest_steps · guest_tokens</span>', 'soft wide')}
${label(415, 588, 'approves')}
${label(415, 627, 'start and ship', 'soft')}
${label(955, 588, 'Flagsmith CLI')}
${label(955, 627, 'nothing by hand', 'soft')}
</body></html>`;

// ---- the still that links to the video -----------------------------------------

const thumb = `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}
body{width:1280px;height:720px;position:relative;overflow:hidden}
img{position:absolute;inset:0;width:1280px;height:800px;object-fit:cover;object-position:top}
.shade{position:absolute;inset:0;background:rgba(36,26,20,.38)}
.play{position:absolute;left:50%;top:50%;width:170px;height:170px;margin:-85px 0 0 -85px;border-radius:50%;background:#fffdf8;box-shadow:0 12px 40px rgba(0,0,0,.35)}
.play:after{content:'';position:absolute;left:66px;top:45px;border-style:solid;border-width:40px 0 40px 62px;border-color:transparent transparent transparent #c96f1a}
.cap{position:absolute;left:0;right:0;top:478px;text-align:center}
.cap span{display:inline-block;padding:12px 30px;border-radius:999px;background:#241a14;color:#fffdf8;font-size:32px;font-weight:800;letter-spacing:-.01em}
</style></head><body><img src="data:image/png;base64,${readFileSync(join(ROOT, 'docs', 'landing.png')).toString('base64')}"><div class="shade"></div><div class="play"></div>
<div class="cap"><span>Watch the demo</span></div></body></html>`;

// ---- render ------------------------------------------------------------------

const browser = await chromium.launch();
for (const [name, html, width, height] of [
  ['architecture', architecture, W, H],
  ['video-thumb', thumb, 1280, 720],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: name === 'architecture' ? 2 : 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, 'docs', `${name}.png`) });
  await page.close();
  console.log(`docs/${name}.png`);
}
await browser.close();
