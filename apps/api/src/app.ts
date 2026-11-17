import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { pino } from 'pino';
import { HealthCheckResponseSchema, type HealthCheckResponse } from '@ai-pr-reviewer/shared';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

export const createApp = (): Express => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    const healthData: HealthCheckResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime() * 100) / 100,
    };

    const validated = HealthCheckResponseSchema.parse(healthData);
    res.status(200).json(validated);
  });

  return app;
};

export const app = createApp();
