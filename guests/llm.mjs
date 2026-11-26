// Minimal client for any OpenAI-compatible chat completions endpoint.
// Configured entirely by environment variables:
//   OPENAI_BASE_URL   e.g. https://api.openai.com/v1
//   OPENAI_API_KEY
//   OPENAI_MODEL

export function llmConfig() {
  const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '');
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error('Set OPENAI_BASE_URL, OPENAI_API_KEY and OPENAI_MODEL (see .env.example).');
  }
  return { baseUrl, apiKey, model };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One chat completion that must come back as a JSON object.
// Retries on rate limits, server errors and network failures.
export async function chatJSON({ messages, temperature = 0.7, maxTokens = 1200 }, config = llmConfig()) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await sleep(800 * 2 ** (attempt - 1) + Math.random() * 400);
    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`LLM endpoint returned ${res.status}`);
        continue;
      }
      if (!res.ok) throw Object.assign(new Error(`LLM endpoint returned ${res.status}: ${(await res.text()).slice(0, 200)}`), { fatal: true });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      return {
        json: parseJSONObject(content),
        raw: content,
        usage: { prompt: data.usage?.prompt_tokens ?? 0, completion: data.usage?.completion_tokens ?? 0 },
      };
    } catch (err) {
      if (err.fatal) throw err;
      lastError = err;
    }
  }
  throw new Error(`LLM call failed after retries: ${lastError?.message}`);
}

// Models sometimes wrap JSON in prose or code fences; take the first balanced object.
export function parseJSONObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
