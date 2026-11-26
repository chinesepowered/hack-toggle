# How `fx` works, and why

Read this when a step fails in a way the command's own output does not explain. Verified against Flagsmith 2.295.2 (self-hosted) and CLI v2.0.0.

## What each command does in Flagsmith

| Command | CLI calls underneath | Changes what users get? |
|---|---|---|
| `setup` | `flagsmith feature create`, `flagsmith feature variant add --weight 0`, `flagsmith api …/experiment-metrics/` | No |
| `check` | `flagsmith api …/warehouse-connections/` and `…/events/`, `flagsmith feature get`, `flagsmith evaluate --identity` ×20 | No |
| `start` | `flagsmith api …/experiments/` (create), then `…/experiments/<id>/start/` | Yes |
| `status` | `…/exposures/refresh/`, `…/exposures/` | No |
| `results` | `…/results/refresh/`, `…/results/`, `…/experiments/<id>/` | No |
| `ship` | `…/experiments/<id>/complete/` with a rollout decision, then `flagsmith evaluate` ×20 | Yes |
| `stop` | `…/experiments/<id>/complete/` with decision `control` | Yes, back to the control |

Paths are relative to `api/v1/environments/<environment key>/`.

`status` and `results` act on the unfinished experiment on the flag, or on the latest finished one if there is none, so results stay readable after a ship or a stop. `stop` and `ship --winner control` send Flagsmith the same decision; the difference is that `ship` records who approved it.

The CLI asks for confirmation before its own write commands and needs `--yes` when there is no terminal. `fx` writes through `flagsmith api`, which does not prompt, so the approval gate in `fx` is the only gate.

## Why the experiment is created at `start`, not at `setup`

An experiment cannot be created without its rollout, and the rollout is a segment override that takes effect immediately. With the payload shown in Flagsmith's own agent guide (`"enabled": true`), fresh identities are split between control and variation as soon as the experiment exists, while its status is still `created` and before anyone has started it. Setting `"enabled": false` instead serves the flag as disabled to everyone enrolled, which can switch off a feature that was on.

So `fx` keeps the plan in a spec file, where it changes nothing, and creates and starts the experiment back to back once a person has approved. If the start call fails, the experiment is deleted again.

## The silent failures `check` looks for

- **No warehouse on the environment.** Events are accepted and dropped.
- **A variation without a key.** Its exposures are not recorded.
- **An event name that does not match the metric.** Names are case-sensitive; a mismatch is accepted and never counted. `check` asks the warehouse which event names it has actually received.
- **Something already being served.** Twenty throwaway identities are evaluated; before a start, all must get the control.

`flagsmith evaluate --identity` is transient: it stores nothing and records no exposure, so probing does not touch the results.

## Reading `results`

```
Booking correct  control 34/61 55.7%  accessible 62/79 78.5%  lift +40.8% [+5.1%, +76.5%]  chance 98.7%  WINNING
sample ratio: ok (control 61 / variation 79, expected 50/50, p=0.128)
```

- Metrics are printed in the order the experiment lists them, which is the order of the spec. The first is the primary and is the one `ship` judges.
- `lift` is the relative change against the control; the bracket is Flagsmith's 95% credible interval.
- `chance` is Flagsmith's chance to beat the control, already oriented by the metric's direction (for a lower-is-better metric, a drop is a win).
- Verdicts use Flagsmith's documented thresholds: 95% or more is `WINNING`, 5% or less is `LOSING`. A guardrail is `BREACHED` only at 5% or less.
- `collecting data` means a variation has fewer than 50 identities or 5 conversions; Flagsmith computes nothing below that.
- Refreshes are limited to one every 5 minutes. A throttled refresh prints a note and the last computed results.

### The sample-ratio line

A sample ratio mismatch means the split you got is not the split you configured, which usually points to broken assignment or lost exposures, and makes the results untrustworthy. Flagsmith 2.295 tests the observed split against the flag's default allocation. That allocation is 0 when the variation was added with weight 0 (as its docs instruct), so `srm_p_value` comes back `null` and no check is made. `fx` therefore computes the check itself from the exposure counts and the experiment's configured split (chi-squared, one degree of freedom) and flags `MISMATCH` below p = 0.001. If Flagsmith does return a value, `fx` uses that.

## Limits

- One variation per experiment (control plus one). Flagsmith supports more; `fx` does not.
- One unfinished experiment per flag and environment, which is Flagsmith's own rule.
- `fx` reads the project from the CLI's context (`flagsmith.json` or `FLAGSMITH_PROJECT`).
