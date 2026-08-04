import type { ErrorRequestHandler } from 'express';
import { isAppError } from '../../domain/errors/app-error.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('http-error-handler');

export const errorHandler: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next,
) => {
  if (isAppError(error)) {
    const statusCode = error.statusCode;

    logger.warn(
      { err: error, statusCode, code: error.code },
      'Handled application error',
    );

    response.status(statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
    return;
  }

  logger.error({ err: error }, 'Unhandled application error');

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
};
