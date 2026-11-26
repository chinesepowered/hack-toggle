#!/usr/bin/env node
// Record one AI guest making a booking, for the demo video: a screenshot before
// every action plus what the guest was thinking and which element it chose.
//
//   node video/record-guest.mjs --guest video_classic --out video/build/guest-classic
//
// The guest is a real run of the same harness the experiment uses. Which form
// version it gets is whatever Flagsmith serves that identity (for the video,
// an identity override in Staging pins each recorded guest to one version).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { briefText, makeBrief } from '../guests/briefs.mjs';
import { runGuest } from '../guests/guest.mjs';
import { llmConfig } from '../guests/llm.mjs';
import { loadDotEnv, parseArgs } from '../scripts/env.mjs';

loadDotEnv();
const args = parseArgs();
const guestId = String(args.guest || 'video_guest');
const out = String(args.out || `video/build/${guestId}`);
const base = String(args.base || 'http://localhost:3000');
mkdirSync(out, { recursive: true });

// The same brief for every recorded guest, so the two versions can be compared.
const brief = { ...makeBrief({ runId: 'video', index: Number(args.index || 3), seed: Number(args.seed || 5), today: process.env.ONSEN_TODAY }), guestId };

const frames = [];
const browser = await chromium.launch();
const record = await runGuest({
  browser,
  base,
  brief,
  task: briefText(brief),
  llm: llmConfig(),
  temperature: 0.2,
  // 1280x720 CSS pixels at 1.5x gives 1920x1080 screenshots. Boxes stay in CSS pixels.
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
  recorder: async ({ page, n, action, text, thought, target, box }) => {
    const file = `${String(frames.length).padStart(3, '0')}.png`;
    await page.screenshot({ path: join(out, file) });
    frames.push({ file, n, action, text, thought, target, box, url: page.url() });
  },
});
await browser.close();

writeFileSync(join(out, 'frames.json'), JSON.stringify({ brief, task: briefText(brief), variant: record.variant, outcome: record.outcome, tokens: record.tokens, frames }, null, 2));
console.log(`${guestId}: ${record.variant} ${record.outcome}, ${frames.length} frames in ${out}`);
