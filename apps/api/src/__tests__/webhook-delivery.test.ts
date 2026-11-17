import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { WebhookDelivery } from '../models/webhook-delivery.model.js';
import type { ReviewQueue } from '../github/queue.js';

describe('Webhook Delivery Deduplication & Event Filtering', () => {
  const secret = 'webhook-delivery-test-secret';
  const mongoUri = 'mongodb://localhost:27017/prism_test_delivery';

  const generateSignature = (payload: string, key: string = secret) => {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(Buffer.from(payload, 'utf8'));
    return `sha256=${hmac.digest('hex')}`;
  };

  const mockReviewQueue: ReviewQueue = {
    enqueueReview: vi.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await WebhookDelivery.deleteMany({});
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await WebhookDelivery.deleteMany({});
    vi.clearAllMocks();
  });

  it('successfully processes first delivery and records in WebhookDelivery collection', async () => {
    const app = createApp({
      config: {
        NODE_ENV: 'test',
        PORT: 4000,
        MONGODB_URI: mongoUri,
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'fatal',
        BODY_LIMIT: '1mb',
        RATE_LIMIT_WINDOW_MS: 900000,
        RATE_LIMIT_MAX: 100,
        GITHUB_WEBHOOK_SECRET: secret,
      },
      reviewQueue: mockReviewQueue,
    });

    const deliveryId = 'delivery-unique-1';
    const payload = JSON.stringify({
      action: 'opened',
      pull_request: {
        id: 101,
        number: 1,
        title: 'Initial PR',
        state: 'open',
        user: { id: 10, login: 'alice' },
        head: { sha: 'sha-head-1', ref: 'feature' },
        base: { sha: 'sha-base-1', ref: 'main' },
      },
      repository: {
        id: 501,
        name: 'test-repo',
        full_name: 'alice/test-repo',
        private: false,
        owner: { id: 10, login: 'alice' },
      },
      installation: { id: 701 },
    });
    const signature = generateSignature(payload);

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', deliveryId)
      .set('x-hub-signature-256', signature)
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(200);

    const recorded = await WebhookDelivery.findOne({ deliveryId });
    expect(recorded).not.toBeNull();
    expect(recorded?.deliveryId).toBe(deliveryId);
    expect(recorded?.event).toBe('pull_request');
  });

  it('replayed delivery returns 200 and does nothing (no re-enqueue)', async () => {
    const app = createApp({
      config: {
        NODE_ENV: 'test',
        PORT: 4000,
        MONGODB_URI: mongoUri,
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'fatal',
        BODY_LIMIT: '1mb',
        RATE_LIMIT_WINDOW_MS: 900000,
        RATE_LIMIT_MAX: 100,
        GITHUB_WEBHOOK_SECRET: secret,
      },
      reviewQueue: mockReviewQueue,
    });

    const deliveryId = 'delivery-replay-test';
    const payload = JSON.stringify({
      action: 'opened',
      pull_request: {
        id: 102,
        number: 2,
        title: 'Second PR',
        state: 'open',
        user: { id: 10, login: 'alice' },
        head: { sha: 'sha-head-2', ref: 'feature2' },
        base: { sha: 'sha-base-2', ref: 'main' },
      },
      repository: {
        id: 501,
        name: 'test-repo',
        full_name: 'alice/test-repo',
        private: false,
        owner: { id: 10, login: 'alice' },
      },
      installation: { id: 701 },
    });
    const signature = generateSignature(payload);

    // First delivery
    const res1 = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', deliveryId)
      .set('x-hub-signature-256', signature)
      .set('content-type', 'application/json')
      .send(payload);

    expect(res1.status).toBe(200);
    expect(mockReviewQueue.enqueueReview).toHaveBeenCalledTimes(1);

    // Second delivery (replay)
    const res2 = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', deliveryId)
      .set('x-hub-signature-256', signature)
      .set('content-type', 'application/json')
      .send(payload);

    expect(res2.status).toBe(200);
    // Heavy work was NOT re-enqueued on replay!
    expect(mockReviewQueue.enqueueReview).toHaveBeenCalledTimes(1);
  });

  it('ignores unsupported events with 202', async () => {
    const app = createApp({
      config: {
        NODE_ENV: 'test',
        PORT: 4000,
        MONGODB_URI: mongoUri,
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'fatal',
        BODY_LIMIT: '1mb',
        RATE_LIMIT_WINDOW_MS: 900000,
        RATE_LIMIT_MAX: 100,
        GITHUB_WEBHOOK_SECRET: secret,
      },
      reviewQueue: mockReviewQueue,
    });

    const payload = JSON.stringify({ zen: 'Keep it logically awesome.' });
    const signature = generateSignature(payload);

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'ping')
      .set('x-github-delivery', 'del-ping-1')
      .set('x-hub-signature-256', signature)
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(202);
    expect(mockReviewQueue.enqueueReview).not.toHaveBeenCalled();
  });

  it('ignores unhandled actions on supported events with 202', async () => {
    const app = createApp({
      config: {
        NODE_ENV: 'test',
        PORT: 4000,
        MONGODB_URI: mongoUri,
        REDIS_URL: 'redis://localhost:6379',
        FRONTEND_URL: 'http://localhost:5173',
        LOG_LEVEL: 'fatal',
        BODY_LIMIT: '1mb',
        RATE_LIMIT_WINDOW_MS: 900000,
        RATE_LIMIT_MAX: 100,
        GITHUB_WEBHOOK_SECRET: secret,
      },
      reviewQueue: mockReviewQueue,
    });

    const payload = JSON.stringify({
      action: 'closed',
      pull_request: { id: 105, number: 5 },
    });
    const signature = generateSignature(payload);

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-github-delivery', 'del-closed-1')
      .set('x-hub-signature-256', signature)
      .set('content-type', 'application/json')
      .send(payload);

    expect(res.status).toBe(202);
    expect(mockReviewQueue.enqueueReview).not.toHaveBeenCalled();
  });
});
