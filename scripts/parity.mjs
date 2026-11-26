#!/usr/bin/env node
// Pre-launch check: the two versions of the booking form must look the same.
//
// Opens /preview/classic and /preview/accessible, drives both through the same
// clicks, and compares full-page screenshots pixel by pixel at several stages.
// It also saves what an AI agent "sees" for each version: Playwright's
// AI-mode accessibility snapshot, the same representation the guests use.
//
// Usage: node scripts/parity.mjs [--base http://localhost:3000] [--out docs/parity]
// Exits non-zero if any stage differs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const BASE = opt('--base', 'http://localhost:3000');
const OUT = opt('--out', 'docs/parity');
mkdirSync(OUT, { recursive: true });

// The same journey in both versions, addressed by the stable data-k keys that
// both versions carry. Each named stage is screenshotted and compared.
const JOURNEY = [
  { stage: '1-empty', steps: [] },
  {
    stage: '2-filled',
    steps: [
      ['click', '[data-k="cal-next"]'],
      ['click', '[data-k="day-2026-12-12"]'],
      ['clickFirstOpenSlot'],
      ['click', '[data-k="guests-plus"]'],
      ['click', '[data-k="bath-cedar"]'],
      ['click', '[data-k="addon-tea"]'],
      ['type', 'name', 'Mika Tanaka'],
      ['type', 'email', 'mika@example.com'],
      ['click', '[data-k="rules"]'],
      ['blur'],
    ],
  },
  { stage: '3-errors', steps: [['reload'], ['click', '[data-k="submit"]'], ['blur']] },
];

async function run(page, steps) {
  for (const [action, a, b] of steps) {
    if (action === 'click') await page.click(a);
    else if (action === 'clickFirstOpenSlot') await page.click('.slot:not(.is-off)');
    else if (action === 'type') await page.locator('.inp').nth(a === 'name' ? 0 : 1).fill(b);
    else if (action === 'reload') await page.reload();
    else if (action === 'blur') await page.evaluate(() => document.activeElement?.blur());
  }
  await page.mouse.move(0, 0);
  // The summary card is sticky, so compare both pages at the same scroll position.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
}

// Count differing pixels by drawing both PNGs onto canvases in a blank page.
async function diffPixels(page, pngA, pngB) {
  return page.evaluate(
    async ([a, b]) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height });
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
      };
      const [A, B] = [await load(a), await load(b)];
      if (A.w !== B.w || A.h !== B.h) return { sameSize: false, sizeA: `${A.w}x${A.h}`, sizeB: `${B.w}x${B.h}`, differing: -1 };
      let differing = 0;
      for (let i = 0; i < A.data.length; i += 4) {
        if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2] || A.data[i + 3] !== B.data[i + 3]) differing++;
      }
      return { sameSize: true, total: A.w * A.h, differing };
    },
    [pngA.toString('base64'), pngB.toString('base64')],
  );
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const pages = {};
for (const variant of ['classic', 'accessible']) {
  pages[variant] = await context.newPage();
  await pages[variant].goto(`${BASE}/preview/${variant}`);
}
const scratch = await context.newPage();

let failed = false;
for (const { stage, steps } of JOURNEY) {
  const shots = {};
  for (const variant of ['classic', 'accessible']) {
    const page = pages[variant];
    await run(page, steps);
    shots[variant] = await page.screenshot({ fullPage: true, animations: 'disabled' });
    writeFileSync(join(OUT, `${stage}-${variant}.png`), shots[variant]);
    writeFileSync(join(OUT, `${stage}-${variant}.aria.yml`), await page.locator('#app').ariaSnapshot({ mode: 'ai' }));
  }
  const result = await diffPixels(scratch, shots.classic, shots.accessible);
  const ok = result.sameSize && result.differing === 0;
  failed ||= !ok;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${stage}: ` +
      (result.sameSize ? `${result.differing} of ${result.total} pixels differ` : `sizes differ (${result.sizeA} vs ${result.sizeB})`),
  );
}

await browser.close();
console.log(failed ? '\nThe two versions do NOT look the same.' : '\nThe two versions are pixel-identical at every stage.');
process.exit(failed ? 1 : 0);
