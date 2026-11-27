#!/usr/bin/env bash
# One command: bring up self-hosted Flagsmith, the booking site and a complete
# experiment, in the Staging environment.
#
#   ./scripts/demo.sh            # 120 AI guests (enough for Flagsmith to compute results)
#   GUESTS=300 ./scripts/demo.sh
#
# What it does, in order:
#   1. docker compose up: Flagsmith 2.295 + PostgreSQL + task processor
#   2. scripts/bootstrap.mjs: admin, project, environments, warehouse, keys
#   3. start the booking site against Staging
#   4. fx setup -> rehearse with 2 guests -> fx check -> fx start
#   5. send the AI guests through the site
#   6. fx results
#
# Staging is treated as a sandbox, so this script runs the start gate
# unattended. It never ships: read the results and run `fx ship` or `fx stop`
# yourself.
#
# Needs: docker with compose v2, node >= 22, jq, the Flagsmith CLI v2
# (https://docs.flagsmith.com/integrating-with-flagsmith/CLI), and a .env with
# an OpenAI-compatible endpoint for the guests (see .env.example).

set -euo pipefail
cd "$(dirname "$0")/.."

GUESTS=${GUESTS:-120}
PORT=${PORT:-3000}
RUN_ID=${RUN_ID:-demo$(date +%m%d%H%M%S)}
FX=skills/flagsmith-experiment/scripts/fx

for tool in docker node jq flagsmith; do
  command -v "$tool" >/dev/null || { echo "demo: '$tool' is required" >&2; exit 1; }
done
[ -f .env ] || { echo "demo: copy .env.example to .env and fill it in first" >&2; exit 1; }
# Something already answering on the site's port would be mistaken for this run's site.
if curl -s -o /dev/null "http://localhost:$PORT/"; then
  echo "demo: port $PORT is already in use. Stop what is running there, or pick another: PORT=3100 $0" >&2
  exit 1
fi
[ -d node_modules ] || npm install --no-audit --no-fund

echo "==> 1/6 Flagsmith"
docker compose up -d --wait

echo "==> 2/6 bootstrap"
node scripts/bootstrap.mjs
# shellcheck disable=SC1091
source .flagsmith/flagsmith.env
FLAGSMITH_ENVIRONMENT=$(node -p "require('./.flagsmith/state.json').environments.staging.clientKey")
export FLAGSMITH_ENVIRONMENT
export FX_UNATTENDED_ENVS=$FLAGSMITH_ENVIRONMENT

echo "==> 3/6 booking site on http://localhost:$PORT"
mkdir -p data/logs
ONSEN_ENV=staging PORT=$PORT node app/server.mjs >data/logs/app-staging.log 2>&1 &
APP_PID=$!
trap 'kill $APP_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do
  curl -fs "http://localhost:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 0.5
done
if ! kill -0 "$APP_PID" 2>/dev/null || ! curl -fs "http://localhost:$PORT/healthz" | grep -q '"flagsmith":true'; then
  echo "demo: the booking site did not start, or cannot reach Flagsmith. Its log:" >&2
  tail -n 15 data/logs/app-staging.log >&2
  exit 1
fi

echo "==> 4/6 set up, rehearse, check, start"
$FX setup --flag booking_form
npm run --silent guests -- --env staging --base "http://localhost:$PORT" --n 2 --run-id "$RUN_ID-rehearsal" >"data/logs/$RUN_ID-rehearsal.log" 2>&1 ||
  { echo "demo: the rehearsal failed. Its log:" >&2; tail -n 15 "data/logs/$RUN_ID-rehearsal.log" >&2; exit 1; }
$FX check --flag booking_form
$FX start --flag booking_form --log data/logs/demo-approvals.log

echo "==> 5/6 $GUESTS AI guests (about 5 seconds each; log: data/logs/$RUN_ID.log)"
npm run --silent guests -- --env staging --base "http://localhost:$PORT" --n "$GUESTS" --run-id "$RUN_ID" >"data/logs/$RUN_ID.log" 2>&1 ||
  { echo "demo: the guest run failed. Its log:" >&2; tail -n 15 "data/logs/$RUN_ID.log" >&2; exit 1; }
tail -n 8 "data/logs/$RUN_ID.log"

echo "==> 6/6 results"
$FX results --flag booking_form
echo
echo "Dashboard: http://localhost:8000 (login in .flagsmith/state.json)"
echo "Decide:    $FX ship --flag booking_form --winner accessible --approved-by NAME"
echo "       or  $FX stop --flag booking_form"
