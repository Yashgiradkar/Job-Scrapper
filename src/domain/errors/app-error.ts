export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational: boolean;
  readonly cause?: unknown;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      isOperational?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.isOperational = options.isOperational ?? true;
    this.cause = options.cause;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      statusCode: 500,
      code: 'CONFIG_ERROR',
      isOperational: false,
      cause,
    });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      cause,
    });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} '${identifier}' not found`
      : `${resource} not found`;

    super(message, {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
}

export class ScraperError extends AppError {
  readonly scraperName: string;

  constructor(scraperName: string, message: string, cause?: unknown) {
    super(`Scraper '${scraperName}' failed: ${message}`, {
      statusCode: 500,
      code: 'SCRAPER_ERROR',
      cause,
    });
    this.scraperName = scraperName;
  }
}

export class ApplicationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, {
      statusCode: 422,
      code: 'APPLICATION_ERROR',
      cause,
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
