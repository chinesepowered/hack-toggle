#!/usr/bin/env node
// Builds the demo video from video/script.json.
//
// Every scene has a line of narration and a visual. Visuals are rendered in a
// real browser at 1920x1080 (live pages of the running site and Flagsmith, or
// explainer cards drawn from real output files), the narration is spoken by
// ElevenLabs, and ffmpeg cuts the scenes to the length of their narration and
// burns in captions.
//
//   node video/build.mjs                 # everything -> video/out/capybara-onsen.mp4
//   node video/build.mjs --only hook,why # re-render some scenes, then re-assemble
//   node video/build.mjs --frames        # render frames only (no audio, no ffmpeg)

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { capybara } from '../app/views.mjs';
import { loadDotEnv, parseArgs } from '../scripts/env.mjs';
import { speak } from './tts.mjs';

loadDotEnv();
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BUILD = join(HERE, 'build');
const OUT = join(HERE, 'out');
const args = parseArgs();
const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
const script = JSON.parse(readFileSync(join(HERE, 'script.json'), 'utf8'));

const W = 1920;
const H = 1080;
const FPS = 30;
const LEAD = 0.35; // silence before a line
const TAIL = 0.55; // silence after it

for (const dir of ['frames', 'html', 'audio', 'segments']) mkdirSync(join(BUILD, dir), { recursive: true });
mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fileUrl = (p) => `file://${resolve(ROOT, p)}`;
const text = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// ---- shared look ------------------------------------------------------------

const CSS = `
*{box-sizing:border-box} html,body{margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;background:#fbf4e6;color:#3a2a1f;
  font-family:Inter,ui-sans-serif,system-ui,sans-serif;font-size:30px;line-height:1.35}
.pad{position:absolute;inset:0;padding:64px 90px 150px;display:flex;flex-direction:column}
h1{margin:0;font-size:92px;line-height:1.04;font-weight:800;letter-spacing:-.03em}
h2{margin:0 0 30px;font-size:54px;line-height:1.1;font-weight:800;letter-spacing:-.02em}
.sub{font-size:36px;color:#7a6555;margin-top:22px;max-width:1100px}
.row{display:flex;gap:40px;flex:1;min-height:0}
.card{flex:1;min-width:0;background:#fffdf8;border:2px solid #e7d9c4;border-radius:28px;
  box-shadow:0 10px 40px rgba(58,42,31,.10);overflow:hidden;display:flex;flex-direction:column}
.card-head{padding:18px 26px;font-size:28px;font-weight:700;border-bottom:2px solid #e7d9c4;display:flex;align-items:center;gap:14px}
.chip{display:inline-block;padding:6px 16px;border-radius:999px;font-size:24px;font-weight:700;background:#f4ecdf;color:#7a6555}
.chip.teal{background:#e3f4f2;color:#2f7f79}.chip.orange{background:#fdeccb;color:#b5651a}.chip.red{background:#fbe3e0;color:#b3261e}
.card img{display:block;width:100%;flex:1;min-height:0;object-fit:cover;object-position:top}
.banner{margin-top:30px;font-size:40px;font-weight:800;text-align:center}
.banner b{color:#2f7f79}
pre{margin:0;font-family:'DejaVu Sans Mono',ui-monospace,Menlo,monospace}
.code{flex:1;min-height:0;padding:22px 26px;font-size:23px;line-height:1.5;white-space:pre;overflow:hidden;color:#4a3a2f}
.code .dim{color:#b3a595}.code .bad{background:#fbe3e0;color:#b3261e;font-weight:700}.code .good{background:#e3f4f2;color:#1f6661;font-weight:700}
.term{flex:1;min-height:0;background:#241a14;border-radius:28px;padding:34px 40px;color:#f3e9da;font-size:27px;line-height:1.55;
  box-shadow:0 10px 40px rgba(58,42,31,.25);overflow:hidden}
.term .cmd{color:#f6b93b;font-weight:700}.term .ok{color:#8ad6a4}.term .fail{color:#ff8f80;font-weight:700}
.term .win{color:#8ad6a4;font-weight:700}.term .warn{color:#f6b93b;font-weight:700}.term .dim{color:#a8998a}
.term{white-space:pre-wrap;overflow-wrap:anywhere}
.quote{margin-top:26px;padding:24px 30px;background:#fffdf8;border:2px solid #e7d9c4;border-radius:24px;font-size:30px;line-height:1.35;display:flex;gap:22px;align-items:center}
.quote .chip{flex:none}.quote code{font-family:'DejaVu Sans Mono',ui-monospace,monospace;font-size:25px;white-space:pre-wrap}
table.verdict{width:100%;border-collapse:separate;border-spacing:0 14px;font-size:30px;white-space:nowrap}
table.verdict thead th{font-size:23px;font-weight:600;color:#7a6555;text-align:left;padding:0 22px}
table.verdict tbody tr{background:#fffdf8}
table.verdict tbody th,table.verdict tbody td{padding:22px 22px;text-align:left;border-top:2px solid #e7d9c4;border-bottom:2px solid #e7d9c4;font-weight:700}
table.verdict tbody th{border-left:2px solid #e7d9c4;border-radius:22px 0 0 22px;font-weight:800}
table.verdict tbody td:last-child{border-right:2px solid #e7d9c4;border-radius:0 22px 22px 0}
table.verdict small{display:block;font-size:21px;font-weight:600;color:#7a6555}
.ratio{margin-top:10px;font-size:25px;color:#7a6555;font-family:'DejaVu Sans Mono',monospace}
.center{align-items:center;justify-content:center;text-align:center}
.shot{position:absolute;inset:0}.shot img{width:${W}px;height:${H}px;display:block}
.ring{position:absolute;border:6px solid #f6b93b;border-radius:16px;box-shadow:0 0 0 9999px rgba(36,26,20,.28)}
.bar{position:absolute;left:0;right:0;top:0;padding:22px 44px;background:#241a14;color:#fffdf8;display:flex;gap:28px;align-items:center}
.bar .who{flex:none}.bar .think{flex:1;font-size:32px;line-height:1.3}
.bar .saw{flex:none;max-width:640px;font-family:'DejaVu Sans Mono',monospace;font-size:23px;padding:10px 16px;border-radius:12px;background:#3a2a1f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar .saw.bad{color:#ffb4a8}.bar .saw.good{color:#9be0d8}
.stat{display:flex;gap:40px;margin-top:10px}
.stat>div{flex:1;background:#fffdf8;border:2px solid #e7d9c4;border-radius:28px;padding:30px 36px}
.stat .k{font-size:28px;color:#7a6555;font-weight:600}.stat .v{font-size:76px;font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-top:6px}
.stat .n{font-size:26px;color:#7a6555;margin-top:6px}
.crop{flex:none;overflow:hidden;background:#fff;border:2px solid #e7d9c4;border-radius:22px;box-shadow:0 10px 40px rgba(58,42,31,.10)}
.crop+.crop{margin-top:22px}.crop img{display:block;max-width:none}
.tiles{display:flex;gap:22px;margin-top:22px}
.tiles>div{flex:1;background:#fffdf8;border:2px solid #e7d9c4;border-radius:20px;padding:12px 22px}
.tiles b{display:block;font-size:28px}.tiles span{font-size:23px;color:#7a6555}
.tiles.big>div{padding:22px 28px}.tiles.big small{display:block;font-size:24px;font-weight:700;color:#b5651a;margin-bottom:4px}
.tiles.big b{font-size:36px}.tiles.big span{font-size:28px}
.term .note{color:#fff;font-weight:700}
.foot{margin-top:18px;font-size:25px;color:#7a6555}
`;

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

// ---- explainer cards --------------------------------------------------------

function colourTerminal(line) {
  const e = esc(line);
  if (/^\$ /.test(line)) return `<span class="cmd">${e}</span>`;
  if (/^ok /.test(line)) return `<span class="ok">ok</span>${e.slice(2)}`;
  if (/^FAIL /.test(line)) return `<span class="fail">${e}</span>`;
  if (/^==> /.test(line)) return `<span class="note">${e}</span>`;
  return e
    .replace(/(WINNING|guardrail ok|sample ratio: ok)/g, '<span class="win">$1</span>')
    .replace(/(GUARDRAIL BREACHED|LOSING|MISMATCH)/g, '<span class="fail">$1</span>')
    .replace(/(inconclusive|collecting data)/g, '<span class="warn">$1</span>')
    .replace(/^(fx: .*)$/, '<span class="fail">$1</span>')
    .replace(/^(ready\. .*)$/, '<span class="note">$1</span>')
    .replace(/^(recorded in .*|as of .*|note: .*)$/, '<span class="dim">$1</span>');
}

function colourSnapshot(line) {
  const e = esc(line);
  // Controls with no name: a clickable element with no text, or a text box with no label.
  if (/^\s*- generic( \[ref=\w+\])? \[cursor=pointer\]\s*$/.test(line) || /^\s*- textbox( \[ref=\w+\])?(:.*)?$/.test(line)) return `<span class="bad">${e}</span>`;
  if (/- (button|radio|checkbox|textbox|status|heading|group|radiogroup) "/.test(line)) return `<span class="good">${e}</span>`;
  return e;
}

const TEMPLATES = {
  title: ({ title, sub, mascot = true }) =>
    page(`<div class="pad center">${mascot ? capybara({ size: 330 }) : ''}<h1 style="margin-top:20px">${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>`),

  compare: ({ heading, left, right, banner }) =>
    page(`<div class="pad"><h2>${esc(heading)}</h2><div class="row">
      ${[left, right].map((s) => `<div class="card"><div class="card-head"><span class="chip ${s.tone || ''}">${esc(s.label)}</span>${esc(s.note || '')}</div><img src="${fileUrl(s.image)}"></div>`).join('')}
      </div>${banner ? `<div class="banner">${banner}</div>` : ''}</div>`),

  snapshots: ({ heading, left, right, banner }) =>
    page(`<div class="pad"><h2>${esc(heading)}</h2><div class="row">
      ${[left, right].map((s) => `<div class="card"><div class="card-head"><span class="chip ${s.tone || ''}">${esc(s.label)}</span>${esc(s.note || '')}</div><pre class="code">${s.lines.map(colourSnapshot).join('\n')}</pre></div>`).join('')}
      </div>${banner ? `<div class="banner">${banner}</div>` : ''}</div>`),

  // A terminal session. Each part is a command line followed by the real output
  // it produced, read from a saved file: optionally only the lines matching the
  // regular expression `match`, and of those only lines `from`..`to`. `foot` is
  // a note under the terminal, used to say when the output is abridged.
  terminal: ({ heading, parts, size = 27, foot }) => {
    const all = parts.flatMap((p, i) => [
      ...(i ? [''] : []),
      `$ ${p.cmd}`,
      ...text(p.file)
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('$ ') && (!p.match || new RegExp(p.match).test(l)))
        .slice(p.from ?? 0, p.to),
    ]);
    return page(`<div class="pad"><h2>${esc(heading)}</h2><pre class="term" style="font-size:${size}px">${all.map(colourTerminal).join('\n')}</pre>${
      foot ? `<div class="foot">${esc(foot)}</div>` : ''
    }</div>`);
  },

  // A full-frame picture, such as a saved screenshot of the Flagsmith dashboard.
  picture: ({ image }) => page(`<div class="shot"><img src="${fileUrl(image)}"></div>`),

  // Parts of a saved screenshot, enlarged so that a busy page can be read at video size.
  // Each crop is [x, y, width, height] in the picture's own pixels; nothing inside a crop is changed.
  // `spec` adds one tile per metric of an experiment spec file.
  crops: ({ heading, image, imageWidth = W, crops, spec, width = W - 180 }) => {
    const scale = (width - 4) / Math.max(...crops.map((c) => c[2]));
    const px = (n) => `${(n * scale).toFixed(1)}px`;
    const metrics = spec ? JSON.parse(text(spec)).metrics : [];
    return page(`<div class="pad"><h2>${esc(heading)}</h2><div style="width:${width}px">${crops
      .map(([x, y, w, h]) => `<div class="crop" style="width:${px(w)};height:${px(h)}"><img src="${fileUrl(image)}" style="width:${px(imageWidth)};margin:-${px(y)} 0 0 -${px(x)}"></div>`)
      .join('')}${
      metrics.length
        ? `<div class="tiles">${metrics.map((m, i) => `<div><b>${esc(m.name)}</b><span>${i ? '' : 'primary · '}should ${esc(m.expected.replace('_', ' '))}</span></div>`).join('')}</div>`
        : ''
    }</div></div>`);
  },

  // What was registered before the run: the spec's metrics with their expected
  // directions, sentences quoted from the pre-registration (for each quote, the
  // line of `file` that contains `find`), and a line of evidence.
  registered: ({ heading, spec, file, quotes = [], banner }) => {
    const metrics = JSON.parse(text(spec)).metrics;
    const lines = text(file).split('\n');
    const quote = ({ who, tone, find }) => {
      const line = lines.find((l) => l.includes(find));
      if (!line) throw new Error(`"${find}" not found in ${file}`);
      const plain = line.replace(/^[-*] /, '').replace(/[*`]/g, '').trim();
      return `<div class="quote"><span class="chip ${tone || ''}">${esc(who)}</span><span>&ldquo;${esc(plain)}&rdquo;</span></div>`;
    };
    return page(`<div class="pad"><h2>${esc(heading)}</h2><div class="tiles big" style="margin-top:0">${metrics
      .map((m, i) => `<div><small>H${i + 1}${i ? '' : ', primary'}</small><b>${esc(m.name)}</b><span>should ${esc(m.expected.replace('_', ' '))}</span></div>`)
      .join('')}</div>${quotes.map(quote).join('')}${banner ? `<div class="banner" style="margin:auto 0 30px">${banner}</div>` : ''}</div>`);
  },

  // The output of `fx results`, laid out as a table so it can be read at video size.
  // Every cell is taken from the real output file; nothing is recomputed here.
  verdict: ({ heading, file, banner }) => {
    const lines = text(file).split('\n').filter(Boolean);
    const tidy = (arm) => {
      const mean = arm.match(/n=(\d+) mean ([\d.]+)/);
      if (mean) return `${Number(mean[2]).toLocaleString('en-US', { maximumFractionDigits: Number(mean[2]) < 100 ? 1 : 0 })}<small>mean of ${mean[1]}</small>`;
      const rate = arm.match(/(\d+\/\d+) ([\d.]+%)/);
      return rate ? `${rate[1]}<small>${rate[2]}</small>` : esc(arm);
    };
    const rows = lines
      .filter((l) => /  control /.test(l))
      .map((l) => {
        const [name, control, variation, lift = '', chance = '', verdict = ''] = l.split(/\s{2,}/);
        const tone = /BREACHED|LOSING/.test(verdict) ? 'red' : /ok|WINNING/.test(verdict) ? 'teal' : 'orange';
        return `<tr><th>${esc(name.replace(' (primary)', ''))}${/\(primary\)/.test(name) ? '<small>primary</small>' : ''}</th>
          <td>${tidy(control.replace(/^control /, ''))}</td><td>${tidy(variation.replace(/^\S+ /, ''))}</td>
          <td>${esc(lift.replace(/^lift /, ''))}</td><td>${esc(chance.replace(/^chance /, ''))}</td>
          <td><span class="chip ${tone}">${esc(verdict.toLowerCase())}</span></td></tr>`;
      })
      .join('');
    const ratio = lines.find((l) => l.startsWith('sample ratio:')) ?? '';
    return page(`<div class="pad"><h2>${esc(heading)}</h2><table class="verdict">
      <thead><tr><th></th><th>classic</th><th>accessible</th><th>lift, 95% interval</th><th>chance to beat control</th><th>verdict</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="ratio">${esc(ratio)}</div>${banner ? `<div class="banner" style="margin-top:auto">${banner}</div>` : ''}</div>`);
  },

  stats: ({ heading, items, quotes = [], foot, banner }) =>
    page(`<div class="pad"><h2>${esc(heading)}</h2><div class="stat">${items
      .map((i) => `<div><div class="k">${esc(i.label)}</div><div class="v" style="color:${i.colour || '#3a2a1f'}">${esc(i.value)}</div><div class="n">${esc(i.note || '')}</div></div>`)
      .join('')}</div>${quotes
      .map((q) => `<div class="quote"><span class="chip ${q.tone || ''}">${esc(q.who)}</span>${q.code ? `<code>${esc(q.code)}</code>` : `<span>&ldquo;${esc(q.text)}&rdquo;</span>`}</div>`)
      .join('')}${foot ? `<div class="foot" style="margin-top:26px">${esc(foot)}</div>` : ''}${banner ? `<div class="banner" style="margin:auto 0 30px">${banner}</div>` : ''}</div>`),

  guestFrame: ({ image, box, who, tone, thought, saw, sawTone }) =>
    page(`<div class="shot"><img src="${fileUrl(image)}">${
      box ? `<div class="ring" style="left:${box.x * 1.5 - 10}px;top:${box.y * 1.5 - 10}px;width:${box.width * 1.5 + 20}px;height:${box.height * 1.5 + 20}px"></div>` : ''
    }<div class="bar"><span class="chip who ${tone}">${esc(who)}</span><span class="think">${esc(thought || '')}</span>${
      saw ? `<span class="saw ${sawTone}">${esc(saw)}</span>` : ''
    }</div></div>`),
};

// ---- rendering --------------------------------------------------------------

const browser = await chromium.launch();
const stage = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'reduce' })).newPage();
// Live pages are captured at 1280x720 CSS pixels scaled 1.5x, so their text is large enough to read.
const liveContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });

// Live scenes may point at the local Flagsmith dashboard. URLs can use
// {flagsmith}, {project}, {staging} and {production}, filled in from the
// state written by scripts/bootstrap.mjs.
const flagsmith = existsSync(join(ROOT, '.flagsmith', 'state.json')) ? JSON.parse(text('.flagsmith/state.json')) : null;
const fillUrl = (url) =>
  url
    .replaceAll('{flagsmith}', flagsmith?.apiUrl ?? '')
    .replaceAll('{project}', flagsmith?.project.id ?? '')
    .replaceAll('{staging}', flagsmith?.environments.staging.clientKey ?? '')
    .replaceAll('{production}', flagsmith?.environments.production.clientKey ?? '');
let loggedIn = false;
async function logInToFlagsmith() {
  if (loggedIn) return;
  const page = await liveContext.newPage();
  // The dashboard keeps connections open, so "network idle" never comes; wait for the form instead.
  await page.goto(`${flagsmith.apiUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=password]', { timeout: 30000 });
  await page.locator('input[name=email]').fill(flagsmith.admin.email);
  await page.locator('input[type=password]').fill(flagsmith.admin.password);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/organisation\//, { timeout: 30000 });
  await page.close();
  loggedIn = true;
}

async function renderCard(id, n, html) {
  const htmlFile = join(BUILD, 'html', `${id}-${n}.html`);
  writeFileSync(htmlFile, html);
  await stage.goto(`file://${htmlFile}`);
  await stage.evaluate(() => document.fonts.ready);
  const file = join(BUILD, 'frames', `${id}-${String(n).padStart(3, '0')}.png`);
  await stage.screenshot({ path: file });
  return file;
}

// Returns [{ file, weight }]: the frames of a scene and their relative screen time.
async function renderScene(scene) {
  const v = scene.visual;
  if (v.type === 'card') return [{ file: await renderCard(scene.id, 0, TEMPLATES[v.template](v.data)), weight: 1 }];
  // Several cards in a row, each with its share of the scene's time.
  if (v.type === 'cards') {
    const frames = [];
    for (const [i, card] of v.cards.entries()) frames.push({ file: await renderCard(scene.id, i, TEMPLATES[card.template](card.data)), weight: card.weight ?? 1 });
    return frames;
  }

  if (v.type === 'live') {
    if (v.login) await logInToFlagsmith();
    const live = await liveContext.newPage();
    const frames = [];
    for (const [i, shot] of v.shots.entries()) {
      if (shot.url) await live.goto(fillUrl(shot.url), { waitUntil: v.login ? 'domcontentloaded' : 'load' });
      for (const [action, a, b] of shot.do ?? []) {
        if (action === 'click') await live.click(a);
        else if (action === 'fill') await live.fill(a, b);
        else if (action === 'wait') await live.waitForTimeout(Number(a));
        else if (action === 'scroll') await live.evaluate((y) => window.scrollTo(0, y), Number(a));
        else if (action === 'waitFor') await live.waitForSelector(a, { timeout: 20000 });
      }
      await live.waitForTimeout(shot.settle ?? 400);
      const file = join(BUILD, 'frames', `${scene.id}-${String(i).padStart(3, '0')}.png`);
      await live.screenshot({ path: file });
      frames.push({ file, weight: shot.weight ?? 1 });
    }
    await live.close();
    return frames;
  }

  if (v.type === 'guest') {
    const run = JSON.parse(text(join(v.dir, 'frames.json')));
    const picked = run.frames.filter((_, i) => !v.pick || v.pick.includes(i));
    const frames = [];
    for (const [i, f] of picked.entries()) {
      // The line of the accessibility snapshot the guest chose, as it read it.
      const saw = f.target ? f.target.replace(/ \[ref=\w+\]/, '').replace(/ \[(cursor=pointer|active)\]/g, '') : null;
      // A semantic role (anything but "generic", or a labelled text box) counts as named.
      const named = saw && !/^generic\b/.test(saw) && !/^textbox$/.test(saw);
      const html = TEMPLATES.guestFrame({
        image: join(v.dir, f.file),
        box: f.box,
        who: v.who,
        tone: v.tone,
        thought: f.thought,
        saw: saw ? `${f.action} ${saw}${/^(generic|textbox)$/.test(saw) ? '   (no name)' : ''}` : null,
        sawTone: named ? 'good' : 'bad',
      });
      frames.push({ file: await renderCard(scene.id, i, html), weight: 1 });
    }
    return frames;
  }
  throw new Error(`scene ${scene.id}: unknown visual type "${v.type}"`);
}

const manifestFile = join(BUILD, 'manifest.json');
const manifest = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};

for (const scene of script.scenes) {
  if (only && !only.has(scene.id) && manifest[scene.id]) continue;
  manifest[scene.id] = { frames: await renderScene(scene) };
  console.log(`rendered ${scene.id}: ${manifest[scene.id].frames.length} frame(s)`);
}
await browser.close();
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
if (args.frames) process.exit(0);

// ---- narration --------------------------------------------------------------

for (const [i, scene] of script.scenes.entries()) {
  const audio = await speak(scene.say, {
    dir: join(BUILD, 'audio'),
    before: script.scenes[i - 1]?.say ?? '',
    after: script.scenes[i + 1]?.say ?? '',
  });
  manifest[scene.id].audio = audio.file;
  manifest[scene.id].seconds = audio.seconds;
}

// ---- assembly ---------------------------------------------------------------

// A sentence too long for one caption line is split at the comma or colon nearest its middle.
const MAX_CAPTION = 84;
function splitCaption(s) {
  if (s.length <= MAX_CAPTION) return [s];
  const cuts = [...s.matchAll(/[,:;] /g)].map((m) => m.index + 1).filter((i) => i >= 20 && s.length - i >= 20);
  if (!cuts.length) return [s];
  const cut = cuts.reduce((best, i) => (Math.abs(i - s.length / 2) < Math.abs(best - s.length / 2) ? i : best));
  return [...splitCaption(s.slice(0, cut).trim()), ...splitCaption(s.slice(cut).trim())];
}
const captionChunks = (say) =>
  say
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(splitCaption);

const ffmpeg = (argv) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['ignore', 'inherit', 'inherit'] });

let clock = 0;
const captions = [];
const segments = [];
for (const scene of script.scenes) {
  const m = manifest[scene.id];
  const total = LEAD + m.seconds + TAIL + (scene.hold ?? 0);

  // Frame list for ffmpeg's concat demuxer; the last file is repeated so its duration applies.
  const weightSum = m.frames.reduce((s, f) => s + f.weight, 0);
  const list = m.frames.map((f) => `file '${f.file}'\nduration ${((total * f.weight) / weightSum).toFixed(3)}`).join('\n') + `\nfile '${m.frames.at(-1).file}'\n`;
  const listFile = join(BUILD, 'segments', `${scene.id}.txt`);
  writeFileSync(listFile, list);

  const segment = join(BUILD, 'segments', `${scene.id}.mp4`);
  ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-i', m.audio,
    '-filter_complex',
    `[0:v]fps=${FPS},scale=${W}:${H},format=yuv420p,fade=t=in:st=0:d=0.2[v];[1:a]adelay=${Math.round(LEAD * 1000)}:all=1,apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', total.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2',
    segment,
  ]);
  segments.push(segment);

  // Captions: one sentence at a time, timed by its share of the characters.
  const chunks = captionChunks(scene.say);
  const chars = chunks.reduce((s, c) => s + c.length, 0);
  let t = clock + LEAD;
  for (const chunk of chunks) {
    const d = (m.seconds * chunk.length) / chars;
    captions.push({ start: t, end: t + d, text: chunk });
    t += d;
  }
  clock += total;
}

const stamp = (s) => {
  const ms = Math.round(s * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt = join(OUT, 'capybara-onsen.srt');
writeFileSync(srt, captions.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n'));

const joinList = join(BUILD, 'segments', 'all.txt');
writeFileSync(joinList, segments.map((s) => `file '${s}'`).join('\n') + '\n');
const joined = join(BUILD, 'joined.mp4');
ffmpeg(['-f', 'concat', '-safe', '0', '-i', joinList, '-c', 'copy', joined]);

// The narration comes out quiet. Bring the whole track to -16 LUFS, a usual level
// for online video: measure it first, then apply the measured correction.
const LOUDNESS = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', joined, '-af', `${LOUDNESS}:print_format=json`, '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
const heard = JSON.parse(probe.stderr.slice(probe.stderr.lastIndexOf('{')));
const loudness = `${LOUDNESS}:measured_I=${heard.input_i}:measured_TP=${heard.input_tp}:measured_LRA=${heard.input_lra}:measured_thresh=${heard.input_thresh}:offset=${heard.target_offset}`;

const final = join(OUT, 'capybara-onsen.mp4');
ffmpeg([
  '-i', joined,
  '-vf', `subtitles=${srt}:force_style='FontName=Inter,FontSize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H00141A24,BorderStyle=3,Outline=3,Shadow=0,MarginV=26,Alignment=2'`,
  '-af', loudness,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-movflags', '+faststart',
  final,
]);
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log(`\n${final}  ${clock.toFixed(1)} s, ${script.scenes.length} scenes`);
