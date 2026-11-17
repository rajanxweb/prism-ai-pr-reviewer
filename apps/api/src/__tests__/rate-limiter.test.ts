import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Global Rate Limiting', () => {
  it('returns 429 Too Many Requests when limit is exceeded', async () => {
    const app = createApp({
      rateLimitMax: 2,
      rateLimitWindowMs: 60000,
      checkMongo: async () => true,
      checkRedis: async () => true,
    });

    const res1 = await request(app).get('/health');
    expect(res1.status).toBe(200);

    const res2 = await request(app).get('/health');
    expect(res2.status).toBe(200);

    const res3 = await request(app).get('/health');
    expect(res3.status).toBe(429);
    expect(res3.body.error).toBeDefined();
    expect(res3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res3.body.error.message).toContain('Too many requests');
  });
});
