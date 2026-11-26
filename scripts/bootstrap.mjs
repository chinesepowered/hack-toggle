#!/usr/bin/env node
// One-time setup of the self-hosted Flagsmith instance started by docker compose.
//
// Creates (or reuses) an admin account, an organisation, a project and two
// environments (Staging and Production), connects each environment to the
// "Flagsmith database" warehouse so it can store experiment events, and issues
// the keys the app and the Flagsmith CLI need.
//
// Nothing about the experiment itself is created here. The flag, metrics and
// experiment are created through the Flagsmith CLI by skills/run-experiment.
//
// Output (both git-ignored):
//   .flagsmith/flagsmith.env   credentials to `source` before using the CLI
//   .flagsmith/state.json      ids and keys for the app and scripts

import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_DIR = join(ROOT, '.flagsmith');
const STATE_FILE = join(STATE_DIR, 'state.json');
const ENV_FILE = join(STATE_DIR, 'flagsmith.env');

const BASE = (process.env.FLAGSMITH_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const ORG_NAME = 'Capybara Onsen';
const PROJECT_NAME = 'capy-onsen';
const ENVIRONMENTS = ['Staging', 'Production'];

let token = null;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data)}`);
  }
  return data;
}

const list = (data) => (Array.isArray(data) ? data : data?.results ?? []);

async function main() {
  const previous = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : null;

  const version = await api('GET', '/version/');
  if (!version.experimentation_enabled) {
    throw new Error('This Flagsmith instance reports experimentation_enabled=false. Set EXPERIMENTATION_ENABLED=true on the API.');
  }
  console.log(`Flagsmith ${version.image_tag} at ${BASE}, experimentation enabled`);

  // 1. Admin account. The first user may make itself a superuser; after that we log in.
  let admin = previous?.admin;
  if (!version.self_hosted_data?.has_users) {
    admin = { email: 'admin@example.com', password: randomBytes(18).toString('base64url') };
    const created = await api('POST', '/api/v1/auth/users/', {
      email: admin.email,
      password: admin.password,
      re_password: admin.password,
      first_name: 'Onsen',
      last_name: 'Admin',
      superuser: true,
    });
    token = created.key;
    console.log(`Created admin account ${admin.email}`);
  } else {
    if (!admin) {
      throw new Error(`The instance already has users but ${STATE_FILE} is missing, so the admin login is unknown. Reset with: docker compose down -v`);
    }
    token = (await api('POST', '/api/v1/auth/login/', { email: admin.email, password: admin.password })).key;
    console.log(`Logged in as ${admin.email}`);
  }

  // 2. Organisation, project, environments. Reuse by name so reruns are safe.
  let org = list(await api('GET', '/api/v1/organisations/')).find((o) => o.name === ORG_NAME);
  org ??= await api('POST', '/api/v1/organisations/', { name: ORG_NAME });

  let project = list(await api('GET', `/api/v1/projects/?organisation=${org.id}`)).find((p) => p.name === PROJECT_NAME);
  project ??= await api('POST', '/api/v1/projects/', { name: PROJECT_NAME, organisation: org.id });

  const existingEnvs = list(await api('GET', `/api/v1/environments/?project=${project.id}`));
  const environments = {};
  for (const name of ENVIRONMENTS) {
    let env = existingEnvs.find((e) => e.name === name);
    env ??= await api('POST', '/api/v1/environments/', { name, project: project.id });

    // 3. Warehouse: store experiment events in Flagsmith's own PostgreSQL.
    const connections = list(await api('GET', `/api/v1/environments/${env.api_key}/warehouse-connections/`));
    const connection =
      connections[0] ??
      (await api('POST', `/api/v1/environments/${env.api_key}/warehouse-connections/`, {
        warehouse_type: 'postgres',
        config: { source: 'flagsmith_database' },
      }));
    if (connection.status !== 'connected') {
      throw new Error(`Warehouse for ${name} is "${connection.status}", expected "connected": ${JSON.stringify(connection)}`);
    }

    // 4. A server-side SDK key for the booking app.
    const reuse = previous?.environments?.[name.toLowerCase()];
    const serverKey =
      reuse?.serverKey ??
      (await api('POST', `/api/v1/environments/${env.api_key}/api-keys/`, { name: 'capy-onsen app' })).key;

    environments[name.toLowerCase()] = { id: env.id, name, clientKey: env.api_key, serverKey };
    console.log(`Environment ${name}: key ${env.api_key}, warehouse connected`);
  }

  // 5. An organisation API key for the Flagsmith CLI. The key is only shown once.
  let cliKey = previous?.cliKey;
  if (!cliKey) {
    cliKey = (await api('POST', `/api/v1/organisations/${org.id}/master-api-keys/`, { name: 'Flagsmith CLI', is_admin: true })).key;
    console.log('Created an organisation API key for the CLI');
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const state = {
    apiUrl: BASE,
    eventsUrl: `${BASE}/api/`,
    admin,
    organisation: { id: org.id, name: org.name },
    project: { id: project.id, name: project.name },
    environments,
    cliKey,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  chmodSync(STATE_FILE, 0o600);

  // Against a self-hosted instance the CLI reads a key scoped to the API host.
  const hostKey = new URL(BASE).host.replace(/-/g, '__').replace(/[.:]/g, '_');
  writeFileSync(
    ENV_FILE,
    [
      '# Flagsmith CLI credentials for the local instance. Git-ignored; do not commit.',
      `export FLAGSMITH_API_URL=${BASE}`,
      `export FLAGSMITH_API_KEY_${hostKey}=${cliKey}`,
      `export FLAGSMITH_PROJECT=${project.id}`,
      '',
    ].join('\n'),
  );
  chmodSync(ENV_FILE, 0o600);

  console.log(`\nDashboard: ${BASE}  (login ${admin.email}, password in .flagsmith/state.json)`);
  console.log('CLI:       source .flagsmith/flagsmith.env && flagsmith project list');
}

main().catch((err) => {
  console.error(`bootstrap failed: ${err.message}`);
  process.exit(1);
});
