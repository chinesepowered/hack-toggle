# Notes for the Flagsmith team

Things we ran into while building this on Experimentation, which is in beta. Each note says what we did, what we saw, and what we do about it. Versions: Flagsmith 2.295.2 (self-hosted with Docker, events in the Flagsmith database), CLI v2.0.0, `@flagsmith/nodejs` 9.5.0.

## 1. An experiment serves its variation as soon as it is created

**What we did.** Created an experiment through the API with the payload from [Set up an experiment with a coding agent](https://docs.flagsmith.com/experimentation/set-up-with-a-coding-agent), which has `"experiment_rollout": {"enabled": true, ...}`. We did not call `start`.

**What we saw.** The experiment's status was `created` and `started_at` was `null`, but fresh identities were already being split:

```
$ flagsmith evaluate booking_form --identity prestart-probe-1 --json
{ "enabled": true, "value": "classic", "reason": "TARGETING_MATCH; segment=experiment-2-rollout", "variant": "control" }
```

Of 12 fresh identities, 7 were served the variation. The same guide says "Don't start it yet: starting locks the flag and turns on the rollout", so we expected nothing to change before the start.

With `"enabled": false` the split still applies, but enrolled identities are served the flag as disabled until the start. For a flag that was on for everyone, that switches it off.

**What we do.** `fx` keeps the plan in a spec file and creates and starts the experiment back to back, after a person has approved. Its pre-launch check evaluates 20 probe identities and fails if any of them gets anything but the control.

## 2. The sample-ratio check does not run in the documented set-up

**What we saw.** `srm_p_value` in the results payload was `null` with 146 identities enrolled; the floor in the source is 100.

**Why, as far as we can tell.** `_expected_variant_shares` in `experimentation/services.py` reads the split from the flag's default allocation in the environment, and carries a TODO to read it from the experiment's rollout instead. The guide has the variation added with `--weight 0`, so its expected share is 0, and `srm_p_value` returns `None` whenever a share is not positive.

**What we do.** `fx results` computes the check itself, from the exposure counts and the experiment's configured split (chi-squared, one degree of freedom), and uses Flagsmith's value whenever one is returned.

## 3. A tie at 100% is announced as a winner

**What we saw.** In a Staging run both versions converted every identity on the primary metric (63 of 63 and 57 of 57). The results were lift +0.0%, interval [0.0%, 0.0%], chance 50%. The experiment page showed:

> **50% Winner Probability Confirmed.** accessible is outperforming Control by +0.0% with 50% probability of being the best variant. Consider rolling out accessible to all users.

and "Winning variation: accessible". The primary metric's expected direction was "should not decrease".

**Why it matters.** The interval comes from a normal approximation, which has no width when every identity converts. A reader sees a confirmed winner where the data says only that neither version failed in about 60 tries each. An exact interval for 57 of 57 has a lower bound of about 94%.

**What we do.** `fx results` prints the counts next to the interval, and the skill tells the agent to quote the counts when the interval is `[+0%, +0%]`. Our report adds exact bounds.

## 4. Guardrail metrics are hard to find in the dashboard

The experiment page's analysis showed the primary metric. We could not find the same analysis for the other three metrics on that page, although the results payload from the API has all four. `fx results` reads them from there, which is how we saw that the token guardrail was breached. If there is a view we missed, ignore this one.

## 5. Small things

- `flagsmith api -F` builds flat JSON only, so the metric and experiment bodies have to go through `--input -`.
- The two refresh endpoints return an empty body, so a script has to rely on the exit status to tell an accepted refresh from a throttled one.
- The CLI has no experiment commands yet. Everything about experiments goes through `flagsmith api`, and the MCP server cannot start one, so the CLI is currently the only way for an agent to run the whole loop.

## What worked well

- A complete self-hosted instance with Experimentation is three containers. From an empty database it was ready in about a minute and a half, and the Flagsmith database option means there is nothing else to run for a trial.
- `getExperimentFlag` records the exposure in the same call that evaluates the flag, which makes it hard to instrument the exposure in the wrong place.
- The harness's own tallies matched Flagsmith's counts exactly in every run (for example 63/57 identities and the same sums of tokens), so we trust the pipeline.
- `--json` with `--jq` kept the skill's output small, and `flagsmith evaluate --identity` is transient, which made safe probing possible.
