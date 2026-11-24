import { z } from 'zod';

export const INTENTS = [
  'deposit_issue',
  'withdrawal_issue',
  'account_access',
  'bonus_query',
  'other',
];

export const SENTIMENTS = ['positive', 'neutral', 'negative'];

export const PRIORITIES = ['low', 'medium', 'high'];

export const analysisSchema = z
  .object({
    intent: z.enum(INTENTS),
    sentiment: z.enum(SENTIMENTS),
    priority: z.enum(PRIORITIES),
    language: z.string().trim().min(1),
    response: z.string().trim().min(1),
  })
  .strip();
