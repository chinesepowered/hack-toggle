# Skill test 1: a fresh agent runs the whole job (skill v1.0)

Totals reported by the agent harness: **117,084 tokens, 26 tool calls, 13 minutes** (26 November 2026, Staging).

Every command began with the same prefix, which is left out below: it puts the Flagsmith CLI on the path, loads its login, and sets the Staging environment key for the CLI and for `FX_UNATTENDED_ENVS`.

## The prompt the agent was given

````text
You are testing an Agent Skill by using it to do a real job, exactly as a coding agent that had just loaded the skill would. Work only in the Staging environment described below.

## Context

- Repository: /home/user/hack-toggle. The skill is in `skills/flagsmith-experiment/`. Read its `SKILL.md` first and follow it. Read `references/how-it-works.md` only if a step fails in a way the command output does not explain. Do not read the `scripts/fx` source unless you are truly stuck.
- Shell state does not persist between commands, so begin every command with:
  `cd /home/user/hack-toggle && export PATH="/root/.local/bin:$PATH" && source .flagsmith/flagsmith.env && export FLAGSMITH_ENVIRONMENT=NcRpHwUoVvMTTjDxzJXZEv FX_UNATTENDED_ENVS=NcRpHwUoVvMTTjDxzJXZEv && `
  `NcRpHwUoVvMTTjDxzJXZEv` is the Staging environment key. The owner has listed Staging in `FX_UNATTENDED_ENVS`, so it is a sandbox where you may run the whole loop without asking anyone.
- The application under test (a booking site) is already running against Staging at http://localhost:3000 and is already instrumented. You do not need to change any code.
- Traffic comes from AI guests. To send N guests through the site:
  `npm run --silent guests -- --env staging --n <N> --run-id <unique-id> > data/logs/<unique-id>.log 2>&1; tail -n 8 data/logs/<unique-id>.log`
  Every run needs a new run id (letters, digits, `-`, `_`). It takes roughly 5 seconds per guest, so 120 guests need about 10 minutes: give that command a timeout of at least 25 minutes. The tail shows a tally table; that table is only a cross-check, the experiment result comes from the skill.
- The experiment spec already exists at `experiments/booking_form.json`, for the flag `booking_form`. Do not edit it.
- For commands that record an approval or a stop, pass `--log data/logs/skill-demo-approvals.log`.

## The job

Run that experiment end to end in Staging using the skill: apply the existing spec to Staging, rehearse with 2 guests, run the pre-launch check, start the experiment, send 120 guests, read the results, then make the rollout decision that the skill's rules allow in an unattended sandbox. If the results do not permit shipping the variation, end the experiment safely instead of forcing it.

## Constraints

- Staging only. Never use any other environment key.
- Do not read `.env`, and never print keys or tokens.
- Do not modify any file except logs under `data/`. Do not commit or push.
- Keep your own output small: do not `cat` large files, and do not print the guest logs beyond the tail shown above.

## Report back

1. The commands you ran, in order (the common prefix can be omitted).
2. The complete output of `fx check`, `fx start`, `fx results`, and of your final ship or stop command.
3. One or two sentences on why you made that final decision.
4. Anything in `SKILL.md` that was unclear, missing or wrong for doing this job. Be specific; this is the part I most need.
````

## What it did

**1. Command**

```bash
ls skills/flagsmith-experiment/ skills/flagsmith-experiment/* && wc -c skills/flagsmith-experiment/SKILL.md
```

**2. Read** `skills/flagsmith-experiment/SKILL.md`

*(57 lines read)*

```text
skills/flagsmith-experiment/SKILL.md

skills/flagsmith-experiment/:
SKILL.md
references
scripts

skills/flagsmith-experiment/references:
how-it-works.md

skills/flagsmith-experiment/scripts:
fx
4045 skills/flagsmith-experiment/SKILL.md
```

**3. Command**

```bash
skills/flagsmith-experiment/scripts/fx --help
```

```text
fx: run one Flagsmith experiment from plan to rollout, on the Flagsmith CLI.

  fx setup    write the experiment spec; create the flag, variation and metrics. Changes nothing users see.
  fx check    pre-launch checks; fails loudly on the things that otherwise fail silently
  fx start    create and start the experiment      (needs --approved-by)
  fx status   one line: state and exposures per variation
  fx results  refresh, then one line per metric with a verdict
  fx ship     end the experiment and roll out a winner (needs --approved-by)
  fx stop     end the experiment and put everyone back on the control (always allowed)

Requires: flagsmith (CLI v2+), jq.
Context:  FLAGSMITH_ENVIRONMENT (client-side environment key) or -e KEY, plus
          whatever the CLI itself needs (flagsmith.json or FLAGSMITH_PROJECT,
          and credentials). `flagsmith auth status` shows what it has.
… (26 more lines)
```

**4. Command**

```bash
wc -c experiments/booking_form.json && git status --short | head -20 && skills/flagsmith-experiment/scripts/fx setup --flag booking_form; echo "exit=$?"
```

```text
1236 experiments/booking_form.json
flag booking_form control=classic variation=accessible
metric booking_correct occurrence
metric booking_completed occurrence
metric guest_steps mean
metric guest_tokens mean
nothing users see has changed. next: send a test conversion through your app here, then: fx check
exit=0
```

**5. Command**

```bash
git status --short | head -20; echo "--- spec"; cat experiments/booking_form.json; echo; echo "--- logs dir"; ls data/logs 2>/dev/null | tail -n 15; ls data | head -20
```

```text
--- spec
{
  "flag": "booking_form",
  "control": "classic",
  "variation": {
    "key": "accessible",
    "value": "accessible"
  },
  "split": 50,
  "rollout": 100,
  "metrics": [
    {
      "event": "booking_correct",
      "aggregation": "occurrence",
… (42 more lines)
```

**6. Command**

```bash
ls data/runs | tail -n 20; echo "--- status"; skills/flagsmith-experiment/scripts/fx status --flag booking_form; echo "exit=$?"
```

```text
pilot1
pilot2
rehearsal-prod
rehearsal1
t1
t2
--- status
fx: no experiment is running on 'booking_form'
exit=1
```

**7. Command**

```bash
npm run --silent guests -- --env staging --n 2 --run-id skilldemo-rehearsal-1126 > data/logs/skilldemo-rehearsal-1126.log 2>&1; echo "exit=$?"; tail -n 8 data/logs/skilldemo-rehearsal-1126.log
```

```text
exit=0

Harness tally (a cross-check; Flagsmith computes the experiment result):
┌─────────┬────────┬───────────┬─────────┬─────────────┬───────────┬──────────────┬─────────────┐
│ (index) │ guests │ completed │ correct │ completed % │ correct % │ mean actions │ mean tokens │
├─────────┼────────┼───────────┼─────────┼─────────────┼───────────┼──────────────┼─────────────┤
│ classic │ 2      │ 2         │ 2       │ '100.0'     │ '100.0'   │ 13.5         │ 37251       │
└─────────┴────────┴───────────┴─────────┴─────────────┴───────────┴──────────────┴─────────────┘
Transcripts: /home/user/hack-toggle/data/runs/skilldemo-rehearsal-1126
```

**8. Command**

```bash
skills/flagsmith-experiment/scripts/fx check --flag booking_form; echo "exit=$?"
```

```text
ok    warehouse connected
ok    variation 'accessible' exists and has a key
ok    event 'booking_correct' has been received here
ok    event 'booking_completed' has been received here
ok    event 'guest_steps' has been received here
ok    event 'guest_tokens' has been received here
ok    nothing has changed for users yet: 20 of 20 probe identities get the control (classic)
ready. Starting changes what users are served: show the user experiments/booking_form.json and this output, ask, then: fx start --approved-by NAME
exit=0
```

**9. Command**

```bash
skills/flagsmith-experiment/scripts/fx start --flag booking_form --log data/logs/skill-demo-approvals.log; echo "exit=$?"
```

```text
experiment id=5 status=running started=2026-11-26T21:09:29.818453Z
live: of 20 probe identities 11 get the control and 9 the variation (configured 50/50)
recorded in data/logs/skill-demo-approvals.log
exit=0
```

**10. Command**

```bash
wc -l data/logs/skill-demo-approvals.log && tail -n 3 data/logs/skill-demo-approvals.log | cut -c1-400; echo "--- status"; skills/flagsmith-experiment/scripts/fx status --flag booking_form; echo "exit=$?"; git status --short | head
```

```text
1 data/logs/skill-demo-approvals.log
2026-11-26T21:09:30Z	start	env=NcRpHwUoVvMTTjDxzJXZEv	flag=booking_form	experiment=5	by=unattended (environment listed in FX_UNATTENDED_ENVS)	spec=experiments/booking_form.json
--- status
experiment id=5 status=running exposures: none yet
exit=0
?? scripts/demo.sh
```

**11. Command**

```bash
ls -la --time-style=full-iso scripts/ | head -20; date -u +%FT%TZ; ls -la --time-style=full-iso data/logs | tail -n 8
```

```text
total 32
drwxr-xr-x  2 root root 4096 2026-11-26 21:08:59.035870421 +0000 .
drwxr-xr-x 13 root root 4096 2026-11-26 21:09:30.831871558 +0000 ..
-rw-r--r--  1 root root 6738 2026-11-26 20:29:38.535786003 +0000 bootstrap.mjs
-rwxr-xr-x  1 root root 2958 2026-11-26 21:08:59.035870421 +0000 demo.sh
-rw-r--r--  1 root root 1463 2026-11-26 20:41:05.191810560 +0000 env.mjs
-rw-r--r--  1 root root 4912 2026-11-26 20:38:29.523804993 +0000 parity.mjs
2026-11-26T21:09:41Z
-rw-r--r-- 1 root root    83 2026-11-26 21:06:26.443864964 +0000 app-production.log
-rw-r--r-- 1 root root    80 2026-11-26 20:54:26.551839219 +0000 app-staging.log
-rw-r--r-- 1 root root 21819 2026-11-26 20:45:02.743819056 +0000 dockerd.log
-rw-r--r-- 1 root root  5801 2026-11-26 20:58:08.911847171 +0000 pilot1.log
-rw-r--r-- 1 root root  4721 2026-11-26 21:04:44.563861321 +0000 pilot2.log
-rw-r--r-- 1 root root   177 2026-11-26 21:09:30.247871538 +0000 skill-demo-approvals.log
… (2 more lines)
```

**12. Command (run in the background)**

```bash
npm run --silent guests -- --env staging --n 120 --run-id skilldemo-main-1126 > data/logs/skilldemo-main-1126.log 2>&1; echo "exit=$?"; tail -n 8 data/logs/skilldemo-main-1126.log
```

*(started in the background)*

**13. Command**

```bash
skills/flagsmith-experiment/scripts/fx status --flag booking_form; echo "exit=$?"; wc -l data/logs/skilldemo-main-1126.log; tail -n 2 data/logs/skilldemo-main-1126.log | cut -c1-200
```

```text
experiment id=5 status=running exposures: none yet
exit=0
1 data/logs/skilldemo-main-1126.log
Run skilldemo-main-1126: 120 guests -> http://localhost:3000 (staging), model Qwen/Qwen3.8-27B, 6 at a time
```

**14. ToolSearch** `{"query": "select:Monitor"}`

**15. Command**

```bash
end=$((SECONDS+280)); until grep -q "Harness tally" data/logs/skilldemo-main-1126.log || [ $SECONDS -ge $end ]; do sleep 5; done; date -u +%T; wc -l data/logs/skilldemo-main-1126.log; ls data/runs/skilldemo-main-1126 2>/dev/null | wc -l; skills/flagsmith-experiment/scripts/fx status --flag booking_form; echo "exit=$?"
```

```text
21:14:48
114 data/logs/skilldemo-main-1126.log
113
experiment id=5 status=running exposures: accessible=56 control=63
exit=0
```

**16. Command**

```bash
end=$((SECONDS+280)); until grep -q "Harness tally" data/logs/skilldemo-main-1126.log || [ $SECONDS -ge $end ]; do sleep 5; done; date -u +%T; wc -l data/logs/skilldemo-main-1126.log; tail -n 8 data/logs/skilldemo-main-1126.log
```

```text
21:15:14
130 data/logs/skilldemo-main-1126.log
Harness tally (a cross-check; Flagsmith computes the experiment result):
┌────────────┬────────┬───────────┬─────────┬─────────────┬───────────┬──────────────┬─────────────┐
│ (index)    │ guests │ completed │ correct │ completed % │ correct % │ mean actions │ mean tokens │
├────────────┼────────┼───────────┼─────────┼─────────────┼───────────┼──────────────┼─────────────┤
│ accessible │ 57     │ 57        │ 57      │ '100.0'     │ '100.0'   │ 11.98        │ 38954       │
│ classic    │ 63     │ 63        │ 63      │ '100.0'     │ '100.0'   │ 11.83        │ 31902       │
└────────────┴────────┴───────────┴─────────┴─────────────┴───────────┴──────────────┴─────────────┘
Transcripts: /home/user/hack-toggle/data/runs/skilldemo-main-1126
```

**17. Command**

```bash
date -u +%T; skills/flagsmith-experiment/scripts/fx status --flag booking_form; echo "status exit=$?"; skills/flagsmith-experiment/scripts/fx results --flag booking_form; echo "results exit=$?"
```

```text
21:15:18
experiment id=5 status=running exposures: accessible=56 control=63
status exit=0
Booking completed  control 63/63 100%  accessible 57/57 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Booking correct  control 63/63 100%  accessible 57/57 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Guest steps  control n=63 mean 11.83  accessible n=57 mean 11.98  lift +1.3% [-3.3%, +6%]  chance 28.8%  guardrail ok
Guest tokens  control n=63 mean 31901.54  accessible n=57 mean 38954.04  lift +22.1% [+15.9%, +28.3%]  chance 0%  GUARDRAIL BREACHED
sample ratio: ok (control 63 / variation 57, expected 50/50, p=0.584)
as of 2026-11-26T21:15:21.921811Z
results exit=0
```

**18. Command**

```bash
date -u +%T; skills/flagsmith-experiment/scripts/fx status --flag booking_form; echo "status exit=$?"
```

```text
21:17:19
experiment id=5 status=running exposures: accessible=56 control=63
status exit=0
```

**19. Command**

```bash
date -u +%T; skills/flagsmith-experiment/scripts/fx stop --flag booking_form --log data/logs/skill-demo-approvals.log; echo "stop exit=$?"
```

```text
21:18:32
experiment id=5 status=completed decision=control
everyone is back on the control: 20 of 20 probe identities
recorded in data/logs/skill-demo-approvals.log
stop exit=0
```

**20. Command**

```bash
skills/flagsmith-experiment/scripts/fx status --flag booking_form; echo "status exit=$?"; echo "--- approvals log"; sed -e 's/NcRpHwUoVvMTTjDxzJXZEv/<staging-key>/g' data/logs/skill-demo-approvals.log | cut -c1-400; echo "--- git"; git status --short | head; git diff --stat | tail -n 3; echo "--- cwd strays"; ls experiment-approvals.log 2>&1 | head -1
```

```text
fx: no experiment is running on 'booking_form'
status exit=1
--- approvals log
2026-11-26T21:09:30Z	start	env=<staging-key>	flag=booking_form	experiment=5	by=unattended (environment listed in FX_UNATTENDED_ENVS)	spec=experiments/booking_form.json
2026-11-26T21:18:33Z	stop	env=<staging-key>	flag=booking_form	experiment=5	by=not required to stop	
--- git
 M guests/guest.mjs
?? scripts/demo.sh
?? scripts/report.mjs
?? video/
 guests/guest.mjs | 15 +++++++++++++--
 1 file changed, 13 insertions(+), 2 deletions(-)
--- cwd strays
ls: cannot access 'experiment-approvals.log': No such file or directory
```

**21. Command**

```bash
date -u +%FT%TZ; ls -la --time-style=full-iso guests/guest.mjs scripts/demo.sh scripts/report.mjs 2>&1 | awk '{print $6, $7, $9}'; ls -la --time-style=full-iso -d video 2>&1 | awk '{print $6, $7, $9}'; ls -la --time-style=full-iso data/logs/skilldemo-main-1126.log data/logs/skilldemo-rehearsal-1126.log | awk '{print $6, $7, $9}'; head -n 1 data/logs/skilldemo-main-1126.log | cut -c1-200; git log --oneline -n 3 | cut -c1-100; git stash list | head -3
```

```text
2026-11-26T21:18:45Z
2026-11-26 21:10:43.891874171 guests/guest.mjs
2026-11-26 21:08:59.035870421 scripts/demo.sh
2026-11-26 21:16:57.871887546 scripts/report.mjs
2026-11-26 21:13:43.098700557 video
2026-11-26 21:15:11.947883758 data/logs/skilldemo-main-1126.log
2026-11-26 21:09:15.203871000 data/logs/skilldemo-rehearsal-1126.log
Run skilldemo-main-1126: 120 guests -> http://localhost:3000 (staging), model Qwen/Qwen3.8-27B, 6 at a time
b3e88c8 Pre-register the production experiment
28728eb Add AI guest harness and the flagsmith-experiment skill
e4c7d0e Add Capybara Onsen booking app on self-hosted Flagsmith
```

**22. Command**

```bash
git diff -- guests/guest.mjs | cut -c1-220 | head -n 60
```

```text
diff --git a/guests/guest.mjs b/guests/guest.mjs
index 8366015..dcbc524 100644
--- a/guests/guest.mjs
+++ b/guests/guest.mjs
@@ -110,8 +110,11 @@ async function servedVersion(page) {
     .catch(() => null);
 }
 
-export async function runGuest({ browser, base, brief, task, llm, maxSteps = 40, temperature = 0.7, timeoutMs = 6 * 60_000 }) {
-  const context = await brow<server-side key>({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
+// `recorder`, when given, is called just before each action with the page, the
+// step and the on-screen box of the element about to be used. It exists for
+// the demo video; experiment runs do not pass one.
+export async function runGuest({ browser, base, brief, task, llm, maxSteps = 40, temperature = 0.7, timeoutMs = 6 * 60_000, viewport = { width: 1280, height: 900 }, deviceScaleFactor = 1, recorder = null }) {
… (22 more lines)
```

**23. Command**

```bash
find . -path ./node_modules -prune -o -path ./.git -prune -o -path ./data/runs -prune -o -type f -newermt "2026-11-26 21:07:00" -print 2>/dev/null | grep -v '^./video/' | head -n 30; echo "--- video count"; find ./video -type f 2>/dev/null | wc -l; echo "--- ignored?"; git check-ignore -v data .flagsmith 2>/dev/null | cut -c1-120
```

```text
./.env
./app/server.mjs
./scripts/demo.sh
./scripts/report.mjs
./experiments/HYPOTHESIS.md
./data/logs/skill-demo-approvals.log
./data/logs/skilldemo-rehearsal-1126.log
./data/logs/skilldemo-main-1126.log
./data/report-test/flagsmith-results.json
./data/report-test/flagsmith-experiment.json
./data/report-test/transcripts/pilot2_g0045.json
./data/report-test/transcripts/pilot2_g0004.json
./data/report-test/summary.json
./data/report-test/results.html
… (11 more lines)
```

**24. Command**

```bash
ls -la --time-style=full-iso .env app/server.mjs experiments/HYPOTHESIS.md package.json .env.example experiments/booking_form.json skills/flagsmith-experiment/SKILL.md skills/flagsmith-experiment/scripts/fx data/logs/app-staging.log 2>&1 | awk '{print $6, substr($7,1,8), $9}'; echo "--- commits"; git log -n 4 --format='%h %cI %s' | cut -c1-110; echo "--- skill dir clean?"; git status --short skills experiments | head
```

```text
2026-11-26 21:07:44 .env
2026-11-26 21:07:43 .env.example
2026-11-26 21:07:41 app/server.mjs
2026-11-26 20:54:26 data/logs/app-staging.log
2026-11-26 21:07:39 experiments/HYPOTHESIS.md
2026-11-26 21:06:25 experiments/booking_form.json
2026-11-26 21:07:46 package.json
2026-11-26 20:54:58 skills/flagsmith-experiment/SKILL.md
2026-11-26 21:06:13 skills/flagsmith-experiment/scripts/fx
--- commits
b3e88c8 2026-11-26T21:07:54+00:00 Pre-register the production experiment
28728eb 2026-11-26T21:03:35+00:00 Add AI guest harness and the flagsmith-experiment skill
e4c7d0e 2026-11-26T20:39:02+00:00 Add Capybara Onsen booking app on self-hosted Flagsmith
e471a85 2026-11-26T11:35:04-08:00 Initial commit
… (1 more lines)
```

**25. Command**

```bash
git show --stat --format='%h %s' b3e88c8 | cut -c1-120 | head -n 14; echo "--- server diff size"; git show b3e88c8 -- app/server.mjs | grep -c '^[+-][^+-]'; git show b3e88c8 -- app/server.mjs | grep '^[+-][^+-]' | cut -c1-160 | head -n 14; echo "--- app procs"; ps -eo pid,lstart,args | grep -E 'server\.mjs' | grep -v grep | cut -c1-150
```

```text
b3e88c8 Pre-register the production experiment

 .env.example                           |  4 +++
 app/server.mjs                         |  2 ++
 experiments/HYPOTHESIS.md              | 55 ++++++++++++++++++++++++++++++++++
 experiments/booking_form.json          | 42 ++++++++++++++++++++++++++
 package.json                           |  3 +-
 skills/flagsmith-experiment/scripts/fx |  7 +++--
 6 files changed, 110 insertions(+), 3 deletions(-)
--- server diff size
2
+import { loadDotEnv } from '../scripts/env.mjs';
+loadDotEnv();
--- app procs
… (2 more lines)
```

**26. Command**

```bash
date -u +%T; skills/flagsmith-experiment/scripts/fx results --flag booking_form; echo "results exit=$?"
```

```text
21:19:34
fx: no experiment is running on 'booking_form'
results exit=1
```

## Its report

## Outcome

The loop ran end to end in Staging with no failed step. The variation breached the token guardrail, so I did not ship it: I ended the experiment with `fx stop`, and everyone is back on the control (`classic`). I never ran `fx ship`, so its refusal path is untested by this run.

## 1. Commands, in order (common prefix omitted)

`fx` below means `skills/flagsmith-experiment/scripts/fx`, run from the repo root.

1. `fx --help`
2. `fx setup --flag booking_form` printed the flag, variation and four metrics, then "nothing users see has changed".
3. `fx status --flag booking_form` gave `fx: no experiment is running on 'booking_form'` (exit 1).
4. `npm run --silent guests -- --env staging --n 2 --run-id skilldemo-rehearsal-1126 > data/logs/skilldemo-rehearsal-1126.log 2>&1; tail -n 8 data/logs/skilldemo-rehearsal-1126.log` sent 2 guests, both `classic`, both completed and correct.
5. `fx check --flag booking_form`
6. `fx start --flag booking_form --log data/logs/skill-demo-approvals.log` (no `--approved-by`)
7. `fx status --flag booking_form` gave `experiment id=5 status=running exposures: none yet`.
8. `npm run --silent guests -- --env staging --n 120 --run-id skilldemo-main-1126 > data/logs/skilldemo-main-1126.log 2>&1; tail -n 8 data/logs/skilldemo-main-1126.log` ran in the background for about 5.5 minutes.
9. `fx status --flag booking_form`, during the run and just after it, gave `exposures: accessible=56 control=63`.
10. `fx results --flag booking_form`
11. `fx status --flag booking_form` (still 56/63)
12. `fx stop --flag booking_form --log data/logs/skill-demo-approvals.log`
13. `fx status` and `fx results` after the stop both gave `fx: no experiment is running on 'booking_form'` (exit 1).

Besides these I ran only read-only checks: `ls`, `git status`, `cat experiments/booking_form.json`, log tails, and one `git diff` (see "Other notes"). I did not read `references/how-it-works.md` or the `fx` source.

## 2. Complete outputs

`fx check` (exit 0):
```
ok    warehouse connected
ok    variation 'accessible' exists and has a key
ok    event 'booking_correct' has been received here
ok    event 'booking_completed' has been received here
ok    event 'guest_steps' has been received here
ok    event 'guest_tokens' has been received here
ok    nothing has changed for users yet: 20 of 20 probe identities get the control (classic)
ready. Starting changes what users are served: show the user experiments/booking_form.json and this output, ask, then: fx start --approved-by NAME
```

`fx start` (exit 0):
```
experiment id=5 status=running started=2026-11-26T21:09:29.818453Z
live: of 20 probe identities 11 get the control and 9 the variation (configured 50/50)
recorded in data/logs/skill-demo-approvals.log
```

`fx results` (exit 0):
```
Booking completed  control 63/63 100%  accessible 57/57 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Booking correct  control 63/63 100%  accessible 57/57 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Guest steps  control n=63 mean 11.83  accessible n=57 mean 11.98  lift +1.3% [-3.3%, +6%]  chance 28.8%  guardrail ok
Guest tokens  control n=63 mean 31901.54  accessible n=57 mean 38954.04  lift +22.1% [+15.9%, +28.3%]  chance 0%  GUARDRAIL BREACHED
sample ratio: ok (control 63 / variation 57, expected 50/50, p=0.584)
as of 2026-11-26T21:15:21.921811Z
```

The harness tally agrees exactly: accessible 57/57/57, 11.98 actions, 38954 tokens; classic 63/63/63, 11.83 actions, 31902 tokens.

Final command, `fx stop` (exit 0):
```
experiment id=5 status=completed decision=control
everyone is back on the control: 20 of 20 probe identities
recorded in data/logs/skill-demo-approvals.log
```

`data/logs/skill-demo-approvals.log` now holds two lines (environment key elided here):
```
2026-11-26T21:09:30Z  start  env=<staging key>  flag=booking_form  experiment=5  by=unattended (environment listed in FX_UNATTENDED_ENVS)  spec=experiments/booking_form.json
2026-11-26T21:18:33Z  stop   env=<staging key>  flag=booking_form  experiment=5  by=not required to stop
```

## 3. Why I stopped

Bookings held (100% correct and completed in both arms) and the sample ratio was fine, but Guest tokens came out `GUARDRAIL BREACHED` at +22.1% [+15.9%, +28.3%]. SKILL.md says shipping over a breached guardrail needs the user's acceptance plus `--force`, which nobody can give in an unattended sandbox. I chose `fx stop` because it is the one ending the skill says is always allowed and needs no approval; whether to accept the token cost is the owner's call.

## 4. SKILL.md: what was unclear, missing or wrong

Nothing I exercised was factually wrong. The problems are gaps, and most are in the unattended path this job depends on.

**A. Unattended mode is underspecified (the biggest gap).**
- Steps 4 and 7 say "Stop and ask. Do not start without their answer" with no pointer to the exception, which appears only later under Safety rules. An agent reading top-down halts at step 4.
- The exception is worded around `--approved-by`: "Never pass `--approved-by` with a name the user did not give... The only exception is an environment listed in `FX_UNATTENDED_ENVS`". Read literally, that says you may invent a name there. It never says what to pass.
- `--help` says start "needs --approved-by" and "Never invent one", and the last line of `fx check` says "ask, then: fx start --approved-by NAME" even in the unattended environment.
- I guessed and omitted the option. That worked and logged `by=unattended (environment listed in FX_UNATTENDED_ENVS)`. Suggested text: "In an environment listed in `FX_UNATTENDED_ENVS`, omit `--approved-by`; fx records `by=unattended`."
- There is no decision rule for step 7 without a human. I had to infer that `--force` is never allowed unattended. Suggested text: "Unattended: never `--force`. If ship would be refused, run `fx stop` and report."

**B. `fx stop` versus `fx ship --winner control` is not explained.**
- Stop is presented only as an emergency brake ("if anything looks wrong after the start").
- Ship "refuses... a breached guardrail" without saying whether that also applies to `--winner control`, which is the natural choice when the variation breaches.
- Stop printed `status=completed decision=control`, which looks like what a control ship would record. If the two are equivalent, say so; if a control ship is refused on a breach, say that.

**C. Reading results when the primary metric is a guardrail.**
- "The first metric is the primary one" holds for the spec, but `fx results` prints in a different order ("Booking completed" before "Booking correct", apparently alphabetical) and does not mark the primary. I had to go back to the spec to apply the primary-metric rule.
- This spec's primary is `not_decrease`, so its verdict is `guardrail ok`. SKILL.md only covers a primary that is `inconclusive` (wait). It does not say whether `guardrail ok` on the primary is enough to ship. With four guardrail metrics nothing can ever be `WINNING`, so if tokens had held I could not have told from the doc whether shipping `accessible` was allowed.
- `chance N%` is never defined, and neither is the threshold between `guardrail ok` and `GUARDRAIL BREACHED`. I cannot explain to a user why "Guest steps... chance 28.8%" is ok.
- `lift +0% [+0%, +0%] chance 50% guardrail ok` for 63/63 against 57/57 is a zero-variance interval, and there is no guidance on minimum sample size or when a guardrail verdict can be trusted.
- Step 6 does not mention the `sample ratio:` and `as of` lines, though step 7 depends on the former.

**D. Results vanish once the experiment ends.** After the stop, `fx results` and `fx status` only say "no experiment is running" (exit 1). SKILL.md should say to save the `fx results` output before `ship` or `stop`.

**E. Where to run from, and prerequisites.**
- `scripts/fx` is relative to the skill folder, but `experiments/<flag>.json` and `./experiment-approvals.log` are relative to the current directory. The doc never says "run from the repo root as `<skill dir>/scripts/fx`"; I guessed.
- "Set the environment once" fails where shell state does not persist. Mention `-e KEY` or repeating the export.
- SKILL.md does not mention CLI credentials or project context; only `--help` does. Without your prefix (`source .flagsmith/flagsmith.env`, PATH) I would not have known what was needed.

**F. `allowed-tools` does not cover the skill's own script.** It lists `Bash(flagsmith:*) Bash(jq:*) Bash(git:*) Read`, yet every step runs `scripts/fx`. Nothing blocked me here, but a harness that enforces the list would prompt or deny on every step.

**G. Keys and the approvals log.**
- "`fx` never prints keys. Do not print or commit them either" sits next to "Commit [the approvals log] with the spec", and every log line contains `env=<client-side environment key>`. Say which keys are secret (server-side keys, API tokens) and that the client-side key is not.
- `--log` appears only in `--help`.

**H. Rehearsal and check prove less than the doc implies.**
- Before start everyone gets the control, so the rehearsal only exercises the control path. The variation's instrumentation is untested until the split is live, and the doc gives no way to rehearse it or advice to watch the first variation exposures.
- "event X has been received here" passes on old data. Staging already had two pilots, so the check did not prove my rehearsal landed. Say "has ever been received", or print a last-seen time.
- Missing reassurance: traffic sent before the start is not counted. Results had n=120, the main run only.

**I. `fx status` lags.** It showed `accessible=56 control=63` during the run and was still showing that two minutes after `fx results` and the harness both had 57/63. The doc presents status as the exposure count with no caveat. Its exit 1 when no experiment is running could also read as a failure.

**J. Step 8 (clean up).** There is no command for "retire the flag", and nothing says to skip clean-up after a stop or a sandbox rehearsal, where deleting code or the flag would be wrong. I skipped it.

**What worked well:** the "next:" hints, the probe-identity confirmations, the verdict words and the sample-ratio line were enough to run the whole loop without the reference doc. The "apply an existing spec to another environment" tip worked verbatim and left the spec file unchanged.

## Other notes

- **Working-tree changes that are not mine.** While I worked, `guests/guest.mjs` was modified (21:10:43Z, during the 120-guest run) and `scripts/demo.sh`, `scripts/report.mjs`, `video/` and `data/report-test/` appeared. I left them alone. The `guest.mjs` diff adds an opt-in `recorder` hook with unchanged defaults, and the experiment saw exactly 120 exposures matching my tally, so the run was not affected.
- **Files I created.** All are under `data/`: the two guest logs, `data/logs/skill-demo-approvals.log`, and the transcripts the harness wrote to `data/runs/skilldemo-rehearsal-1126` and `data/runs/skilldemo-main-1126`. Nothing was committed, and `.env` was not read.
