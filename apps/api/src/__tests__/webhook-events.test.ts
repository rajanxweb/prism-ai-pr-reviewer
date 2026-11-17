import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { Installation } from '../models/installation.model.js';
import { Repository } from '../models/repository.model.js';
import { PullRequest } from '../models/pull-request.model.js';
import { WebhookDelivery } from '../models/webhook-delivery.model.js';
import type { ReviewQueue } from '../github/queue.js';

describe('Webhook Handled Events & Database Updates', () => {
  const secret = 'webhook-events-test-secret';
  const mongoUri = 'mongodb://localhost:27017/prism_test_events';

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
      await Installation.deleteMany({});
      await Repository.deleteMany({});
      await PullRequest.deleteMany({});
      await WebhookDelivery.deleteMany({});
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await Installation.deleteMany({});
    await Repository.deleteMany({});
    await PullRequest.deleteMany({});
    await WebhookDelivery.deleteMany({});
    vi.clearAllMocks();
  });

  const getTestApp = () =>
    createApp({
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

  describe('pull_request events (opened, synchronize, reopened)', () => {
    it.each(['opened', 'synchronize', 'reopened'])(
      'handles pull_request.%s: updates DB and enqueues review',
      async (action) => {
        const app = getTestApp();
        const payload = JSON.stringify({
          action,
          pull_request: {
            id: 2001,
            number: 42,
            title: 'Fix issue with login',
            state: 'open',
            user: { id: 100, login: 'developer1' },
            head: { sha: `head-sha-${action}`, ref: 'fix/login' },
            base: { sha: 'base-sha-main', ref: 'main' },
            draft: false,
            html_url: 'https://github.com/org/repo/pull/42',
          },
          repository: {
            id: 3001,
            name: 'repo',
            full_name: 'org/repo',
            private: true,
            owner: { id: 50, login: 'org' },
            default_branch: 'main',
          },
          installation: { id: 4001 },
        });

        const res = await request(app)
          .post('/webhooks/github')
          .set('x-github-event', 'pull_request')
          .set('x-github-delivery', `del-pr-${action}`)
          .set('x-hub-signature-256', generateSignature(payload))
          .set('content-type', 'application/json')
          .send(payload);

        expect(res.status).toBe(200);

        // Verify PullRequest model in Mongo
        const pr = await PullRequest.findOne({ githubId: 2001 });
        expect(pr).not.toBeNull();
        expect(pr?.number).toBe(42);
        expect(pr?.repositoryFullName).toBe('org/repo');
        expect(pr?.headSha).toBe(`head-sha-${action}`);
        expect(pr?.state).toBe('open');

        // Verify Repository model in Mongo
        const repo = await Repository.findOne({ githubId: 3001 });
        expect(repo).not.toBeNull();
        expect(repo?.fullName).toBe('org/repo');
        expect(repo?.status).toBe('active');

        // Verify reviewQueue called
        expect(mockReviewQueue.enqueueReview).toHaveBeenCalledWith(
          expect.objectContaining({
            installationId: 4001,
            repository: {
              id: 3001,
              owner: 'org',
              name: 'repo',
              fullName: 'org/repo',
            },
            pullRequest: {
              id: 2001,
              number: 42,
              headSha: `head-sha-${action}`,
              baseSha: 'base-sha-main',
              title: 'Fix issue with login',
            },
            action,
          }),
        );
      },
    );
  });

  describe('installation events (created, deleted)', () => {
    it('handles installation.created: saves installation and initial repositories', async () => {
      const app = getTestApp();
      const payload = JSON.stringify({
        action: 'created',
        installation: {
          id: 5500,
          account: {
            id: 111,
            login: 'my-org',
            type: 'Organization',
            avatar_url: 'https://avatars.githubusercontent.com/u/111',
          },
          app_id: 1234,
          target_type: 'Organization',
          permissions: {
            pull_requests: 'write',
            contents: 'read',
            checks: 'write',
            metadata: 'read',
          },
          events: ['pull_request', 'installation'],
          created_at: '2026-11-17T00:00:00Z',
        },
        repositories: [
          {
            id: 801,
            name: 'frontend',
            full_name: 'my-org/frontend',
            private: false,
          },
          {
            id: 802,
            name: 'backend',
            full_name: 'my-org/backend',
            private: true,
          },
        ],
      });

      const res = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'installation')
        .set('x-github-delivery', 'del-inst-create')
        .set('x-hub-signature-256', generateSignature(payload))
        .set('content-type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);

      // Verify Installation record
      const inst = await Installation.findOne({ installationId: 5500 });
      expect(inst).not.toBeNull();
      expect(inst?.account.login).toBe('my-org');
      expect(inst?.status).toBe('active');
      expect(inst?.permissions).toEqual(
        expect.objectContaining({
          pull_requests: 'write',
          contents: 'read',
        }),
      );

      // Verify Repositories saved
      const repos = await Repository.find({ installationId: 5500 });
      expect(repos).toHaveLength(2);
      expect(repos.map((r) => r.name)).toContain('frontend');
      expect(repos.map((r) => r.name)).toContain('backend');
      expect(repos.every((r) => r.status === 'active')).toBe(true);
    });

    it('handles installation.deleted: marks installation deleted and repos inactive', async () => {
      // Setup existing installation and repo
      await Installation.create({
        installationId: 6600,
        account: { id: 222, login: 'old-org', type: 'Organization' },
        status: 'active',
      });
      await Repository.create({
        githubId: 901,
        name: 'old-repo',
        fullName: 'old-org/old-repo',
        installationId: 6600,
        owner: { id: 222, login: 'old-org' },
        status: 'active',
      });

      const app = getTestApp();
      const payload = JSON.stringify({
        action: 'deleted',
        installation: {
          id: 6600,
          account: { id: 222, login: 'old-org', type: 'Organization' },
        },
      });

      const res = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'installation')
        .set('x-github-delivery', 'del-inst-delete')
        .set('x-hub-signature-256', generateSignature(payload))
        .set('content-type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);

      const inst = await Installation.findOne({ installationId: 6600 });
      expect(inst?.status).toBe('deleted');
      expect(inst?.deletedAt).toBeDefined();

      const repo = await Repository.findOne({ githubId: 901 });
      expect(repo?.status).toBe('inactive');
    });
  });

  describe('installation_repositories events (added, removed)', () => {
    it('handles installation_repositories.added: adds new repositories', async () => {
      await Installation.create({
        installationId: 7700,
        account: { id: 333, login: 'dynamic-org', type: 'Organization' },
        status: 'active',
      });

      const app = getTestApp();
      const payload = JSON.stringify({
        action: 'added',
        installation: {
          id: 7700,
          account: { id: 333, login: 'dynamic-org', type: 'Organization' },
        },
        repositories_added: [
          {
            id: 991,
            name: 'repo-new',
            full_name: 'dynamic-org/repo-new',
            private: false,
          },
        ],
        repositories_removed: [],
      });

      const res = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'installation_repositories')
        .set('x-github-delivery', 'del-repos-added')
        .set('x-hub-signature-256', generateSignature(payload))
        .set('content-type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);

      const repo = await Repository.findOne({ githubId: 991 });
      expect(repo).not.toBeNull();
      expect(repo?.name).toBe('repo-new');
      expect(repo?.status).toBe('active');
    });

    it('handles installation_repositories.removed: deactivates removed repositories', async () => {
      await Repository.create({
        githubId: 992,
        name: 'repo-to-remove',
        fullName: 'dynamic-org/repo-to-remove',
        installationId: 7700,
        owner: { id: 333, login: 'dynamic-org' },
        status: 'active',
      });

      const app = getTestApp();
      const payload = JSON.stringify({
        action: 'removed',
        installation: {
          id: 7700,
          account: { id: 333, login: 'dynamic-org', type: 'Organization' },
        },
        repositories_added: [],
        repositories_removed: [
          {
            id: 992,
            name: 'repo-to-remove',
            full_name: 'dynamic-org/repo-to-remove',
            private: false,
          },
        ],
      });

      const res = await request(app)
        .post('/webhooks/github')
        .set('x-github-event', 'installation_repositories')
        .set('x-github-delivery', 'del-repos-removed')
        .set('x-hub-signature-256', generateSignature(payload))
        .set('content-type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);

      const repo = await Repository.findOne({ githubId: 992 });
      expect(repo?.status).toBe('inactive');
    });
  });
});
