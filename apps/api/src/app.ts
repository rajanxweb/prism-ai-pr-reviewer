import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Logger } from 'pino';
import { HealthCheckResponseSchema, type HealthCheckResponse } from '@ai-pr-reviewer/shared';
import { validateConfig, type Config } from './config.js';
import {
  logger as defaultLogger,
  requestIdMiddleware,
  createRequestLoggingMiddleware,
} from './logger.js';
import { createErrorHandler, NotFoundError } from './errors.js';
import { isMongoConnected } from './db.js';
import { isRedisConnected } from './redis.js';
import { createGithubWebhookRouter } from './github/webhook-router.js';
import type { ReviewQueue } from './github/queue.js';
import type { GithubClient } from './github/client.js';

export interface AppDependencies {
  config?: Config;
  logger?: Logger;
  checkMongo?: () => Promise<boolean>;
  checkRedis?: () => Promise<boolean>;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
  configureRoutes?: (app: Express) => void;
  reviewQueue?: ReviewQueue;
  githubClient?: GithubClient;
}

const getEffectiveConfig = (injected?: Config): Config => {
  if (injected) {
    return injected;
  }

  try {
    return validateConfig(process.env);
  } catch {
    return {
      NODE_ENV: (process.env.NODE_ENV as Config['NODE_ENV']) || 'development',
      PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 4000,
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/prism',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
      LOG_LEVEL: (process.env.LOG_LEVEL as Config['LOG_LEVEL']) || 'info',
      BODY_LIMIT: '1mb',
      RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
      RATE_LIMIT_MAX: 100,
    };
  }
};

export const createApp = (deps: AppDependencies = {}): Express => {
  const config = getEffectiveConfig(deps.config);
  const logger = deps.logger ?? defaultLogger;
  const checkMongo = deps.checkMongo ?? isMongoConnected;
  const checkRedis = deps.checkRedis ?? isRedisConnected;

  const app = express();

  // 1. Security & Core Middleware
  app.use(helmet());
  app.use(
    cors({
      origin: config.FRONTEND_URL,
      credentials: true,
    }),
  );

  // 2. Request ID & Request Logging
  app.use(requestIdMiddleware);
  if (config.NODE_ENV !== 'test') {
    app.use(createRequestLoggingMiddleware(logger));
  }

  // 3. GitHub Webhook Route with RAW body parser (BEFORE express.json)
  app.use(
    '/webhooks/github',
    express.raw({ type: '*/*', limit: config.BODY_LIMIT }),
    createGithubWebhookRouter({
      webhookSecret: config.GITHUB_WEBHOOK_SECRET,
      logger,
      reviewQueue: deps.reviewQueue,
    }),
  );

  // 4. JSON Body Parser for all other endpoints
  app.use(express.json({ limit: config.BODY_LIMIT }));

  // 3. Global Rate Limiter
  const rateLimitWindowMs = deps.rateLimitWindowMs ?? config.RATE_LIMIT_WINDOW_MS;
  const rateLimitMax = deps.rateLimitMax ?? config.RATE_LIMIT_MAX;

  const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    limit: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      const requestId = req.id ?? (res.getHeader('x-request-id') as string | undefined);
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later.',
          requestId,
        },
      });
    },
  });
  app.use(limiter);

  // 4. Health & Readiness Probes
  app.get('/health', (_req: Request, res: Response) => {
    const healthData: HealthCheckResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime() * 100) / 100,
    };

    const validated = HealthCheckResponseSchema.parse(healthData);
    res.status(200).json(validated);
  });

  app.get('/ready', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [mongoUp, redisUp] = await Promise.all([
        Promise.resolve(checkMongo()).catch(() => false),
        Promise.resolve(checkRedis()).catch(() => false),
      ]);

      const isReady = Boolean(mongoUp && redisUp);
      const statusCode = isReady ? 200 : 503;

      res.status(statusCode).json({
        status: isReady ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        checks: {
          mongo: mongoUp ? 'up' : 'down',
          redis: redisUp ? 'up' : 'down',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Inject any additional routes before 404 and error handling
  if (deps.configureRoutes) {
    deps.configureRoutes(app);
  }

  // 5. 404 Route Handler
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError('Resource not found'));
  });

  // 6. Central Error Handler
  app.use(
    createErrorHandler({
      logger,
      isProduction: config.NODE_ENV === 'production',
    }),
  );

  return app;
};

export const app = createApp();
export { logger } from './logger.js';
export * from './models/index.js';
export * from './github/index.js';
