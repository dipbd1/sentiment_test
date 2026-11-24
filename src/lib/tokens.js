import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RefreshToken, sequelize } from '../db/index.js';
import { GENERIC_AUTH_MESSAGE, HttpError } from './httpError.js';
import { ttlToMs } from './ttl.js';

function accessSecret() {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET is not set');
  }
  return secret;
}

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
    },
    accessSecret(),
    {
      expiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
      algorithm: 'HS256',
    },
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, accessSecret(), { algorithms: ['HS256'] });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const id = Number(payload.sub);
  if (!Number.isInteger(id) || typeof payload.email !== 'string' || typeof payload.role !== 'string') {
    throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  return {
    id,
    email: payload.email,
    role: payload.role,
  };
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function refreshExpiry() {
  return new Date(Date.now() + ttlToMs(process.env.REFRESH_TOKEN_TTL || '7d'));
}

function asDate(value) {
  if (value instanceof Date) {
    return value;
  }
  return new Date(value);
}

export async function createRefreshToken(userId) {
  const token = randomBytes(32).toString('base64url');
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: refreshExpiry(),
  });
  return token;
}

export async function rotateRefreshToken(rawToken) {
  if (!rawToken) {
    throw new HttpError(401, 'UNAUTHORIZED', GENERIC_AUTH_MESSAGE);
  }

  const tokenHash = hashToken(rawToken);
  const row = await RefreshToken.findOne({ where: { tokenHash } });
  if (!row) {
    throw new HttpError(401, 'UNAUTHORIZED', GENERIC_AUTH_MESSAGE);
  }

  if (row.revokedAt && row.replacedByTokenHash) {
    await RefreshToken.destroy({ where: { userId: row.userId } });
    throw new HttpError(401, 'UNAUTHORIZED', GENERIC_AUTH_MESSAGE);
  }

  const expiresAt = asDate(row.expiresAt);
  if (row.revokedAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new HttpError(401, 'UNAUTHORIZED', GENERIC_AUTH_MESSAGE);
  }

  const refreshToken = randomBytes(32).toString('base64url');
  const newHash = hashToken(refreshToken);

  await sequelize.transaction(async (transaction) => {
    await row.update(
      {
        revokedAt: new Date(),
        replacedByTokenHash: newHash,
      },
      { transaction },
    );
    await RefreshToken.create(
      {
        userId: row.userId,
        tokenHash: newHash,
        expiresAt: refreshExpiry(),
      },
      { transaction },
    );
  });

  return {
    userId: row.userId,
    refreshToken,
  };
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken) {
    return;
  }
  await RefreshToken.destroy({ where: { tokenHash: hashToken(rawToken) } });
}
