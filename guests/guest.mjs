// One AI guest: a language model that operates a real browser to carry out a
// booking brief.
//
// The guest perceives each page the way mainstream browser agents do, through
// Playwright's AI-mode accessibility snapshot (the representation Playwright's
// own MCP server gives to coding agents). It never sees pixels, the DOM, or
// which version of the form it was served.

import { chatJSON } from './llm.mjs';

export const SYSTEM_PROMPT = `You are an AI assistant that completes tasks on websites for a customer by operating a web browser.

Each turn you are given the customer's task, the actions you have taken so far with their results, and the current page as an accessibility snapshot. In the snapshot every line is an element: its role, its name in quotes if it has one, any states in square brackets, and a reference such as [ref=e12]. [cursor=pointer] means the element looks clickable.

Reply with exactly one JSON object and nothing else, in one of these forms:
{"thought": "<one short sentence>", "action": "click", "ref": "e12"}
{"thought": "<one short sentence>", "action": "fill", "ref": "e12", "text": "<text to type>"}
{"thought": "<one short sentence>", "action": "done"}
{"thought": "<one short sentence>", "action": "give_up"}

Rules:
- One action per reply. Use only refs that appear in the current snapshot.
- "fill" replaces whatever is in a text field.
- After each action you will see the updated page. Check that it shows what you intended before moving on.
- Follow the customer's task exactly and do not book anything they did not ask for.
- Use "done" only when the page confirms the task is complete. Use "give_up" if it cannot be completed.`;

// The snapshot line for a ref, so the transcript records what the guest
// believed it was acting on.
function describeRef(snapshot, ref) {
  const line = snapshot.split('\n').find((l) => l.includes(`[ref=${ref}]`));
  if (!line) return null;
  return line.trim().replace(/^- /, '').replace(/:$/, '').slice(0, 140);
}

function userMessage({ task, steps, observation, lastResult }) {
  const history = steps.length
    ? steps
        .map((s) => {
          if (s.invalid) return `${s.n}. (invalid reply) -> ${s.result}`;
          const what = s.action === 'fill' ? `fill ${s.target ?? s.ref} with "${s.text}"` : `${s.action} ${s.target ?? s.ref}`;
          return `${s.n}. ${what} -> ${s.result}`;
        })
        .join('\n')
    : '(none yet)';
  return `TASK
${task}

ACTIONS SO FAR
${history}

RESULT OF YOUR LAST ACTION
${lastResult}

CURRENT PAGE
URL: ${observation.url}
Title: ${observation.title}
Snapshot:
${observation.snapshot}

Reply with one JSON object.`;
}

// Playwright's references are opaque and vary in shape between pages (e12 on
// one, f1e41 on the next). The guest is shown clean sequential references
// instead, and `refs` maps each one back to Playwright's own.
async function observe(page) {
  const refs = new Map();
  const raw = await page.ariaSnapshot({ mode: 'ai' });
  const snapshot = raw.replace(/\[ref=([^\]]+)\]/g, (_, real) => {
    const shown = `e${refs.size + 1}`;
    refs.set(shown, real);
    return `[ref=${shown}]`;
  });
  return { url: page.url(), title: await page.title(), snapshot, refs };
}

async function settle(page) {
  await page.waitForLoadState('load').catch(() => {});
  await page.waitForTimeout(120);
}

async function act(page, action, refs) {
  const real = typeof action.ref === 'string' ? refs.get(action.ref) : undefined;
  if (!real) return `Error: there is no element with ref ${JSON.stringify(action.ref ?? null)} in the current snapshot.`;
  const target = page.locator(`aria-ref=${real}`);
  try {
    if ((await target.count()) === 0) return `Error: there is no element with ref ${action.ref} in the current snapshot.`;
    if (action.action === 'click') {
      if (await target.isDisabled().catch(() => false)) return 'Error: that element is disabled.';
      await target.click({ timeout: 4000 });
      await settle(page);
      return 'Clicked.';
    }
    await target.fill(String(action.text ?? ''), { timeout: 4000 });
    await settle(page);
    return 'Filled.';
  } catch (err) {
    const message = String(err.message).split('\n')[0];
    if (/not an <input>|not editable|cannot be filled/i.test(err.message)) return 'Error: that element is not a text field.';
    return `Error: ${message.slice(0, 160)}`;
  }
}

// Recorded for the run log only; never shown to the guest.
async function servedVersion(page) {
  if (!new URL(page.url()).pathname.startsWith('/book')) return null;
  return page
    .evaluate(() => (document.querySelector('form.col-main') ? 'accessible' : document.querySelector('div.col-main') ? 'classic' : null))
    .catch(() => null);
}

export async function runGuest({ browser, base, brief, task, llm, maxSteps = 40, temperature = 0.7, timeoutMs = 6 * 60_000 }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  const record = {
    guestId: brief.guestId,
    brief,
    task,
    variant: null,
    outcome: 'max_steps', // done | give_up | max_steps | timeout | error
    actions: 0, // browser actions attempted (clicks and fills)
    turns: 0, // model replies
    tokens: { prompt: 0, completion: 0 },
    steps: [],
    startedAt: new Date().toISOString(),
  };
  const deadline = Date.now() + timeoutMs;
  let lastResult = 'You have just arrived at the website.';

  try {
    await page.goto(`${base}/?guest=${encodeURIComponent(brief.guestId)}`, { waitUntil: 'load' });
    for (let n = 1; n <= maxSteps; n++) {
      if (Date.now() > deadline) {
        record.outcome = 'timeout';
        break;
      }
      const observation = await observe(page);
      record.variant ??= await servedVersion(page);

      const reply = await chatJSON(
        {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage({ task, steps: record.steps, observation, lastResult }) },
          ],
          temperature,
        },
        llm,
      );
      record.turns++;
      record.tokens.prompt += reply.usage.prompt;
      record.tokens.completion += reply.usage.completion;

      const a = reply.json;
      if (!a || !['click', 'fill', 'done', 'give_up'].includes(a.action)) {
        lastResult = 'Error: your reply was not a valid action. Reply with one JSON object in one of the given forms.';
        record.steps.push({ n, invalid: true, raw: reply.raw.slice(0, 300), result: lastResult });
        continue;
      }
      const thought = typeof a.thought === 'string' ? a.thought.slice(0, 300) : '';
      if (a.action === 'done' || a.action === 'give_up') {
        record.outcome = a.action;
        record.steps.push({ n, thought, action: a.action, url: observation.url });
        break;
      }
      const targetLine = typeof a.ref === 'string' ? describeRef(observation.snapshot, a.ref) : null;
      lastResult = await act(page, a, observation.refs);
      record.actions++;
      record.steps.push({
        n,
        thought,
        action: a.action,
        ref: a.ref,
        target: targetLine,
        ...(a.action === 'fill' ? { text: String(a.text ?? '') } : {}),
        result: lastResult,
        url: page.url(),
      });
    }
    record.variant ??= await servedVersion(page);
    record.finalUrl = page.url();
  } catch (err) {
    record.outcome = 'error';
    record.error = String(err.message).slice(0, 300);
  } finally {
    record.finishedAt = new Date().toISOString();
    await context.close().catch(() => {});
  }
  return record;
}
