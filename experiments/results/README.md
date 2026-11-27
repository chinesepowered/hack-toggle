# Results: the accessible booking form and AI guests

The experiment registered in [../HYPOTHESIS.md](../HYPOTHESIS.md) ran in Production on 26 November 2026 from 23:49 to 23:59 UTC. Nelson approved the start. 300 AI guests went through, and the results were read once, after the last guest had finished, as registered.

## Flagsmith's verdict

As printed by `fx results` ([../booking_form.results.txt](../booking_form.results.txt)):

```
Booking correct (primary)  control 156/156 100%  accessible 144/144 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Booking completed  control 156/156 100%  accessible 144/144 100%  lift +0% [+0%, +0%]  chance 50%  guardrail ok
Guest steps  control n=156 mean 11.81  accessible n=144 mean 11.27  lift -4.6% [-7.9%, -1.3%]  chance 99.7%  guardrail ok
Guest tokens  control n=156 mean 32090.93  accessible n=144 mean 36464.77  lift +13.6% [+8.9%, +18.4%]  chance 0%  GUARDRAIL BREACHED
sample ratio: ok (control 156 / variation 144, expected 50/50, p=0.488)
```

| | Registered expectation | Result |
|---|---|---|
| H1, correct bookings | should not decrease | **Held.** 156 of 156 and 144 of 144. |
| H2, completed bookings | should not decrease | **Held.** The same counts. |
| H3, steps per guest | should not increase | **Held,** and went down: 4.6% fewer on accessible. |
| H4, tokens per guest | should not increase | **Breached.** 13.6% more on accessible. |

We predicted that H1 to H3 would hold and H4 would be breached by roughly 18%. The breach came in at 13.6%, with an interval that reaches 18.4%.

![Results figure](results.png)

## What the guests did

Every guest reached the form, made exactly one booking, and got it right. The versions differed in how they got there.

**On the classic form, 24 of 156 guests took a detour. On the accessible form, none of 144 did**: every accessible guest used the fewest actions its brief allowed.

- **21 of the 24 detours were sold-out times.** The classic form shows a sold-out time only by striking it through. A guest clicks it, nothing happens, and it tries again. From one transcript ([prod1_g0280](transcripts/prod1_g0280.json), 22 actions where 13 would do):

  > "1:00 PM didn't register in the summary, suggesting it's sold out. Trying the next later time, 2:30 PM."
  > "Time still shows 'Not chosen yet'; I'll try clicking 1:00 PM again to select it."

  Among guests whose preferred time was sold out, 21 of 36 detoured on the classic form and 0 of 35 on the accessible form, where the same time reads `radio "1:00 PM" [disabled]`.
- **The other 3 were the guest stepper.** Its plus and minus have no names on the classic form. From [prod1_g0097](transcripts/prod1_g0097.json), which then pressed minus by mistake and had to climb back:

  > "Guests still shows 5 after clicking e73; let me try the other button e71 to change the count."
  > "Guest count is 4 but I need 6, so I'll click the plus button to increase it."

**Bookings still came out right** because the form echoes every selection as text in a summary card. A guest that clicked the wrong thing could see that the summary had not changed, and tried something else.

**The accessible form costs more to read.** Its accessibility snapshot is longer: 2,897 prompt tokens per turn against 2,381, which is 22% more. Accessible guests needed slightly fewer turns (12.3 against 12.9) and wrote less on each one (75 completion tokens against 113), but that does not make up for the longer pages. The net is 13.6% more tokens per guest.

## Bounds on the booking rate

Flagsmith's interval for both booking metrics is `[+0%, +0%]`. It comes from a normal approximation, which has no width when every identity converts, so it overstates what 300 guests can show. Exact 95% lower bounds on each version's correct-booking rate are 97.7% for classic (156 of 156) and 97.5% for accessible (144 of 144). What the data support is that each version fails fewer than about 1 guest in 40, and that any difference between them is smaller than that.

## What was not registered

The detour counts, their classification and the token breakdown are exploratory. They were looked at after the results, to explain them. The four registered metrics and the decision rule were not changed.

## Files

| File | What it is |
|---|---|
| `log/` | The output of every command in the run, in order, including the refused ship attempt. |
| `guests.csv` | One row per guest: version, outcome, actions, extra actions, turns, tokens. |
| `summary.json` | Per-version totals, means and exact bounds. |
| `flagsmith-experiment.json`, `flagsmith-results.json` | The experiment and its results as Flagsmith's API returned them. |
| `transcripts/` | Seven complete guest transcripts: the shortest run on each version, the three longest detours, one stepper detour, and one accessible guest meeting a sold-out time. |
| `results.html`, `results.png` | The figure. |
| [`../approvals.tsv`](../approvals.tsv) | Who approved what, and what was refused. |
