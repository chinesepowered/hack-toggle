#!/usr/bin/env node
// Capybara Onsen booking site.
//
// The booking form has two versions that look the same on screen:
//   classic     built from generic <div>s, like many hand-rolled UIs
//   accessible  the same design with semantic HTML, labels and ARIA state
// Which one a visitor gets is decided by the Flagsmith multivariate flag
// `booking_form`. Reading it through getExperimentFlag() also records the
// exposure for the running experiment; a stored booking sends the
// `booking_completed` conversion event.

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Flagsmith } from '@flagsmith/nodejs';
import { priceOf, toISO, validateBooking } from './shared/catalog.js';
import { bookingPage, confirmationPage, landingPage, notFoundPage } from './views.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

export const FLAG = 'booking_form';
export const VARIANTS = ['classic', 'accessible'];
const CONTROL = 'classic';

// ---- configuration -------------------------------------------------------

function loadConfig() {
  const envName = (process.env.ONSEN_ENV || 'staging').toLowerCase();
  const stateFile = join(ROOT, '.flagsmith', 'state.json');
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null;
  const apiUrl = (process.env.FLAGSMITH_API_URL || state?.apiUrl || 'http://localhost:8000').replace(/\/$/, '');
  const environmentKey = process.env.FLAGSMITH_ENVIRONMENT_KEY || state?.environments?.[envName]?.serverKey;
  if (!environmentKey) {
    throw new Error(`No Flagsmith key for environment "${envName}". Run "npm run bootstrap" or set FLAGSMITH_ENVIRONMENT_KEY.`);
  }
  return {
    envName,
    port: Number(process.env.PORT || 3000),
    apiUrl,
    environmentKey,
    // Fix "today" (YYYY-MM-DD) so a rerun sees the same calendar. Defaults to the real date.
    today: () => process.env.ONSEN_TODAY || toISO(new Date()),
  };
}

const config = loadConfig();

const flagsmith = new Flagsmith({
  environmentKey: config.environmentKey,
  apiUrl: `${config.apiUrl}/api/v1/`,
  enableEvents: true,
  // Self-hosted with the "Flagsmith database" warehouse: the API itself receives events.
  eventProcessorConfig: { eventsApiUrl: `${config.apiUrl}/api/`, flushInterval: 2000 },
});

// ---- bookings store ------------------------------------------------------
// An append-only JSON-lines file is enough here and easy to audit by hand.

const DATA_DIR = process.env.ONSEN_DATA_DIR || join(ROOT, 'data');
mkdirSync(DATA_DIR, { recursive: true });
const BOOKINGS_FILE = join(DATA_DIR, `bookings-${config.envName}.jsonl`);
const bookings = new Map();
if (existsSync(BOOKINGS_FILE)) {
  for (const line of readFileSync(BOOKINGS_FILE, 'utf8').split('\n')) {
    if (line.trim()) {
      const b = JSON.parse(line);
      bookings.set(b.id, b);
    }
  }
}

// ---- helpers --------------------------------------------------------------

const servedVariant = new Map(); // guest id -> variant they were shown

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((c) => c.trim().split('='))
      .filter(([k, v]) => k && v)
      .map(([k, v]) => [k, decodeURIComponent(v)]),
  );
}

// Every visitor needs a stable identity: exposures and conversions are joined on it.
// A link may carry ?guest=<id> (how an AI guest, or a tracked invite, arrives);
// otherwise the visitor gets an anonymous id in a cookie.
function identify(req, res, next) {
  const fromLink = typeof req.query.guest === 'string' && /^[\w.-]{1,64}$/.test(req.query.guest) ? req.query.guest : null;
  const fromCookie = parseCookies(req.headers.cookie).guest;
  req.guestId = fromLink || fromCookie || `anon_${randomUUID()}`;
  if (req.guestId !== fromCookie) {
    res.setHeader('Set-Cookie', `guest=${encodeURIComponent(req.guestId)}; Path=/; HttpOnly; SameSite=Lax`);
  }
  next();
}

async function variantFor(guestId) {
  try {
    // Evaluates the flag for this identity and records the experiment exposure.
    const flag = await flagsmith.getExperimentFlag(FLAG, guestId);
    const value = VARIANTS.includes(flag.value) ? flag.value : CONTROL;
    servedVariant.set(guestId, value);
    return value;
  } catch (err) {
    // If Flagsmith is unreachable the site still works, on the control version.
    console.error(`flag evaluation failed for ${guestId}: ${err.message}`);
    return CONTROL;
  }
}

// ---- routes ---------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use('/static', express.static(join(HERE, 'public')));
app.use('/shared', express.static(join(HERE, 'shared')));

app.get('/healthz', (_req, res) => res.json({ ok: true, env: config.envName }));

app.get('/', identify, (_req, res) => res.send(landingPage()));

app.get('/book', identify, async (req, res) => {
  const variant = await variantFor(req.guestId);
  res.send(bookingPage({ variant, today: config.today(), preview: false }));
});

// Fixed-variant preview for screenshots and QA. No identity, no exposure, and
// the form cannot be submitted, so it can never affect the experiment.
app.get('/preview/:variant', (req, res) => {
  if (!VARIANTS.includes(req.params.variant)) return res.status(404).send(notFoundPage());
  res.send(bookingPage({ variant: req.params.variant, today: config.today(), preview: true }));
});

app.post('/api/bookings', identify, (req, res) => {
  const body = req.body ?? {};
  const candidate = {
    date: body.date,
    slot: body.slot,
    guests: body.guests,
    bath: body.bath,
    addons: body.addons,
    name: typeof body.name === 'string' ? body.name : '',
    email: typeof body.email === 'string' ? body.email : '',
    rules: body.rules,
  };
  const errors = validateBooking(candidate, config.today());
  if (Object.keys(errors).length) return res.status(422).json({ errors });

  const booking = {
    id: `CAPY-${randomUUID().slice(0, 8).toUpperCase()}`,
    guestId: req.guestId,
    variant: servedVariant.get(req.guestId) ?? null,
    date: candidate.date,
    slot: candidate.slot,
    guests: candidate.guests,
    bath: candidate.bath,
    addons: [...candidate.addons].sort(),
    name: candidate.name.trim(),
    email: candidate.email.trim(),
    total: priceOf(candidate),
    createdAt: new Date().toISOString(),
  };
  bookings.set(booking.id, booking);
  appendFileSync(BOOKINGS_FILE, JSON.stringify(booking) + '\n');

  // The conversion event. Its name must match the metric's event exactly.
  flagsmith.trackEvent('booking_completed', { identifier: req.guestId, value: booking.total });

  res.status(201).json({ id: booking.id });
});

app.get('/confirmation/:id', (req, res) => {
  const booking = bookings.get(req.params.id);
  if (!booking) return res.status(404).send(notFoundPage());
  res.send(confirmationPage(booking));
});

app.use((_req, res) => res.status(404).send(notFoundPage()));

// ---- lifecycle ------------------------------------------------------------

const server = app.listen(config.port, () => {
  console.log(`Capybara Onsen (${config.envName}) on http://localhost:${config.port}  flags: ${config.apiUrl}`);
});

async function shutdown() {
  server.close();
  // Send any events still buffered before the process exits.
  await flagsmith.close().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
