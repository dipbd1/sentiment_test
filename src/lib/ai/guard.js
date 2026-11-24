const SAFE_RESPONSE = 'No account action was taken.';
const SUBJECT_SOURCE = '(?:withdrawals?|deposits?|bonuses|bonus|account\\s+changes?)';
const ACTION_SOURCE = '(?:approved|completed|processed)';
const COMPLETE_SOURCE = '(?:is|was|were|been|now|got|gets|successfully)\\s+complete';
const NEGATION_SOURCE = '(?:not|no|never|cannot|can\'t|won\'t|without|unable|didn\'t|hasn\'t|haven\'t|wasn\'t|weren\'t|isn\'t|aren\'t)';
const WINDOW = 80;

export function guardAnalysis(analysis) {
  if (!claimsPerformedAction(analysis.response)) {
    return fiveFields(analysis);
  }
  return {
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    priority: analysis.priority,
    language: analysis.language,
    response: SAFE_RESPONSE,
  };
}

function claimsPerformedAction(response) {
  if (typeof response !== 'string' || response.length === 0) {
    return false;
  }

  const subjects = [...response.matchAll(new RegExp(`\\b${SUBJECT_SOURCE}\\b`, 'gi'))];
  const actions = [
    ...response.matchAll(new RegExp(`\\b${ACTION_SOURCE}\\b`, 'gi')),
    ...response.matchAll(new RegExp(`\\b${COMPLETE_SOURCE}\\b`, 'gi')),
  ];
  if (subjects.length === 0 || actions.length === 0) {
    return false;
  }

  const negation = new RegExp(`\\b${NEGATION_SOURCE}\\b`, 'i');
  for (const subject of subjects) {
    for (const action of actions) {
      if (Math.abs(subject.index - action.index) > WINDOW) {
        continue;
      }
      const start = Math.min(subject.index, action.index);
      const end = Math.max(subject.index + subject[0].length, action.index + action[0].length);
      const between = response.slice(start, end);
      const actionPrefix = response.slice(Math.max(0, action.index - 24), action.index);
      if (negation.test(between) || negation.test(actionPrefix)) {
        continue;
      }
      return true;
    }
  }
  return false;
}

function fiveFields(analysis) {
  return {
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    priority: analysis.priority,
    language: analysis.language,
    response: analysis.response,
  };
}
