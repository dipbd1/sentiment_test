const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export function createGeminiProvider({ apiKey = '', model = 'gemini-2.0-flash' } = {}) {
  return {
    async complete({ system, messages, signal }) {
      const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: system }],
            },
            contents: messages.map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: typeof message.content === 'string' ? message.content : '' }],
            })),
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
        throw new Error('Gemini response was not JSON');
      }
      return readCandidateText(payload);
    },
  };
}

function readCandidateText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error('Gemini response did not include content');
  }
  return parts
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function sanitizeProviderError(error, secret) {
  if (!(error instanceof Error)) {
    return new Error('Gemini request failed');
  }
  if (secret && error.message.includes(secret)) {
    const sanitized = new Error('Gemini request failed');
    sanitized.name = error.name;
    return sanitized;
  }
  return error;
}
