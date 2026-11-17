import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { HealthCheckResponseSchema } from '@ai-pr-reviewer/shared';

describe('GET /health', () => {
  it('should return 200 and a valid health check payload', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);

    const parseResult = HealthCheckResponseSchema.safeParse(response.body);
    expect(parseResult.success).toBe(true);

    if (parseResult.success) {
      expect(parseResult.data.status).toBe('ok');
      expect(parseResult.data.uptime).toBeGreaterThanOrEqual(0);
      expect(new Date(parseResult.data.timestamp).getTime()).not.toBeNaN();
    }
  });
});
