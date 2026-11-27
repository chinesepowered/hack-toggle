# The two skill tests

Each test gave a fresh coding agent one prompt and no other help. The prompt said where the skill was, named the steps of the job (apply the existing spec, rehearse with 2 guests, check, start, send 120 guests, read the results, decide), gave the Staging environment key, said that Staging had been listed as a sandbox, and gave the command that sends AI guests through the booking site. How to do each step, and what the results allow, had to come from the skill. The agent was told not to read the `fx` source. The second prompt also asked for one attempt to ship the variation, so that the refusal would be exercised, and for no exploratory commands.

| | Skill version | Tool calls | Tokens | Time | How it ended |
|---|---|---|---|---|---|
| [Test 1](test-1.md) | 1.0 | 26 | 117,084 | 13 min | Results read; token guardrail breached; the agent stopped and reported. |
| [Test 2](test-2.md) | 1.1 | 15 | 104,707 | 18 min | Results read; the agent tried to ship the variation, `fx` refused, and it ran `fx stop`. |

Tool calls, tokens and time are the totals reported by the agent harness for the whole run. The tokens include the agent's own system prompt on every turn and its written report, and the time includes the guests: 120 of them in each test, which took five and a half minutes in the first and ten in the second.

Each log has the prompt as it was given, every command the agent ran with the start of its output, and the agent's report. The agent's private reasoning and the harness's own bookkeeping messages are left out, the common prefix of the commands is removed, and the path of a scratch folder is shortened to `<scratch>`. Nothing else is edited.

Between the two tests we rewrote `SKILL.md` and parts of `fx` from the first agent's report, and the second prompt asked for no exploratory commands. The second agent needed 11 fewer tool calls: it made no exploratory checks (`fx --help`, listing files, reading the spec) and fewer status calls. With two things changed at once, the drop cannot be credited to the rewrite alone. The skill was revised once more after the second agent's report; the versions the agents read were 4,045 and 5,880 characters long, and the current one is 6,342.

The guests' transcripts and tallies for each test are in [experiments/other-runs](../../experiments/other-runs), as `skill-test-1` and `skill-test-2`.
