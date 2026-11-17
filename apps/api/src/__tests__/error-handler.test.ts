import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { BadRequestError } from '../errors.js';

describe('Central Error Handler', () => {
  it('returns consistent JSON shape { error: { code, message, requestId } } on AppError', async () => {
    const app = createApp({
      checkMongo: async () => true,
      checkRedis: async () => true,
      configureRoutes: (expressApp) => {
        expressApp.get('/test-error', () => {
          throw new BadRequestError('Invalid input parameter');
        });
      },
    });

    const response = await request(app).get('/test-error').set('x-request-id', 'test-req-123');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid input parameter',
        requestId: 'test-req-123',
      },
    });
    expect(response.body.stack).toBeUndefined();
    expect(response.body.error.stack).toBeUndefined();
  });

  it('handles 404 for unmapped routes with consistent error shape', async () => {
    const app = createApp({
      checkMongo: async () => true,
      checkRedis: async () => true,
    });

    const response = await request(app).get('/non-existent-endpoint');

    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(typeof response.body.error.message).toBe('string');
    expect(response.body.error.requestId).toBeDefined();
  });

  it('never leaks stack traces or internal details in production', async () => {
    const app = createApp({
      config: {
        NODE_ENV: 'production',
        PORT: 4000,
        MONGODB_URI: 'mongodb://localhost:27017/prism',
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'fatal',
        BODY_LIMIT: '1mb',
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_MAX: 100,
      },
      checkMongo: async () => true,
      checkRedis: async () => true,
      configureRoutes: (expressApp) => {
        expressApp.get('/test-unhandled', () => {
          throw new Error('Database password was 123456');
        });
      },
    });

    const response = await request(app).get('/test-unhandled');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(response.body.error.message).toBe('Internal Server Error');
    expect(response.body.error.message).not.toContain('Database password');
    expect(response.body.stack).toBeUndefined();
    expect(response.body.error.stack).toBeUndefined();
  });
});
