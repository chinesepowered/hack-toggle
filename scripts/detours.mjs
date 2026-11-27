#!/usr/bin/env node
// What the guests of a run did beyond what their briefs needed.
//
//   node scripts/detours.mjs <run dir>...           one line per run and version
//   node scripts/detours.mjs <run dir> --csv FILE   also list every guest that used extra actions
//
// A run directory holds one transcript per guest plus summary.json, as written
// by guests/run.mjs under data/runs/, or as unpacked from the archives in
// experiments/results and experiments/other-runs:
//
//   tar -xzf experiments/results/transcripts-all.tar.gz -C /tmp
//   node scripts/detours.mjs /tmp/prod1
//
// "Needed" is the fewest clicks and fills that can complete a guest's brief
// (minimumActions in guests/briefs.mjs). Everything a guest did beyond that is
// an extra action. Comparing extra actions, and not raw steps, takes the luck
// of which briefs each version happened to get out of the comparison.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SLOTS, isSoldOut } from '../app/shared/catalog.js';
import { minimumActions } from '../guests/briefs.mjs';

const argv = process.argv.slice(2);
const csvAt = argv.indexOf('--csv');
const csvFile = csvAt >= 0 ? argv[csvAt + 1] : null;
const dirs = argv.filter((a, i) => a !== '--csv' && (csvAt < 0 || i !== csvAt + 1));
if (!dirs.length) {
  console.error('usage: node scripts/detours.mjs <run dir>... [--csv FILE]');
  process.exit(1);
}

const slotByLabel = new Map(SLOTS.map((s) => [s.label, s.id]));
const quote = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
const detours = [];

for (const dir of dirs) {
  const { today } = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
  const versions = {};
  for (const file of readdirSync(dir).filter((f) => /_g\d+\.json$/.test(f)).sort()) {
    const g = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const needed = minimumActions(g.brief, today);
    const extra = g.actions - needed;
    const v = (versions[g.variant] ||= { guests: 0, correct: 0, needed: 0, extra: 0, withExtra: 0, tokens: 0, prompt: 0, turns: 0 });
    v.guests++;
    v.correct += g.audit.correct ? 1 : 0;
    v.needed += needed;
    v.extra += extra;
    v.withExtra += extra > 0 ? 1 : 0;
    v.tokens += g.tokens.prompt + g.tokens.completion;
    v.prompt += g.tokens.prompt;
    v.turns += g.turns;
    if (extra <= 0 && g.audit.correct) continue;

    const acts = g.steps.filter((s) => s.action === 'click' || s.action === 'fill');
    // A click on a time that is sold out on the brief's day does nothing.
    const onSoldOut = acts.filter((s) => {
      const label = (s.target || '').match(/(\d{1,2}:\d\d [AP]M)/)?.[1];
      return label && isSoldOut(g.brief.date, slotByLabel.get(label));
    });
    // The first wasted action: a click on a sold-out time, or else the first
    // action that repeats or undoes the one before it.
    const first = onSoldOut[0] ?? acts.find((s, i) => i > 0 && s.ref === acts[i - 1].ref) ?? acts[Math.max(acts.length - extra, 0)];
    detours.push({
      guest: g.guestId,
      version: g.variant,
      extra_actions: extra,
      clicks_on_sold_out_times: onSoldOut.length,
      other_extra_actions: extra - onSoldOut.length,
      preferred_time_sold_out: g.brief.preferredSlot !== g.brief.expectedSlot ? 1 : 0,
      correct: g.audit.correct ? 1 : 0,
      guest_note_after_the_first_wasted_action: g.steps.find((s) => s.n === first.n + 1)?.thought ?? first.thought,
    });
  }
  for (const [name, v] of Object.entries(versions).sort()) {
    const per = (x, digits = 2) => (x / v.guests).toFixed(digits);
    console.log(
      `${basename(dir)}  ${name.padEnd(10)}  guests ${v.guests}  correct ${v.correct}  needed ${per(v.needed)}  extra ${per(v.extra)}  ` +
        `guests with extra ${v.withExtra}  tokens ${per(v.tokens, 0)}  prompt per turn ${(v.prompt / v.turns).toFixed(0)}`,
    );
  }
}

if (csvFile) {
  const header = Object.keys(detours[0] ?? { guest: '' });
  writeFileSync(csvFile, [header.join(','), ...detours.map((d) => header.map((h) => quote(d[h])).join(','))].join('\n') + '\n');
  console.log(`${detours.length} guests listed in ${csvFile}`);
}
