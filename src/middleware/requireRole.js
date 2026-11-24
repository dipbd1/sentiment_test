import { HttpError } from '../lib/httpError.js';

export function requireRole(role) {
  return function requireRoleMiddleware(req, res, next) {
    if (!req.user || req.user.role !== role) {
      next(new HttpError(403, 'FORBIDDEN', 'Forbidden'));
      return;
    }
    next();
  };
}
