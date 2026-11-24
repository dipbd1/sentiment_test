const DEFAULT_ANALYSIS = {
  intent: 'withdrawal_issue',
  sentiment: 'negative',
  priority: 'high',
  language: 'English',
  response: 'We understand your concern. Let us check your withdrawal status.',
};

let script = null;
let lastCall = null;

export function setMockBehavior(behavior) {
  script = behavior ?? null;
}

export function resetMock() {
  script = null;
  lastCall = null;
}

export function getLastMockCall() {
  return lastCall;
}

export function createMockProvider() {
  return {
    async complete({ system, messages, signal }) {
      lastCall = { system, messages, signal };
      return renderBehavior(takeBehavior(), signal);
    },
  };
}

function takeBehavior() {
  if (!script) {
    return null;
  }
  if (script.type !== 'sequence') {
    return script;
  }

  if (!Array.isArray(script.values) || script.values.length === 0) {
    throw new Error('Mock sequence exhausted');
  }
  return script.values.shift();
}

async function renderBehavior(behavior, signal) {
  if (!behavior) {
    return JSON.stringify(DEFAULT_ANALYSIS);
  }
  if (behavior.type === 'json') {
    return JSON.stringify(behavior.value);
  }
  if (behavior.type === 'text') {
    return typeof behavior.value === 'string' ? behavior.value : String(behavior.value ?? '');
  }
  if (behavior.type === 'abort') {
    await waitForAbort(signal);
    return '';
  }
  if (behavior.type === 'sequence') {
    throw new Error('Nested mock sequence is not supported');
  }
  throw new Error(`Unsupported mock behavior: ${behavior.type}`);
}

function waitForAbort(signal) {
  if (!signal) {
    return Promise.reject(createAbortError());
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        reject(createAbortError());
      },
      { once: true },
    );
  });
}

function createAbortError() {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}
