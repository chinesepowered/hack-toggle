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
# Needs: docker with compose v2, node >= 22, jq, curl, the Flagsmith CLI v2
# (https://docs.flagsmith.com/integrating-with-flagsmith/CLI), and a .env with
# an OpenAI-compatible endpoint for the guests (see .env.example). The first run
# also downloads Playwright's Chromium, which the guests drive.

set -euo pipefail
cd "$(dirname "$0")/.."

GUESTS=${GUESTS:-120}
PORT=${PORT:-3000}
RUN_ID=${RUN_ID:-demo$(date +%m%d%H%M%S)}
FX=skills/flagsmith-experiment/scripts/fx
stop() { echo "demo: $*" >&2; exit 1; }

for tool in docker node jq curl flagsmith; do
  command -v "$tool" >/dev/null || stop "'$tool' is required"
done
# The current CLI prints "flagsmith version v2.0.0". The older npm package of the same name does not.
CLI_VERSION=$(flagsmith --version 2>&1) || true
[[ $CLI_VERSION =~ ^flagsmith\ version\ v?([0-9]+)\. ]] && [ "${BASH_REMATCH[1]}" -ge 2 ] ||
  stop "the Flagsmith CLI must be v2 or later (found: ${CLI_VERSION%%$'\n'*})"
[ -f .env ] || stop "copy .env.example to .env and fill it in first"
# Something already answering on the site's port would be mistaken for this run's site.
if curl --noproxy '*' -s -o /dev/null "http://localhost:$PORT/"; then
  stop "port $PORT is already in use. Stop what is running there, or pick another: PORT=3100 $0"
fi
# Flagsmith's API and dashboard are published on port 8000.
if [ -z "$(docker compose ps -q flagsmith 2>/dev/null)" ] && curl --noproxy '*' -s -o /dev/null "http://localhost:8000/"; then
  stop "port 8000 is already in use by something other than this project's Flagsmith. Stop it first."
fi
[ -d node_modules ] || npm install --no-audit --no-fund
# The guests drive Chromium through Playwright, which uses its own build of it.
if ! node -e "require('playwright').chromium.launch().then((b) => b.close())" 2>/dev/null; then
  echo "==> downloading Playwright's Chromium (once, about 170 MB)"
  npx playwright install chromium
fi

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
  curl --noproxy '*' -fs "http://localhost:$PORT/healthz" >/dev/null 2>&1 && break
  sleep 0.5
done
if ! kill -0 "$APP_PID" 2>/dev/null || [[ $(curl --noproxy '*' -fs "http://localhost:$PORT/healthz") != *'"flagsmith":true'* ]]; then
  echo "demo: the booking site did not start, or cannot reach Flagsmith. Its log:" >&2
  tail -n 15 data/logs/app-staging.log >&2
  exit 1
fi

echo "==> 4/6 set up, rehearse, check, start"
$FX setup --flag booking_form
# An earlier demo on this instance may have left the flag in a state that cannot be tested again.
EARLIER=$($FX status --flag booking_form) || stop "could not read the experiment's status from Flagsmith"
case $EARLIER in
  *status=completed*decision=variant*)
    stop "the accessible form has already been shipped on this instance, so there is no control left to test against. Start over: npm run flagsmith:reset" ;;
  *status=completed* | "no experiment"*) ;;
  *)
    stop "an experiment from an earlier run is still open here ($EARLIER). End it with: source .flagsmith/flagsmith.env && $FX stop --flag booking_form --log data/logs/demo-approvals.log. Or start over: npm run flagsmith:reset" ;;
esac
npm run --silent guests -- --env staging --base "http://localhost:$PORT" --n 2 --run-id "$RUN_ID-rehearsal" >"data/logs/$RUN_ID-rehearsal.log" 2>&1 ||
  { echo "demo: the rehearsal failed. Its log:" >&2; tail -n 15 "data/logs/$RUN_ID-rehearsal.log" >&2; exit 1; }
# The rehearsal's events can take a moment to reach the warehouse, so the check gets three tries.
CHECKED=0
for _ in 1 2 3; do
  if CHECK=$($FX check --flag booking_form 2>&1); then CHECKED=1; break; fi
  sleep 5
done
echo "$CHECK"
[ $CHECKED = 1 ] ||
  stop "the pre-launch check failed. If an event 'has never been received', the two rehearsal guests did not get that far: see data/logs/$RUN_ID-rehearsal.log. A weaker guest model may fail the booking itself."
$FX start --flag booking_form --log data/logs/demo-approvals.log

echo "==> 5/6 $GUESTS AI guests (about 5 seconds each; log: data/logs/$RUN_ID.log)"
npm run --silent guests -- --env staging --base "http://localhost:$PORT" --n "$GUESTS" --run-id "$RUN_ID" >"data/logs/$RUN_ID.log" 2>&1 ||
  { echo "demo: the guest run failed. Its log:" >&2; tail -n 15 "data/logs/$RUN_ID.log" >&2; exit 1; }
tail -n 8 "data/logs/$RUN_ID.log"

echo "==> 6/6 results"
$FX results --flag booking_form

cat <<EOF

Done in $((SECONDS / 60)) min $((SECONDS % 60)) s. Nothing has been shipped: the experiment is still running in Staging.
Dashboard: http://localhost:8000 (login in .flagsmith/state.json)
Site:      it stopped with this script. Start it again with: npm run app
Decide, in this terminal:
  source .flagsmith/flagsmith.env
  $FX stop --flag booking_form --log data/logs/demo-approvals.log
  $FX ship --flag booking_form --winner accessible --approved-by "Your name" --log data/logs/demo-approvals.log
       (ship is refused while a guardrail is breached; add --force only to accept that cost.
        --log keeps this demo out of the repository's own approvals record.)
Start over from nothing: npm run flagsmith:reset
EOF
