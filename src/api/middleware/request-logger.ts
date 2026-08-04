import type { RequestHandler } from 'express';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('http');

export const requestLogger: RequestHandler = (request, response, next) => {
  const startedAt = Date.now();

  response.on('finish', () => {
    logger.info(
      {
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'HTTP request completed',
    );
  });

  next();
};
