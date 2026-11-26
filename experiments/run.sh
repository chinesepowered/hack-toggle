#!/usr/bin/env bash
# The registered production run, from the approved start to the results.
#
#   experiments/run.sh "<name of the person who approved the start>"
#
# It does exactly what HYPOTHESIS.md registers: 300 AI guests, seed 2026,
# one look at the results after every guest has finished. Each command's
# output is kept under experiments/results/log/ as evidence.
#
# Before running: Flagsmith is up, the site is running against Production on
# port 3001 (ONSEN_ENV=production PORT=3001 npm run app), and `fx check` passes.
# Shipping is a separate, separately approved step (see the README).

set -euo pipefail
cd "$(dirname "$0")/.."

APPROVER=${1:?usage: experiments/run.sh "<name of the person who approved the start>"}
RUN_ID=${RUN_ID:-prod1}
GUESTS=300
SEED=2026
BASE=${BASE:-http://localhost:3001}
FX=skills/flagsmith-experiment/scripts/fx
LOG=experiments/results/log
mkdir -p "$LOG" data/logs

# shellcheck disable=SC1091
source .flagsmith/flagsmith.env
FLAGSMITH_ENVIRONMENT=$(node -p "require('./.flagsmith/state.json').environments.production.clientKey")
export FLAGSMITH_ENVIRONMENT

echo "== pre-launch check"
$FX check --flag booking_form | tee "$LOG/1-check.txt"

echo "== start (approved by $APPROVER)"
$FX start --flag booking_form --approved-by "$APPROVER" --log experiments/experiment-approvals.log | tee "$LOG/2-start.txt"

echo "== $GUESTS AI guests (log: data/logs/$RUN_ID.log)"
npm run --silent guests -- --env production --base "$BASE" --n "$GUESTS" --seed "$SEED" --run-id "$RUN_ID" --concurrency 8 >"data/logs/$RUN_ID.log" 2>&1
tail -n 8 "data/logs/$RUN_ID.log" | tee "$LOG/3-guest-tally.txt"

echo "== results (the one registered look)"
$FX status --flag booking_form | tee "$LOG/4-status.txt"
$FX results --flag booking_form | tee "$LOG/5-results.txt"

echo "== evidence"
node scripts/report.mjs --run "$RUN_ID" --env production
