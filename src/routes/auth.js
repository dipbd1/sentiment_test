import { Router } from 'express';
import { z } from 'zod';
import { User } from '../db/index.js';
import { clearAuthCookies, readCookies, setAuthCookies } from '../lib/cookies.js';
import { GENERIC_AUTH_MESSAGE, HttpError } from '../lib/httpError.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import {
  createRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../lib/tokens.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/\d/, 'Password must include a digit');

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email must be valid'),
  password: passwordSchema,
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email must be valid'),
  password: z.string().min(1, 'Password is required'),
});

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

async function sendSession(res, user, statusCode) {
  const accessToken = signAccessToken(user);
  const refreshToken = await createRefreshToken(user.id);
  setAuthCookies(res, { accessToken, refreshToken });
  res.status(statusCode).json({
    user: publicUser(user),
    accessToken,
  });
}

router.post('/register', validate(registerSchema), async (req, res) => {
  const passwordHash = await hashPassword(req.body.password);
  const user = await User.create({
    email: req.body.email,
    passwordHash,
    role: 'user',
  });
  await sendSession(res, user, 201);
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const user = await User.scope('withPassword').findOne({
    where: { email: req.body.email },
  });
  const passwordMatches = user
    ? await verifyPassword(req.body.password, user.passwordHash)
    : false;

  if (!user || !passwordMatches) {
    throw new HttpError(401, 'UNAUTHORIZED', GENERIC_AUTH_MESSAGE);
  }

  await sendSession(res, user, 200);
});

router.post('/refresh', async (req, res) => {
  const cookies = readCookies(req);
  const rotated = await rotateRefreshToken(cookies.refresh_token);
  const user = await User.findByPk(rotated.userId);
  if (!user) {
    throw new HttpError(401, 'UNAUTHORIZED', GENERIC_AUTH_MESSAGE);
  }

  const accessToken = signAccessToken(user);
  setAuthCookies(res, {
    accessToken,
    refreshToken: rotated.refreshToken,
  });
  res.json({
    user: publicUser(user),
    accessToken,
  });
});

router.post('/logout', async (req, res) => {
  const cookies = readCookies(req);
  await revokeRefreshToken(cookies.refresh_token);
  clearAuthCookies(res);
  res.status(204).end();
});

export default router;
