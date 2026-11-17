import { describe, expect, it } from 'vitest';
import { HealthCheckResponseSchema } from '../schemas/health.js';

describe('HealthCheckResponseSchema', () => {
  it('should validate a correct health check payload', () => {
    const payload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 42.5,
    };

    const parsed = HealthCheckResponseSchema.parse(payload);
    expect(parsed.status).toBe('ok');
    expect(parsed.uptime).toBe(42.5);
  });

  it('should reject invalid payload with incorrect status', () => {
    const payload = {
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: 10,
    };

    expect(() => HealthCheckResponseSchema.parse(payload)).toThrow();
  });

  it('should reject payload with negative uptime', () => {
    const payload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: -5,
    };

    expect(() => HealthCheckResponseSchema.parse(payload)).toThrow();
  });
});
