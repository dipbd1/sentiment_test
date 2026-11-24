export function createChatCompletionsProvider({ baseUrl, apiKey, model }) {
  return {
    async complete({ system, messages, signal }) {
      const headers = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      let response;
      try {
        response = await fetch(chatCompletionsUrl(baseUrl), {
          method: 'POST',
          signal,
          headers,
          body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: system }, ...messages],
          }),
        });
      } catch (error) {
        throw sanitizeProviderError(error, apiKey);
      }

      if (!response.ok) {
        await response.text().catch(() => '');
        throw new Error(`Provider request failed with status ${response.status}`);
      }

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Provider response was not JSON');
      }
      return readMessageText(payload);
    },
  };
}

function chatCompletionsUrl(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  return `${base}/chat/completions`;
}

function readMessageText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part.text === 'string') {
          return part.text;
        }
        return '';
      })
      .join('');
  }
  throw new Error('Provider response did not include message content');
}

function sanitizeProviderError(error, secret) {
  if (!(error instanceof Error)) {
    return new Error('Provider request failed');
  }
  if (secret && error.message.includes(secret)) {
    const sanitized = new Error('Provider request failed');
    sanitized.name = error.name;
    return sanitized;
  }
  return error;
}
