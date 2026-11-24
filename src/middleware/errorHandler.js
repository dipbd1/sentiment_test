import { UniqueConstraintError } from 'sequelize';
import { HttpError } from '../lib/httpError.js';

function isEmailConflict(error) {
  if (!(error instanceof UniqueConstraintError)) {
    return false;
  }
  const fieldNames = error.fields ? Object.keys(error.fields) : [];
  if (fieldNames.some((name) => name.includes('email'))) {
    return true;
  }
  const text = `${error.message} ${error.parent?.message ?? ''}`;
  return text.includes('email');
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isEmailConflict(error)) {
    res.status(409).json({
      error: {
        message: 'Email already registered',
        code: 'CONFLICT',
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      error: {
        message: error.message,
        code: error.code,
      },
    });
    return;
  }

  if (error instanceof SyntaxError && error.status === 400) {
    res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
}
