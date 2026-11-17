import type { Request, Response, NextFunction } from 'express';
import type { Logger } from 'pino';
import { logger as defaultLogger } from './logger.js';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_SERVER_ERROR',
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later.', details?: unknown) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', details?: unknown) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

export interface ErrorHandlerOptions {
  logger?: Logger;
  isProduction?: boolean;
}

export const createErrorHandler = (options: ErrorHandlerOptions = {}) => {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
    const log = req.log ?? options.logger ?? defaultLogger;

    let statusCode = 500;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal Server Error';

    if (err instanceof AppError) {
      statusCode = err.statusCode;
      code = err.code;
      message = err.message;
    } else if (err instanceof Error) {
      if ('status' in err && typeof (err as { status: unknown }).status === 'number') {
        const potentialStatus = (err as { status: number }).status;
        if (potentialStatus >= 400 && potentialStatus < 600) {
          statusCode = potentialStatus;
          code = statusCode === 400 ? 'BAD_REQUEST' : code;
        }
      }
      if (!isProduction) {
        message = err.message;
      }
    }

    if (statusCode >= 500) {
      log.error({ err }, 'Internal server error occurred');
      if (isProduction) {
        message = 'Internal Server Error';
      }
    } else {
      log.warn({ err }, 'Client error handled');
    }

    const requestId = req.id ?? (res.getHeader('x-request-id') as string | undefined);

    res.status(statusCode).json({
      error: {
        code,
        message,
        requestId,
      },
    });
  };
};
