---
name: flagsmith-experiment
description: Runs a complete A/B test on Flagsmith with the Flagsmith CLI, from a written plan through pre-launch checks, a human-approved start, results with a verdict, and rollout of the winner. Use when the user wants to test a change behind a feature flag, prove that a change works, check on a running experiment, or ship or stop one.
compatibility: Requires the Flagsmith CLI v2+ (flagsmith), jq and bash. The Flagsmith environment needs a connected warehouse.
allowed-tools: Bash(flagsmith:*) Bash(jq:*) Bash(git:*) Read
metadata:
  version: "1.0"
---

# Run a Flagsmith experiment

Everything goes through `scripts/fx`, which wraps the Flagsmith CLI. Its output is one fact per line; read it, do not ask for JSON. Set the environment once:

```bash
export FLAGSMITH_ENVIRONMENT=<client-side environment key>   # flagsmith environment list
```

## The job

1. **Plan.** Agree with the user on the flag, the control value, one variation, the metrics and the hypothesis. The first metric is the primary one. Use `not_increase` / `not_decrease` for guardrails.

   ```bash
   scripts/fx setup --flag checkout_button --control checkout --variant buy_now \
     --metric "purchase:occurrence:up:increase:Purchases" \
     --metric "refund:occurrence:down:not_increase:Refunds" \
     --name "Buy now button" --hypothesis "Buy now gets more purchases than Checkout because ..."
   ```

   This writes `experiments/<flag>.json` and creates the flag, variation and metrics. It changes nothing users see. Commit the spec: it is the plan the user approves.

2. **Instrument and rehearse.** The app must read the flag with the SDK's experiment call (`getExperimentFlag` or the equivalent) for an identified user, and track each metric's event with the same identifier. Send one real conversion through the app in this environment.

3. **Check.** `scripts/fx check --flag <flag>`. Fix every `FAIL` before going on. It catches what Flagsmith otherwise drops silently: no warehouse, a variation without a key, an event name that has never arrived.

4. **Stop and ask.** Show the user the spec and the check output. Do not start without their answer.

5. **Start.** `scripts/fx start --flag <flag> --approved-by "<their name>"`. It creates and starts the experiment back to back and confirms the split is live.

6. **Read.** `scripts/fx results --flag <flag>` (refreshes at most once every 5 minutes). Each metric ends in `WINNING`, `LOSING`, `inconclusive`, `guardrail ok` or `GUARDRAIL BREACHED`. Report those lines as they are. If a metric says `collecting data` or the primary is `inconclusive`, the answer is to wait.

7. **Stop and ask again,** with the results. Then `scripts/fx ship --flag <flag> --winner <key|control> --approved-by "<their name>"`. It refuses an inconclusive primary metric, a breached guardrail or a sample ratio mismatch unless the user has accepted that and you pass `--force`.

8. **Clean up.** Delete the losing code path, then retire the flag.

## Safety rules

- Never pass `--approved-by` with a name the user did not give for this step. The only exception is an environment the user has listed in `FX_UNATTENDED_ENVS`, where you may run the whole loop alone (a staging rehearsal).
- If anything looks wrong after the start, run `scripts/fx stop --flag <flag>`. It ends the experiment and puts everyone back on the control. It needs no approval; tell the user at once.
- `fx` never prints keys. Do not print or commit them either.
- Approvals and stops are appended to `./experiment-approvals.log`. Commit it with the spec.

## Other commands

`scripts/fx status --flag <flag>` gives the state and exposures in one line. `scripts/fx --help` lists every option. To run the same spec in another environment, change `FLAGSMITH_ENVIRONMENT` and run `scripts/fx setup --flag <flag>` with no other options.

Why each step exists, and what Flagsmith does underneath: [references/how-it-works.md](references/how-it-works.md). Read it only when a step fails in a way the output does not explain.
