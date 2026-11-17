import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('GET /ready', () => {
  it('returns 200 and ready status when both Mongo and Redis are up', async () => {
    const app = createApp({
      checkMongo: async () => true,
      checkRedis: async () => true,
    });

    const response = await request(app).get('/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      timestamp: expect.any(String),
      checks: {
        mongo: 'up',
        redis: 'up',
      },
    });
  });

  it('returns 503 and not_ready status when Mongo is down', async () => {
    const app = createApp({
      checkMongo: async () => false,
      checkRedis: async () => true,
    });

    const response = await request(app).get('/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.checks).toEqual({
      mongo: 'down',
      redis: 'up',
    });
  });

  it('returns 503 and not_ready status when Redis is down', async () => {
    const app = createApp({
      checkMongo: async () => true,
      checkRedis: async () => false,
    });

    const response = await request(app).get('/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.checks).toEqual({
      mongo: 'up',
      redis: 'down',
    });
  });

  it('returns 503 when readiness check throws an error', async () => {
    const app = createApp({
      checkMongo: async () => {
        throw new Error('Connection timeout');
      },
      checkRedis: async () => true,
    });

    const response = await request(app).get('/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body.checks.mongo).toBe('down');
  });
});
