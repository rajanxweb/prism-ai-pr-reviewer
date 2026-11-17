import { pino, type Logger, type DestinationStream, type LoggerOptions } from 'pino';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id?: string;
      log?: Logger;
    }
  }
}

export const REDACTION_PATHS = [
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'headers["x-auth-token"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'key',
  'apiKey',
  '*.authorization',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.key',
  '*.apiKey',
];

export interface CreateLoggerOptions {
  level?: string;
  stream?: DestinationStream;
}

export const createLogger = (options: CreateLoggerOptions = {}): Logger => {
  const pinoOptions: LoggerOptions = {
    level: options.level ?? process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: REDACTION_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (options.stream) {
    return pino(pinoOptions, options.stream);
  }

  return pino(pinoOptions);
};

export const logger = createLogger();

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingId = req.headers['x-request-id'];
  const requestId =
    typeof incomingId === 'string' && incomingId.trim().length > 0 ? incomingId : randomUUID();

  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  req.log = logger.child({ requestId });
  next();
};

export const createRequestLoggingMiddleware = (loggerInstance: Logger = logger) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      const childLogger = req.log ?? loggerInstance;
      childLogger.info(
        {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          responseTime,
        },
        'request completed',
      );
    });
    next();
  };
};
