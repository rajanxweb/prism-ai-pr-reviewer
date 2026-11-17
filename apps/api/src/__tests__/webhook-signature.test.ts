import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../app.js';
import { verifyWebhookSignature } from '../github/signature.js';

describe('Webhook Signature Verification', () => {
  const secret = 'test-webhook-secret-12345';

  const generateSignature = (payload: string | Buffer, key: string = secret) => {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  };

  describe('verifyWebhookSignature unit test', () => {
    it('returns true for a valid signature', () => {
      const payload = Buffer.from(JSON.stringify({ action: 'opened' }), 'utf8');
      const signature = generateSignature(payload);
      expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
    });

    it('returns false for an invalid signature', () => {
      const payload = Buffer.from(JSON.stringify({ action: 'opened' }), 'utf8');
      const signature = 'sha256=invalidhex00000000000000000000000000000000000000000000000000000000';
      expect(verifyWebhookSignature(payload, signature, secret)).toBe(false);
    });

    it('returns false when signature header is missing or malformed', () => {
      const payload = Buffer.from(JSON.stringify({ action: 'opened' }), 'utf8');
      expect(verifyWebhookSignature(payload, undefined, secret)).toBe(false);
      expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
      expect(verifyWebhookSignature(payload, 'notsha256=abcdef', secret)).toBe(false);
    });

    it('returns false when body is tampered with', () => {
      const originalPayload = Buffer.from(JSON.stringify({ action: 'opened' }), 'utf8');
      const signature = generateSignature(originalPayload);
      const tamperedPayload = Buffer.from(JSON.stringify({ action: 'synchronize' }), 'utf8');
      expect(verifyWebhookSignature(tamperedPayload, signature, secret)).toBe(false);
    });
  });

  describe('POST /webhooks/github HTTP signature enforcement', () => {
    it('rejects request with 401 when signature header is missing', async () => {
      const app = createApp({
        config: {
          NODE_ENV: 'test',
          PORT: 4000,
          MONGODB_URI: 'mongodb://localhost:27017/prism',
          REDIS_URL: 'redis://localhost:6379',
          FRONTEND_URL: 'http://localhost:5173',
          LOG_LEVEL: 'fatal',
          BODY_LIMIT: '1mb',
          RATE_LIMIT_WINDOW_MS: 900000,
          RATE_LIMIT_MAX: 100,
          GITHUB_WEBHOOK_SECRET: secret,
        },
      });

      const res = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'del-1')
        .set('content-type', 'application/json')
        .send(JSON.stringify({ action: 'opened' }));

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toContain('signature');
    });

    it('rejects request with 401 when signature is invalid', async () => {
      const app = createApp({
        config: {
          NODE_ENV: 'test',
          PORT: 4000,
          MONGODB_URI: 'mongodb://localhost:27017/prism',
          REDIS_URL: 'redis://localhost:6379',
          FRONTEND_URL: 'http://localhost:5173',
          LOG_LEVEL: 'fatal',
          BODY_LIMIT: '1mb',
          RATE_LIMIT_WINDOW_MS: 900000,
          RATE_LIMIT_MAX: 100,
          GITHUB_WEBHOOK_SECRET: secret,
        },
      });

      const body = JSON.stringify({ action: 'opened' });
      const badSignature = generateSignature(body, 'wrong-secret');

      const res = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'del-2')
        .set('x-hub-signature-256', badSignature)
        .set('content-type', 'application/json')
        .send(body);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with 401 when body is tampered after signature generation', async () => {
      const app = createApp({
        config: {
          NODE_ENV: 'test',
          PORT: 4000,
          MONGODB_URI: 'mongodb://localhost:27017/prism',
          REDIS_URL: 'redis://localhost:6379',
          FRONTEND_URL: 'http://localhost:5173',
          LOG_LEVEL: 'fatal',
          BODY_LIMIT: '1mb',
          RATE_LIMIT_WINDOW_MS: 900000,
          RATE_LIMIT_MAX: 100,
          GITHUB_WEBHOOK_SECRET: secret,
        },
      });

      const originalBody = JSON.stringify({ action: 'opened' });
      const signature = generateSignature(originalBody, secret);
      const tamperedBody = JSON.stringify({ action: 'opened', tampered: true });

      const res = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'pull_request')
        .set('x-github-delivery', 'del-3')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(tamperedBody);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
