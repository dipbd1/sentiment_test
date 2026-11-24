import { FALLBACK_ANALYSIS } from './fallback.js';
import { guardAnalysis } from './guard.js';
import { getProvider } from './index.js';
import { buildMessages, buildRepairMessage, buildSystemPrompt } from './prompt.js';
import { analysisSchema } from './schema.js';

const DEFAULT_TIMEOUT_MS = 5000;

export async function analyzeMessage({ message, history } = {}) {
  try {
    const provider = getProvider();
    const system = buildSystemPrompt();
    const messages = buildMessages({ message, history });
    const firstRaw = await complete(provider, { system, messages });
    const first = parseAnalysis(firstRaw);
    if (first.ok) {
      return guardAnalysis(first.value);
    }

    const repairMessages = [
      ...messages,
      { role: 'assistant', content: typeof firstRaw === 'string' ? firstRaw : '' },
      { role: 'user', content: buildRepairMessage(first.error) },
    ];
    const secondRaw = await complete(provider, { system, messages: repairMessages });
    const second = parseAnalysis(secondRaw);
    if (!second.ok) {
      return fallback(`Invalid model output after repair: ${second.error}`);
    }
    return guardAnalysis(second.value);
  } catch (error) {
    return fallback(errorReason(error));
  }
}

async function complete(provider, { system, messages }) {
  const signal = AbortSignal.timeout(readTimeoutMs());
  return provider.complete({ system, messages, signal });
}

function readTimeoutMs() {
  const raw = process.env.AI_TIMEOUT_MS;
  if (raw === undefined || raw === '') {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

function parseAnalysis(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Model output was not text' };
  }
  try {
    const parsed = analysisSchema.safeParse(extractFirstJsonObject(raw));
    if (!parsed.success) {
      return { ok: false, error: formatIssues(parsed.error) };
    }
    return { ok: true, value: fiveFields(parsed.data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Model output was not valid JSON',
    };
  }
}

function extractFirstJsonObject(raw) {
  const text = raw.replace(/^\uFEFF/, '');
  const start = text.indexOf('{');
  if (start === -1) {
    throw new Error('Model output did not contain a JSON object');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(text.slice(start, index + 1));
      }
    }
  }
  throw new Error('Model output did not contain a complete JSON object');
}

function formatIssues(error) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}

function fiveFields(value) {
  return {
    intent: value.intent,
    sentiment: value.sentiment,
    priority: value.priority,
    language: value.language,
    response: value.response,
  };
}

function fallback(reason) {
  console.error('AI analysis fallback:', reason);
  return { ...FALLBACK_ANALYSIS };
}

function errorReason(error) {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}
