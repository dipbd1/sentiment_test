import { HttpError } from '../lib/httpError.js';

export function validate(schema) {
  return function validateRequest(req, res, next) {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join('; ');
      next(new HttpError(400, 'VALIDATION_ERROR', message));
      return;
    }
    req.body = result.data;
    next();
  };
}
