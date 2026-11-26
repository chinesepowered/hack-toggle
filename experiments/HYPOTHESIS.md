# Pre-registration: the accessible booking form and AI guests

This file and `booking_form.json` were committed before the production experiment was started. The commit time is the evidence; nothing below was edited after results came in. Results are in `results/`.

## The decision this experiment informs

Capybara Onsen wants to ship the accessible version of its booking form to everyone. That release is for people. This experiment asks what it does to a different kind of visitor: AI agents booking on a customer's behalf.

## The two versions

Both are served by the flag `booking_form` and are pixel-identical (`scripts/parity.mjs` checks this at three stages).

- **classic** (control): clickable `<div>`s, visual labels that are not associated with their inputs, icon-only controls with no name, and state (selected, ticked, sold out) shown only through styling. These are the failure types WebAIM's 2026 survey of the top million home pages finds most often in markup: missing form labels on 51% of pages and empty buttons on 30.6%.
- **accessible** (variation): the same design built from `<button>`, `<label>`, headings and groups, with names for icon-only controls and ARIA state.

## What we believed at first, and what the pilots showed

We started out expecting the accessible version to raise correct bookings by AI guests. Two pilots in the Staging environment changed that.

- **Pilot 1 (80 guests)** exposed two problems in our own set-up, both fixed before pilot 2: the guests were shown Playwright's raw element references, whose format changes between pages and caused about one wasted turn per guest; and several accessible controls carried an `aria-label` that merely repeated their visible text.
- **Pilot 2 (60 guests)** ran on the fixed set-up. Correct bookings were 25 of 25 on classic and 35 of 35 on accessible. Actions per guest were equal (11.7 and 11.5). Tokens per guest were about 18% higher on accessible (37,400 against 31,600), because its accessibility snapshot is longer on every step.

With both versions at 100%, "accessible raises bookings" cannot be tested on this form with this guest model. What the release decision actually needs is whether the accessible version does any harm to AI guests, and what it costs them. That is what we register.

## Hypotheses

| | Metric (event) | Aggregation | Registered expectation |
|---|---|---|---|
| H1, primary | Correct booking (`booking_correct`) | occurrence | should not decrease |
| H2 | Booking completed (`booking_completed`) | occurrence | should not decrease |
| H3 | Guest steps (`guest_steps`) | mean | should not increase |
| H4 | Guest tokens (`guest_tokens`) | mean | should not increase |

Our prediction: H1 to H3 hold, and H4 is breached by roughly the 18% seen in pilot 2.

## Design

- **Units.** AI guests. Each is the model `Qwen/Qwen3.8-27B` (temperature 0.7) driving a real Chromium browser in a fresh context, with its own identity. It reads each page as Playwright's AI-mode accessibility snapshot and replies with one click or fill at a time, up to 40 turns. It never sees pixels, the DOM, or which version it was served.
- **Population.** 300 guests, briefs from `guests/briefs.mjs` with seed 2026, site date fixed at 2026-11-27.
- **Assignment.** A Flagsmith experiment on `booking_form`, 100% of identities enrolled, split 50/50.
- **Events.** The exposure is recorded when the site reads the flag with `getExperimentFlag` to render the form. The site sends `booking_completed` when it stores a booking. After the run, the harness compares stored bookings with each brief and sends `booking_correct`, `guest_steps` and `guest_tokens`.
- **Correct** means the guest made exactly one booking and it matches the brief on every field: day, time (the preferred time, or the next later one if that is sold out), number of guests, bath, extras, name and email.

## Analysis and decision rule

- Results are Flagsmith's, as printed by `fx results`: lift, 95% credible interval and chance to beat the control, with its documented thresholds (95% and 5%).
- One look, after all 300 guests have finished. There is no stopping rule based on interim results.
- The sample-ratio check must pass.
- **Ship the accessible version if H1 and H2 hold.** A breach of H3 or H4 does not block the release on its own, because the release is for people, but it must be accepted by a person explicitly: `fx ship` refuses until someone does.
- Guests who never reach the form have no exposure and are not in the experiment. A run in which the site reports any control fallback (Flagsmith unreachable) is discarded whole.

## Limits we already know about

- One guest model, one way of perceiving pages (the accessibility snapshot, no screenshots) and one form. The form echoes every selection as text in a summary card, which makes state readable in both versions.
- Flagsmith's interval is a normal approximation. When both versions convert at 100% it collapses to zero width, so we will report an exact bound next to it.
