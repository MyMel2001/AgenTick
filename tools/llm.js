// LLM client wrapper for OpenAI-compatible endpoints

let fetch;
async function getFetch() {
  if (!fetch) { const mod = await import('node-fetch'); fetch = mod.default; }
  return fetch;
}

async function callLLM(messages, options = {}) {
  const f = await getFetch();
  const endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434/v1/chat/completions';
  const model = process.env.LLM_MODEL || 'llama3';
  const temperature = parseFloat(process.env.LLM_TEMPERATURE) || 0.7;
  const maxTokens = parseInt(process.env.LLM_CONTEXT_LENGTH) || 8192;

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.LLM_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.LLM_API_KEY}`;
  }

  const body = {
    model: options.model || model,
    messages,
    temperature: options.temperature !== undefined ? options.temperature : temperature,
    max_tokens: options.maxTokens || maxTokens,
    stream: false
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice || 'auto';
  }

  const response = await f(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    timeout: 120000
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data;
}

// Simplified call that just returns text
async function askLLM(systemPrompt, userMessage) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userMessage });

  const data = await callLLM(messages);
  return data.choices?.[0]?.message?.content || '';
}

module.exports = { callLLM, askLLM };
