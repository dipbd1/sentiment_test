import { ttlToMs } from './ttl.js';

const cookieBase = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
};

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie('access_token', accessToken, {
    ...cookieBase,
    path: '/',
    maxAge: ttlToMs(process.env.ACCESS_TOKEN_TTL || '15m'),
  });
  res.cookie('refresh_token', refreshToken, {
    ...cookieBase,
    path: '/api/auth',
    maxAge: ttlToMs(process.env.REFRESH_TOKEN_TTL || '7d'),
  });
}

export function clearAuthCookies(res) {
  res.clearCookie('access_token', {
    ...cookieBase,
    path: '/',
  });
  res.clearCookie('refresh_token', {
    ...cookieBase,
    path: '/api/auth',
  });
}

export function readCookies(req) {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }

  const cookies = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) {
      continue;
    }
    cookies[name] = decodeURIComponent(value);
  }
  return cookies;
}
