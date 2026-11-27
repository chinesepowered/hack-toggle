# Skill test 2: a fresh agent runs the whole job (skill v1.1)

Totals reported by the agent harness: **104,707 tokens, 15 tool calls, 18 minutes** (26 November 2026, Staging).

Every command began with the same prefix, which is left out below: it puts the Flagsmith CLI on the path, loads its login, and sets the Staging environment key for the CLI and for `FX_UNATTENDED_ENVS`.

## The prompt the agent was given

````text
You are testing an Agent Skill by using it to do a real job, exactly as a coding agent that had just loaded the skill would. Rely on the skill's own instructions; I am deliberately telling you little beyond where things are.

## Context

- Repository: /home/user/hack-toggle (work from the repository root). The skill is in `skills/flagsmith-experiment/`. Read its `SKILL.md` first and follow it. Read `references/how-it-works.md` only if a step fails in a way the command output does not explain. Do not read the `scripts/fx` source.
- Shell state does not persist between commands, so begin every command with:
  `cd /home/user/hack-toggle && export PATH="/root/.local/bin:$PATH" && source .flagsmith/flagsmith.env && export FLAGSMITH_ENVIRONMENT=NcRpHwUoVvMTTjDxzJXZEv FX_UNATTENDED_ENVS=NcRpHwUoVvMTTjDxzJXZEv && `
  `NcRpHwUoVvMTTjDxzJXZEv` is the Staging environment's client-side key, and the owner has listed Staging in `FX_UNATTENDED_ENVS`.
- The application under test (a booking site) is already running against Staging at http://localhost:3000 and is already instrumented. You do not need to change any code.
- Traffic comes from AI guests. To send N guests through the site:
  `npm run --silent guests -- --env staging --n <N> --run-id <unique-id> > data/logs/<unique-id>.log 2>&1; tail -n 8 data/logs/<unique-id>.log`
  Every run needs a new run id (letters, digits, `-`, `_`). It takes roughly 3 to 5 seconds per guest; give a 120-guest run a timeout of at least 25 minutes. The tail shows a tally table; that is only a cross-check, the experiment result comes from the skill.
- The experiment spec already exists at `experiments/booking_form.json`, for the flag `booking_form`. Do not edit it.
- Pass `--log data/logs/skill-demo2-approvals.log` to commands that record an approval or a stop.

## The job

Run that experiment end to end in Staging using the skill: apply the existing spec, rehearse with 2 guests, check, start, send 120 guests, read and save the results (save the `fx results` output to `data/logs/skill-demo2-results.txt`), then make the rollout decision the skill's rules allow here. Before you end the experiment, also try `fx ship --winner accessible` once, exactly as the skill would have you call it in this environment, so that we see whether it ships or refuses; then act on what it says.

## Constraints

- Staging only. Never use any other environment key.
- Do not read `.env`, and never print keys or tokens other than the Staging client-side key above.
- Do not modify any file except logs under `data/`. Do not commit or push. Other files in the repository may change while you work; leave them alone.
- Keep your own output and tool use as small as the job allows: no exploratory commands that the skill does not call for, no `cat` of large files.

## Report back

1. The commands you ran, in order (the common prefix can be omitted), with a count of how many shell commands that was.
2. The complete output of `fx check`, `fx start`, `fx results`, the `fx ship` attempt, and your final command.
3. One or two sentences on why you made the final decision.
4. Anything in `SKILL.md` that was still unclear, missing or wrong. Be specific and brief.
````

## What it did

**1. Read** `skills/flagsmith-experiment/SKILL.md`

*(63 lines read)*

**2. Command**

```bash
flagsmith auth status 2>&1 | sed -E 's/[A-Za-z0-9_.+=-]{20,}/[redacted]/g'
```

**3. Command**

```bash
md5sum experiments/booking_form.json && skills/flagsmith-experiment/scripts/fx setup --flag booking_form; md5sum experiments/booking_form.json
```

```text
Instance            http://localhost:8000
Identity            Master API key
Organisations       Capybara Onsen (1)
Credential source   $[redacted]
```

```text
1b12640064305d784d345e1cbb214810  experiments/booking_form.json
flag booking_form control=classic variation=accessible
metric booking_correct occurrence
metric booking_completed occurrence
metric guest_steps mean
metric guest_tokens mean
nothing users see has changed. next: send a test conversion through your app here, then: fx check
1b12640064305d784d345e1cbb214810  experiments/booking_form.json
```

**4. Command**

```bash
RID=skill-demo2-rehearsal-$(date +%H%M%S) && npm run --silent guests -- --env staging --n 2 --run-id $RID > data/logs/$RID.log 2>&1; echo "run id: $RID"; tail -n 8 data/logs/$RID.log
```

```text
run id: skill-demo2-rehearsal-212923

Harness tally (a cross-check; Flagsmith computes the experiment result):
┌─────────┬────────┬───────────┬─────────┬─────────────┬───────────┬──────────────┬─────────────┐
│ (index) │ guests │ completed │ correct │ completed % │ correct % │ mean actions │ mean tokens │
├─────────┼────────┼───────────┼─────────┼─────────────┼───────────┼──────────────┼─────────────┤
│ classic │ 2      │ 2         │ 2       │ '100.0'     │ '100.0'   │ 12.5         │ 33948       │
└─────────┴────────┴───────────┴─────────┴─────────────┴───────────┴──────────────┴─────────────┘
Transcripts: /home/user/hack-toggle/data/runs/skill-demo2-rehearsal-212923
```

**5. Command**

```bash
skills/flagsmith-experiment/scripts/fx check --flag booking_form
```

```text
ok    warehouse connected
ok    variation 'accessible' exists and has a key
ok    event 'booking_correct' has been received here before
ok    event 'booking_completed' has been received here before
ok    event 'guest_steps' has been received here before
ok    event 'guest_tokens' has been received here before
ok    nothing has changed for users yet: 20 of 20 probe identities get the control (classic)
ready. This environment is listed in FX_UNATTENDED_ENVS, so no approval is needed: fx start
```

**6. Command**

```bash
skills/flagsmith-experiment/scripts/fx start --flag booking_form --log data/logs/skill-demo2-approvals.log
```

```text
experiment id=6 status=running started=2026-11-26T21:30:28.179701Z
live: of 20 probe identities 6 get the control and 14 the variation (configured 50/50)
recorded in data/logs/skill-demo2-approvals.log
```

**7. Command (run in the background)**

```bash
RID=skill-demo2-main-$(date +%H%M%S) && npm run --silent guests -- --env staging --n 120 --run-id $RID > data/logs/$RID.log 2>&1; echo "run id: $RID  finished $(date -u +%H:%M:%S)Z"; tail -n 8 data/logs/$RID.log
```

**8. Command (run in the background)**

```bash
sleep 150; echo "status at $(date -u +%H:%M:%S)Z"; skills/flagsmith-experiment/scripts/fx status --flag booking_form
```

*(started in the background)*

*(started in the background)*

> Both are running in the background: the 120-guest run, and a status check that fires about 2.5 minutes into the traffic. I am waiting for the status check to report first.

*(a background command finished: Background command "Once traffic is flowing, check that both variations have exposures" completed (exit code 0))*

**9. Read** `<scratch>/tasks/bgvkueuvc.output`

```text
status at 21:33:32Z
experiment id=6 status=running exposures: accessible=14 control=11

[exited with code 0]
```

> Status at 21:33:32Z shows exposures in both arms (accessible=14, control=11), so the variation is being served and recorded. Waiting for the 120-guest run to finish before reading results.

*(a background command finished: Background command "Send 120 AI guests through the booking site in Staging" completed (exit code 0))*

**10. Read** `<scratch>/tasks/bzbxss4jr.output`

```text
run id: skill-demo2-main-213102  finished 21:40:46Z
Harness tally (a cross-check; Flagsmith computes the experiment result):
┌────────────┬────────┬───────────┬─────────┬─────────────┬───────────┬──────────────┬─────────────┐
│ (index)    │ guests │ completed │ correct │ completed % │ correct % │ mean actions │ mean tokens │
├────────────┼────────┼───────────┼─────────┼─────────────┼───────────┼──────────────┼─────────────┤
│ accessible │ 65     │ 65        │ 65      │ '100.0'     │ '100.0'   │ 11.75        │ 38215       │
│ classic    │ 55     │ 55        │ 55      │ '100.0'     │ '100.0'   │ 12.18        │ 32915       │
└────────────┴────────┴───────────┴─────────┴─────────────┴───────────┴──────────────┴─────────────┘
Transcripts: /home/user/hack-toggle/data/runs/skill-demo2-main-213102

[exited with code 0]
```

**11. Command (run in the background)**

```bash
sleep 75; echo "results at $(date -u +%H:%M:%S)Z"; skills/flagsmith-experiment/scripts/fx results --flag booking_form 2>&1 | tee data/logs/skill-demo2-results.txt
```

*(started in the background)*

> The 120-guest run finished at 21:40:46Z (harness tally: accessible 65 guests, classic 55, all completed and correct). The results read is running after a 75-second settling wait and will save to `data/logs/skill-demo2-results.txt`.

*(a background command finished: Background command "Read the experiment results after a short settling wait and save them to the results log" completed (exit code 0))*

**12. Read** `<scratch>/tasks/bbaiclndq.output`

```text
results at 21:42:21Z
Booking correct (primary)  control 55/55 100%  accessible 65/65 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Booking completed  control 55/55 100%  accessible 65/65 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Guest steps  control n=55 mean 12.18  accessible n=65 mean 11.75  lift -3.5% [-8.2%, +1.2%]  chance 92.8%  guardrail ok
Guest tokens  control n=55 mean 32914.55  accessible n=65 mean 38215.49  lift +16.1% [+9.8%, +22.4%]  chance 0%  GUARDRAIL BREACHED
sample ratio: ok (control 55 / variation 65, expected 50/50, p=0.361)
as of 2026-11-26T21:42:22.518182Z

[exited with code 0]
```

**13. Command**

```bash
skills/flagsmith-experiment/scripts/fx ship --flag booking_form --winner accessible --log data/logs/skill-demo2-approvals.log; echo "exit code: $?"
```

```text
fx: a guardrail is breached: Guest tokens. Ship control, or use --force once the user has accepted the trade-off.
exit code: 1
```

**14. Command**

```bash
skills/flagsmith-experiment/scripts/fx stop --flag booking_form --log data/logs/skill-demo2-approvals.log; echo "exit code: $?"
```

```text
experiment id=6 status=completed decision=control
everyone is back on the control: 20 of 20 probe identities
recorded in data/logs/skill-demo2-approvals.log
exit code: 0
```

**15. Command**

```bash
md5sum experiments/booking_form.json; wc -l data/logs/skill-demo2-results.txt data/logs/skill-demo2-approvals.log; git status --short | head -n 12
```

```text
1b12640064305d784d345e1cbb214810  experiments/booking_form.json
  6 data/logs/skill-demo2-results.txt
  2 data/logs/skill-demo2-approvals.log
  8 total
```

## Its report

The experiment ran end to end in Staging and ended with the control kept: `fx ship --winner accessible` refused because the Guest tokens guardrail was breached, so I ran `fx stop`. Everyone is back on `classic`.

## 1. Commands, in order

11 shell commands: 10 for the job and 1 closing verification of my own. `fx` below stands for `skills/flagsmith-experiment/scripts/fx`; the common prefix is omitted.

1. `flagsmith auth status 2>&1 | sed -E 's/[A-Za-z0-9_.+=-]{20,}/[redacted]/g'`
2. `md5sum experiments/booking_form.json && fx setup --flag booking_form; md5sum experiments/booking_form.json`
3. `RID=skill-demo2-rehearsal-$(date +%H%M%S) && npm run --silent guests -- --env staging --n 2 --run-id $RID > data/logs/$RID.log 2>&1; echo "run id: $RID"; tail -n 8 data/logs/$RID.log`
4. `fx check --flag booking_form`
5. `fx start --flag booking_form --log data/logs/skill-demo2-approvals.log`
6. (background) `RID=skill-demo2-main-$(date +%H%M%S) && npm run --silent guests -- --env staging --n 120 --run-id $RID > data/logs/$RID.log 2>&1; echo "run id: $RID  finished $(date -u +%H:%M:%S)Z"; tail -n 8 data/logs/$RID.log`
7. (background, launched with 6) `sleep 150; echo "status at $(date -u +%H:%M:%S)Z"; fx status --flag booking_form`
8. (background) `sleep 75; echo "results at $(date -u +%H:%M:%S)Z"; fx results --flag booking_form 2>&1 | tee data/logs/skill-demo2-results.txt`
9. `fx ship --flag booking_form --winner accessible --log data/logs/skill-demo2-approvals.log; echo "exit code: $?"`
10. `fx stop --flag booking_form --log data/logs/skill-demo2-approvals.log; echo "exit code: $?"`
11. `md5sum experiments/booking_form.json; wc -l data/logs/skill-demo2-results.txt data/logs/skill-demo2-approvals.log; git status --short | head -n 12`

Not from the skill: the `sed` mask in 1, the `md5sum` calls, the `sleep` waits (run in the background because this harness blocks foreground sleep), `tee`, the exit-code echoes and command 11. Besides the shell, I read `SKILL.md` once and the three background output files. I did not open `references/how-it-works.md`, the `fx` source, the spec JSON or `.env`.

Run ids: `skill-demo2-rehearsal-212923` and `skill-demo2-main-213102`. The 120-guest run took 9 min 44 s (21:31:02Z to 21:40:46Z).

## 2. Outputs

`fx setup` (for context; the spec's md5 was identical before and after):
```
flag booking_form control=classic variation=accessible
metric booking_correct occurrence
metric booking_completed occurrence
metric guest_steps mean
metric guest_tokens mean
nothing users see has changed. next: send a test conversion through your app here, then: fx check
```

`fx check`:
```
ok    warehouse connected
ok    variation 'accessible' exists and has a key
ok    event 'booking_correct' has been received here before
ok    event 'booking_completed' has been received here before
ok    event 'guest_steps' has been received here before
ok    event 'guest_tokens' has been received here before
ok    nothing has changed for users yet: 20 of 20 probe identities get the control (classic)
ready. This environment is listed in FX_UNATTENDED_ENVS, so no approval is needed: fx start
```

`fx start`:
```
experiment id=6 status=running started=2026-11-26T21:30:28.179701Z
live: of 20 probe identities 6 get the control and 14 the variation (configured 50/50)
recorded in data/logs/skill-demo2-approvals.log
```

`fx status`, at 21:33:32Z, about 2.5 minutes into the traffic:
```
experiment id=6 status=running exposures: accessible=14 control=11
```

`fx results`, read at 21:42:21Z and saved to `/home/user/hack-toggle/data/logs/skill-demo2-results.txt` (6 lines):
```
Booking correct (primary)  control 55/55 100%  accessible 65/65 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Booking completed  control 55/55 100%  accessible 65/65 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Guest steps  control n=55 mean 12.18  accessible n=65 mean 11.75  lift -3.5% [-8.2%, +1.2%]  chance 92.8%  guardrail ok
Guest tokens  control n=55 mean 32914.55  accessible n=65 mean 38215.49  lift +16.1% [+9.8%, +22.4%]  chance 0%  GUARDRAIL BREACHED
sample ratio: ok (control 55 / variation 65, expected 50/50, p=0.361)
as of 2026-11-26T21:42:22.518182Z
```
The harness tally agrees exactly: accessible 65 guests, 65 completed, 65 correct, 11.75 mean actions, 38215 mean tokens; classic 55, 55, 55, 12.18, 32915.

`fx ship --winner accessible` (no `--approved-by`, no `--force`), exit code 1:
```
fx: a guardrail is breached: Guest tokens. Ship control, or use --force once the user has accepted the trade-off.
```

Final command, `fx stop`, exit code 0:
```
experiment id=6 status=completed decision=control
everyone is back on the control: 20 of 20 probe identities
recorded in data/logs/skill-demo2-approvals.log
```

Closing verification: the spec md5 is still `1b12640064305d784d345e1cbb214810`, `git status --short` printed nothing, and the approvals log has 2 lines.

## 3. Why the final decision

The primary (Booking correct, a guardrail) was `guardrail ok` at 55/55 against 65/65 and the sample ratio was ok, but the Guest tokens guardrail was breached (+16.1% [+9.8%, +22.4%], chance 0%). The skill's rules bar shipping a variation with a breached guardrail, and `fx ship` refused for that reason. Staging is listed in `FX_UNATTENDED_ENVS`, where the skill forbids `--force` and says to run `fx stop` after a refusal, so I stopped the experiment.

## 4. What in SKILL.md was unclear, missing or wrong

1. **The refusal text contradicts the sandbox rule.** In an unattended environment the refusal still says "Ship control, or use --force once the user has accepted the trade-off" and never mentions `fx stop`. SKILL.md says both "read the output, it ends with the next step" and "never use --force there, run fx stop". It should state that the Safety rules override the printed next step, or the refusal should be sandbox-aware the way `check` is.
2. **"Output ends with the next step" held only for `setup` and `check`.** `start`, `status`, `results` and `stop` ended without one. After `start`, nothing in the output points to `status`.
3. **The invocation path is inconsistent.** Every example is `scripts/fx ...` and `allowed-tools` is `Bash(scripts/fx:*)`, but the skill requires running from the repository root, where the command is `skills/flagsmith-experiment/scripts/fx ...`. The examples do not run as written from there, and the allowed-tools pattern does not match the real command.
4. **When to read results is not specified.** "Numbers refresh at most once every 5 minutes" does not say how long to wait after the last traffic, or whether an early `status` call delays a later `results`. `results` also prints an `as of` line that step 6 does not list. What made the read trustworthy was comparing its counts (55 + 65) with the 120 guests sent; the skill should tell the agent to do that.
5. **The `live:` line from `start` cannot be judged.** It reported 6 control and 14 variation out of 20 probes against a configured 50/50, with no ok or warning verdict, and SKILL.md does not say how to read it. Real traffic came out 55/65 with `sample ratio: ok`.
6. **`flagsmith auth status` does not show the project.** It lists the instance, identity type, organisation and credential source, so it does not "confirm the CLI can reach the project". The first real proof was `fx setup` succeeding.
7. **Smaller gaps:**
   - It is not stated that `fx setup --flag <flag>` with no other options leaves the spec untouched (it did).
   - `setup` and `check` never show which metric is primary or which are guardrails, so the decision rule is invisible until `results` unless the agent opens the spec.
   - A refused `ship` appears to leave no line in the approvals log: it has 2 lines, one each for start and stop by count (I did not open it). "Record" does not mention this.
   - In a sandbox, an `inconclusive` primary would fall under both "means wait" and "if ship would be refused, run fx stop"; the skill does not say which wins. This run did not hit it.
   - Step 6 says to save the results but not where.

Files written, all under `/home/user/hack-toggle/data/`:
- `logs/skill-demo2-results.txt`
- `logs/skill-demo2-approvals.log`
- `logs/skill-demo2-rehearsal-212923.log`
- `logs/skill-demo2-main-213102.log`
- harness transcripts in `runs/skill-demo2-rehearsal-212923` and `runs/skill-demo2-main-213102`

Nothing was committed or pushed, and only the Staging key was used.
