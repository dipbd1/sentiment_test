import { createChatCompletionsProvider } from './chatCompletions.js';
import { createGeminiProvider } from './gemini.js';
import { createMockProvider, getLastMockCall, resetMock, setMockBehavior } from './mock.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
const OPENAI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const OLLAMA_MODEL = 'llama3.2';

export function createProvider(name, env = process.env) {
  const providerName = normalizeName(name);
  if (providerName === 'mock') {
    return createMockProvider();
  }
  if (providerName === 'gemini') {
    return createGeminiProvider({
      apiKey: env.AI_API_KEY || '',
      model: env.AI_MODEL || GEMINI_MODEL,
    });
  }
  if (providerName === 'ollama') {
    return createChatCompletionsProvider({
      baseUrl: env.AI_BASE_URL || OLLAMA_BASE_URL,
      apiKey: env.AI_API_KEY || '',
      model: env.AI_MODEL || OLLAMA_MODEL,
    });
  }
  if (providerName === 'openai') {
    return createChatCompletionsProvider({
      baseUrl: env.AI_BASE_URL || OPENAI_BASE_URL,
      apiKey: env.AI_API_KEY || '',
      model: env.AI_MODEL || OPENAI_MODEL,
    });
  }
  throw new Error(`Unknown AI provider: ${name}`);
}

export function getProvider(env = process.env) {
  return createProvider(selectedProvider(env), env);
}

function selectedProvider(env) {
  const configured = normalizeName(env.AI_PROVIDER);
  if (configured) {
    return configured;
  }
  if (env.NODE_ENV === 'test') {
    return 'mock';
  }
  return 'openai';
}

function normalizeName(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

export { analyzeMessage } from './analyze.js';
export { getLastMockCall, resetMock, setMockBehavior };
