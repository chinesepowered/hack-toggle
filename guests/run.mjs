#!/usr/bin/env node
// Send a population of AI guests to the booking site, then audit what they
// booked and report the outcome metrics to Flagsmith.
//
//   node guests/run.mjs --env staging --n 20 --run-id pilot1
//
// Options:
//   --env <name>          Flagsmith environment the site is running against (staging | production)
//   --n <count>           number of guests
//   --run-id <id>         prefix for guest identities; use a new one for every run
//   --base <url>          site URL (default http://localhost:3000)
//   --seed <int>          seed for the booking briefs (default 1)
//   --start <index>       first guest index (default 0), to extend an earlier run
//   --concurrency <n>     guests browsing at once (default 6)
//   --max-steps <n>       model turns allowed per guest (default 40)
//   --temperature <t>     sampling temperature (default 0.7)
//   --today <YYYY-MM-DD>  the site's "today"; must match the site's ONSEN_TODAY
//   --no-events           do not send audit events to Flagsmith
//
// Events sent after the audit, per guest that reached the booking form:
//   guest_steps      value = browser actions the guest took
//   guest_tokens     value = model tokens the guest used (prompt + completion)
//   booking_correct  sent when the guest made exactly one booking matching its brief
// (booking_completed is sent by the site itself when a booking is stored.)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { Flagsmith } from '@flagsmith/nodejs';
import { toISO } from '../app/shared/catalog.js';
import { ROOT, flagsmithState, loadDotEnv, parseArgs } from '../scripts/env.mjs';
import { auditGuest, briefText, makeBrief } from './briefs.mjs';
import { runGuest } from './guest.mjs';
import { llmConfig } from './llm.mjs';

loadDotEnv();
const args = parseArgs();
const envName = String(args.env || 'staging').toLowerCase();
const n = Number(args.n || 10);
const runId = String(args['run-id'] || `run${Date.now().toString(36)}`);
const base = String(args.base || 'http://localhost:3000').replace(/\/$/, '');
const seed = Number(args.seed || 1);
const start = Number(args.start || 0);
const concurrency = Number(args.concurrency || 6);
const maxSteps = Number(args['max-steps'] || 40);
const temperature = Number(args.temperature ?? 0.7);
const today = String(args.today || process.env.ONSEN_TODAY || toISO(new Date()));
const sendEvents = !args['no-events'];

if (!/^[\w-]{1,40}$/.test(runId)) throw new Error('--run-id may contain only letters, digits, _ and -');

const llm = llmConfig();
const state = flagsmithState();
const environment = state.environments[envName];
if (!environment) throw new Error(`Unknown environment "${envName}"`);

const health = await fetch(`${base}/healthz`).then((r) => r.json()).catch(() => null);
if (!health?.ok) throw new Error(`The booking site is not answering at ${base}. Start it with: ONSEN_ENV=${envName} npm run app`);
if (health.env !== envName) throw new Error(`The site at ${base} runs against "${health.env}", not "${envName}".`);
// A guest served while Flagsmith is unreachable gets the control with no exposure,
// which would quietly corrupt a run. Refuse to start, and check again at the end.
if (!health.flagsmith) throw new Error('The booking site cannot reach Flagsmith, so no guest would be enrolled. Is Flagsmith running?');
const fallbacksBefore = health.flagFallbacks;

const dataDir = process.env.ONSEN_DATA_DIR || join(ROOT, 'data');
const runDir = join(dataDir, 'runs', runId);
mkdirSync(runDir, { recursive: true });

const briefs = Array.from({ length: n }, (_, i) => makeBrief({ runId, index: start + i, seed, today }));
console.log(`Run ${runId}: ${n} guests -> ${base} (${envName}), model ${llm.model}, ${concurrency} at a time`);

// ---- browse ----------------------------------------------------------------

const browser = await chromium.launch();
const records = [];
let next = 0;
let finished = 0;
async function worker() {
  while (next < briefs.length) {
    const brief = briefs[next++];
    const record = await runGuest({ browser, base, brief, task: briefText(brief), llm, maxSteps, temperature });
    records.push(record);
    writeFileSync(join(runDir, `${brief.guestId}.json`), JSON.stringify(record, null, 2));
    finished++;
    console.log(
      `[${String(finished).padStart(3)}/${n}] ${brief.guestId} ${String(record.variant ?? '-').padEnd(10)} ${record.outcome.padEnd(9)} ${String(record.actions).padStart(2)} actions`,
    );
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, n) }, worker));
await browser.close();

const healthAfter = await fetch(`${base}/healthz`).then((r) => r.json()).catch(() => null);
const fallbacks = (healthAfter?.flagFallbacks ?? Infinity) - fallbacksBefore;
if (fallbacks !== 0) {
  console.error(`\nINVALID RUN: ${fallbacks} visitor(s) were served the control because Flagsmith was unreachable. No audit events were sent. Discard run ${runId}.`);
  process.exit(2);
}

// ---- audit -----------------------------------------------------------------

const bookingsFile = join(dataDir, `bookings-${envName}.jsonl`);
const allBookings = existsSync(bookingsFile)
  ? readFileSync(bookingsFile, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  : [];
const byGuest = new Map();
for (const b of allBookings) byGuest.set(b.guestId, [...(byGuest.get(b.guestId) ?? []), b]);

const flagsmith = sendEvents
  ? new Flagsmith({
      environmentKey: environment.serverKey,
      apiUrl: `${state.apiUrl}/api/v1/`,
      enableEvents: true,
      eventProcessorConfig: { eventsApiUrl: state.eventsUrl },
    })
  : null;

const tally = {};
for (const record of records) {
  const audit = auditGuest(record.brief, byGuest.get(record.guestId) ?? []);
  record.audit = audit;
  writeFileSync(join(runDir, `${record.guestId}.json`), JSON.stringify(record, null, 2));

  const key = record.variant ?? 'never reached the form';
  const t = (tally[key] ??= { guests: 0, completed: 0, correct: 0, actions: 0, promptTokens: 0, completionTokens: 0, problems: {} });
  t.guests++;
  t.completed += audit.completed ? 1 : 0;
  t.correct += audit.correct ? 1 : 0;
  t.actions += record.actions;
  t.promptTokens += record.tokens.prompt;
  t.completionTokens += record.tokens.completion;
  for (const p of audit.problems) t.problems[p] = (t.problems[p] ?? 0) + 1;

  // Only guests who saw the form are in the experiment; the rest have no exposure to join to.
  if (flagsmith && record.variant) {
    flagsmith.trackEvent('guest_steps', { identifier: record.guestId, value: record.actions });
    flagsmith.trackEvent('guest_tokens', { identifier: record.guestId, value: record.tokens.prompt + record.tokens.completion });
    if (audit.correct) flagsmith.trackEvent('booking_correct', { identifier: record.guestId });
  }
}
if (flagsmith) {
  await flagsmith.flushEvents();
  await flagsmith.close();
}

// ---- summary ---------------------------------------------------------------

const summary = {
  runId,
  env: envName,
  model: llm.model,
  seed,
  start,
  n,
  today,
  maxSteps,
  temperature,
  finishedAt: new Date().toISOString(),
  byVersion: Object.fromEntries(
    Object.entries(tally).map(([version, t]) => [
      version,
      {
        guests: t.guests,
        completed: t.completed,
        correct: t.correct,
        completedRate: +(t.completed / t.guests).toFixed(4),
        correctRate: +(t.correct / t.guests).toFixed(4),
        meanActions: +(t.actions / t.guests).toFixed(2),
        meanTokens: Math.round((t.promptTokens + t.completionTokens) / t.guests),
        problems: t.problems,
      },
    ]),
  ),
};
writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('\nHarness tally (a cross-check; Flagsmith computes the experiment result):');
console.table(
  Object.fromEntries(
    Object.entries(summary.byVersion).map(([version, s]) => [
      version,
      { guests: s.guests, completed: s.completed, correct: s.correct, 'completed %': (s.completedRate * 100).toFixed(1), 'correct %': (s.correctRate * 100).toFixed(1), 'mean actions': s.meanActions, 'mean tokens': s.meanTokens },
    ]),
  ),
);
console.log(`Transcripts: ${runDir}`);
