import { describe, expect, it } from 'vitest';
import { validateConfig, ConfigError } from '../config.js';

describe('Config Module', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    PORT: '4000',
    MONGODB_URI: 'mongodb://localhost:27017/prism-test',
    REDIS_URL: 'redis://localhost:6379',
    FRONTEND_URL: 'http://localhost:5173',
  };

  it('successfully validates and parses a valid environment', () => {
    const config = validateConfig(validBaseEnv);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
    expect(config.MONGODB_URI).toBe('mongodb://localhost:27017/prism-test');
    expect(config.REDIS_URL).toBe('redis://localhost:6379');
    expect(config.FRONTEND_URL).toBe('http://localhost:5173');
    expect(config.BODY_LIMIT).toBe('1mb');
    expect(config.RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(config.RATE_LIMIT_MAX).toBe(100);
  });

  it('fails fast with readable error listing all missing required variables', () => {
    expect(() => validateConfig({})).toThrow(ConfigError);

    try {
      validateConfig({});
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const err = error as ConfigError;
      expect(err.message).toContain('Config validation failed');
      expect(err.message).toContain('MONGODB_URI');
      expect(err.message).toContain('REDIS_URL');
      expect(err.missingVariables).toEqual(expect.arrayContaining(['MONGODB_URI', 'REDIS_URL']));
    }
  });

  it('fails with readable error when variable types are invalid', () => {
    expect(() =>
      validateConfig({
        ...validBaseEnv,
        PORT: 'not-a-number',
      }),
    ).toThrow(ConfigError);
  });
});
