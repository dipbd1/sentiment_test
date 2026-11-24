import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { loadSupportHistory, saveSupportExchange } from '../db/index.js';
import { analyzeMessage } from '../lib/ai/index.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const analyzeSchema = z.object({
  userId: z.string().min(1).max(64),
  message: z.string().min(1).max(4000),
});

function readSupportRateLimit() {
  const parsed = Number(process.env.SUPPORT_RATE_LIMIT);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  if (process.env.NODE_ENV === 'test') {
    return 10000;
  }
  return 10;
}

const analyzeLimiter = rateLimit({
  windowMs: 60_000,
  limit() {
    return readSupportRateLimit();
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests',
      code: 'RATE_LIMITED',
    },
  },
  keyGenerator(req) {
    return `${req.ip}:${req.user.id}`;
  },
});

function fiveFields(analysis) {
  return {
    intent: analysis.intent,
    sentiment: analysis.sentiment,
    priority: analysis.priority,
    language: analysis.language,
    response: analysis.response,
  };
}

router.post(
  '/analyze',
  authenticate,
  analyzeLimiter,
  validate(analyzeSchema),
  async (req, res) => {
    const history = await loadSupportHistory(req.body.userId);
    const analysis = await analyzeMessage({
      message: req.body.message,
      history,
    });
    await saveSupportExchange({
      customerUserId: req.body.userId,
      message: req.body.message,
      analysis,
    });
    res.json(fiveFields(analysis));
  },
);

export default router;
