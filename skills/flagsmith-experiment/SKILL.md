---
name: flagsmith-experiment
description: Runs a complete A/B test on Flagsmith with the Flagsmith CLI, from a written plan through pre-launch checks, a human-approved start, results with a verdict, and rollout of the winner. Use when the user wants to test a change behind a feature flag, prove that a change works or does no harm, check on a running experiment, or ship or stop one.
compatibility: Requires bash, jq and the Flagsmith CLI v2+ (flagsmith), already authenticated and bound to a project. The Flagsmith environment needs a connected warehouse.
metadata:
  version: "1.2"
---

# Run a Flagsmith experiment

Everything goes through `fx`, which is `scripts/fx` in this skill's folder. Call it by its path **from the project's root**, for example `skills/flagsmith-experiment/scripts/fx check --flag my_flag`: the spec and the approvals log are written relative to the current directory. Its output is one fact per line, and most commands end with a `next:` line. Read the output; never ask for JSON.

Before the first command, run `flagsmith config`. It must show a project and an API URL. Then give every `fx` command the environment, either with `-e <key>` or `export FLAGSMITH_ENVIRONMENT=<key>`. That is the client-side environment key from `flagsmith environment list`, and it is not a secret.

## The job

1. **Plan.** Agree with the user on the flag, the control value, one variation, the metrics and the hypothesis. The first `--metric` is the primary one. A metric expected to `increase` or `decrease` is a goal; `not_increase` and `not_decrease` make it a guardrail. A do-no-harm test has a guardrail as its primary.

   ```bash
   fx setup --flag checkout_button --control checkout --variant buy_now \
     --metric "purchase:occurrence:up:increase:Purchases" \
     --metric "refund:occurrence:down:not_increase:Refunds" \
     --name "Buy now button" --hypothesis "Buy now gets more purchases than Checkout because ..."
   ```

   This writes `experiments/<flag>.json` and creates the flag, variation and metrics. Nothing users see changes. Commit the spec: it is the plan the user approves. To apply an existing spec to another environment, run `fx setup --flag <flag>` there with no other options; that never rewrites the spec.

2. **Instrument and rehearse.** The app must read the flag with the SDK's experiment call (`getExperimentFlag` or its equivalent) for an identified user, and track each metric's event with the same identifier. Send one real conversion through the app in this environment. Traffic sent before the start is stored but never counted in the results.

3. **Check.** `fx check --flag <flag>`. Fix every `FAIL` before going on. It catches what Flagsmith otherwise drops silently: no warehouse, a variation without a key, an event name that has never arrived.

4. **Stop and ask.** Show the user the spec and the check output, and wait for their answer. (Sandbox exception: see Safety rules.)

5. **Start.** `fx start --flag <flag> --approved-by "<their name>"`. It creates and starts the experiment back to back, then says whether both versions are being served. A `WARNING` there means only one is: stop and look. The rehearsal only exercised the control, so once traffic flows run `fx status --flag <flag>` and confirm exposures on both sides.

6. **Read.** When the traffic you planned has finished, run `fx results --flag <flag>`. Report the lines as they are:
   - One line per metric, the primary marked `(primary)`. `chance` is Flagsmith's chance that the variation beats the control on that metric.
   - A goal is `WINNING` at 95% or more, `LOSING` at 5% or less, otherwise `inconclusive`. A guardrail is `GUARDRAIL BREACHED` at 5% or less, otherwise `guardrail ok`.
   - `collecting data` or an `inconclusive` primary means wait for more traffic.
   - `lift +0% [+0%, +0%]` means every identity converted in both versions. The interval has no width there, so quote the counts instead.
   - `sample ratio:` must say `ok`. `MISMATCH` means assignment is broken and nothing above it can be trusted.
   - Check that the counts per version add up to the traffic that was sent. `as of` is when Flagsmith computed them, and it recomputes at most once every 5 minutes, for `results` and `status` alike.

   Save the output next to the spec as `experiments/<flag>.results.txt` before ending the experiment. It stays readable afterwards, but the saved copy is what the user approved.

7. **Stop and ask again,** with the results. Then `fx ship --flag <flag> --winner <key|control> --approved-by "<their name>"`.
   - Shipping the variation needs a `WINNING` goal primary or a `guardrail ok` guardrail primary, no breached guardrail, and an `ok` sample ratio. Otherwise `fx` refuses and records the attempt.
   - `--force` overrides the refusal. Use it only after the user has seen the specific problem and accepted it.
   - `--winner control` is always allowed. `fx stop` does the same thing without an approval.

8. **Clean up,** only after a variation has shipped for good: delete the losing code path, then retire the flag. Skip this after a stop or a rehearsal.

## Safety rules

- **Approvals.** Never pass `--approved-by` with a name the user did not give for this step.
- **Sandboxes.** If the environment key is listed in `FX_UNATTENDED_ENVS`, a person has marked it as a sandbox: omit `--approved-by` and `fx` records the action as unattended. Never use `--force` there. If results are still arriving, wait; once the planned traffic is in and `ship` refuses, run `fx stop` and report.
- **Stop is always allowed.** If anything looks wrong after the start, run `fx stop --flag <flag>`. It ends the experiment and puts everyone back on the control. Tell the user at once.
- **Secrets.** Never print or commit API keys, tokens or server-side SDK keys. The client-side environment key is public and appears in the log.
- **Record.** Starts, ships, refused ships and stops are appended to `experiments/approvals.tsv`, next to the spec (change it with `--log FILE`). Commit it with the spec.

`fx --help` lists every option. Why each step exists and what Flagsmith does underneath: [references/how-it-works.md](references/how-it-works.md). Read it only when a step fails in a way the output does not explain.
