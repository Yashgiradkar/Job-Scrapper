import pino, { type Logger, type LoggerOptions } from 'pino';
import { getConfig } from '../config/config.js';

function buildLoggerOptions(): LoggerOptions {
  const config = getConfig();
  const options: LoggerOptions = {
    level: config.logging.level,
  };

  if (config.nodeEnv === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };
  }

  return options;
}

export function createLogger(name: string): Logger {
  return pino(buildLoggerOptions()).child({ module: name });
}

export const logger = createLogger('app');
