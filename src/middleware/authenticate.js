import { readCookies } from '../lib/cookies.js';
import { HttpError } from '../lib/httpError.js';
import { verifyAccessToken } from '../lib/tokens.js';

function readBearer(req) {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header);
  return match ? match[1] : null;
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  let token = null;

  if (header) {
    token = readBearer(req);
    if (!token) {
      next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
      return;
    }
  } else {
    token = readCookies(req).access_token;
  }

  if (!token) {
    next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
  }
}
