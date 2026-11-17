import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Logger } from 'pino';
import { verifyWebhookSignature } from './signature.js';
import type { ReviewQueue } from './queue.js';
import { StubReviewQueue } from './queue.js';
import { Installation } from '../models/installation.model.js';
import { Repository } from '../models/repository.model.js';
import { PullRequest } from '../models/pull-request.model.js';
import { WebhookDelivery } from '../models/webhook-delivery.model.js';

interface GithubUserPayload {
  id?: number;
  login?: string;
}

interface GithubRepoPayload {
  id: number;
  name: string;
  full_name: string;
  private?: boolean;
  owner?: GithubUserPayload;
  default_branch?: string;
}

interface GithubPullRequestPayload {
  id: number;
  number: number;
  title?: string;
  state?: string;
  user?: GithubUserPayload;
  head?: { sha?: string; ref?: string };
  base?: { sha?: string; ref?: string };
  draft?: boolean;
  html_url?: string;
}

interface GithubInstallationAccountPayload {
  id?: number;
  login?: string;
  type?: string;
  avatar_url?: string;
}

interface GithubInstallationPayload {
  id: number;
  account?: GithubInstallationAccountPayload;
  app_id?: number;
  target_type?: string;
  permissions?: Record<string, string>;
  events?: string[];
  created_at?: string;
}

interface GithubWebhookPayload {
  action?: string;
  pull_request?: GithubPullRequestPayload;
  repository?: GithubRepoPayload;
  installation?: GithubInstallationPayload;
  repositories?: GithubRepoPayload[];
  repositories_added?: GithubRepoPayload[];
  repositories_removed?: GithubRepoPayload[];
}

export interface WebhookRouterOptions {
  webhookSecret?: string;
  logger: Logger;
  reviewQueue?: ReviewQueue;
}

export const createGithubWebhookRouter = (options: WebhookRouterOptions): Router => {
  const router = Router();
  const logger = options.logger;
  const reviewQueue = options.reviewQueue ?? new StubReviewQueue();

  router.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestId = req.id ?? (res.getHeader('x-request-id') as string | undefined);

      // 1. Verify RAW request body is present and not parsed before signature check
      if (!Buffer.isBuffer(req.body)) {
        logger.error(
          { requestId },
          'Webhook raw body verification failed: body was not received as Buffer',
        );
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Webhook payload was not received as raw body',
            requestId,
          },
        });
        return;
      }

      // 2. Verify X-Hub-Signature-256
      const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
      const secret = options.webhookSecret ?? process.env.GITHUB_WEBHOOK_SECRET ?? '';

      const isSignatureValid = verifyWebhookSignature(req.body, signatureHeader, secret);
      if (!isSignatureValid) {
        // Log event and delivery without leaking the payload body
        logger.warn(
          {
            event: req.headers['x-github-event'],
            deliveryId: req.headers['x-github-delivery'],
            requestId,
          },
          'GitHub webhook signature verification failed: missing or invalid signature',
        );

        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or missing webhook signature',
            requestId,
          },
        });
        return;
      }

      // 3. Parse JSON payload
      let payload: GithubWebhookPayload;
      try {
        payload = JSON.parse(req.body.toString('utf8')) as GithubWebhookPayload;
      } catch {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid JSON payload in webhook body',
            requestId,
          },
        });
        return;
      }

      // 4. Delivery Deduplication using X-GitHub-Delivery
      const deliveryId = req.headers['x-github-delivery'] as string | undefined;
      if (!deliveryId) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Missing X-GitHub-Delivery header',
            requestId,
          },
        });
        return;
      }

      const event = (req.headers['x-github-event'] as string | undefined) || 'unknown';
      const action = typeof payload.action === 'string' ? payload.action : undefined;

      // Check if already processed
      const existingDelivery = await WebhookDelivery.findOne({ deliveryId });
      if (existingDelivery) {
        logger.info(
          { deliveryId, event, action },
          'Replayed GitHub webhook delivery detected, skipping',
        );
        res.status(200).json({ message: 'Delivery already processed' });
        return;
      }

      // Save delivery to MongoDB with TTL index
      try {
        await WebhookDelivery.create({
          deliveryId,
          event,
          action,
        });
      } catch (err: unknown) {
        // Handle race condition duplicate key error (code 11000)
        if (
          typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          (err as { code: number }).code === 11000
        ) {
          logger.info(
            { deliveryId, event, action },
            'Duplicate GitHub webhook delivery caught, skipping',
          );
          res.status(200).json({ message: 'Delivery already processed' });
          return;
        }
        throw err;
      }

      // 5. Event Handling
      if (event === 'pull_request') {
        const supportedPrActions = ['opened', 'synchronize', 'reopened'];
        if (!action || !supportedPrActions.includes(action)) {
          res.status(202).json({ message: 'Event action ignored' });
          return;
        }

        const prData = payload.pull_request;
        const repoData = payload.repository;
        const installationData = payload.installation;

        if (prData && repoData) {
          // Upsert PullRequest
          await PullRequest.findOneAndUpdate(
            { githubId: prData.id },
            {
              githubId: prData.id,
              number: prData.number,
              repositoryId: repoData.id,
              repositoryFullName: repoData.full_name,
              installationId: installationData?.id,
              title: prData.title || '',
              state: prData.state === 'closed' ? 'closed' : 'open',
              author: {
                id: prData.user?.id || 0,
                login: prData.user?.login || 'unknown',
              },
              headSha: prData.head?.sha || '',
              baseSha: prData.base?.sha || '',
              headRef: prData.head?.ref || '',
              baseRef: prData.base?.ref || '',
              draft: Boolean(prData.draft),
              htmlUrl: prData.html_url,
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );

          // Upsert Repository
          await Repository.findOneAndUpdate(
            { githubId: repoData.id },
            {
              githubId: repoData.id,
              name: repoData.name,
              fullName: repoData.full_name,
              private: Boolean(repoData.private),
              owner: {
                id: repoData.owner?.id || 0,
                login: repoData.owner?.login || 'unknown',
              },
              installationId: installationData?.id || 0,
              defaultBranch: repoData.default_branch || 'main',
              status: 'active',
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );

          // Fast stub review enqueue
          await reviewQueue.enqueueReview({
            installationId: installationData?.id,
            repository: {
              id: repoData.id,
              owner: repoData.owner?.login || 'unknown',
              name: repoData.name,
              fullName: repoData.full_name,
            },
            pullRequest: {
              id: prData.id,
              number: prData.number,
              headSha: prData.head?.sha || '',
              baseSha: prData.base?.sha || '',
              title: prData.title,
            },
            action,
          });
        }

        res.status(200).json({ message: 'Pull request event processed' });
        return;
      }

      if (event === 'installation') {
        const installationData = payload.installation;

        if (action === 'created' && installationData) {
          await Installation.findOneAndUpdate(
            { installationId: installationData.id },
            {
              installationId: installationData.id,
              account: {
                id: installationData.account?.id || 0,
                login: installationData.account?.login || 'unknown',
                type: installationData.account?.type || 'User',
                avatarUrl: installationData.account?.avatar_url,
              },
              appId: installationData.app_id,
              targetType: installationData.target_type,
              permissions: installationData.permissions || {},
              events: installationData.events || [],
              status: 'active',
              installedAt: new Date(installationData.created_at || Date.now()),
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );

          if (Array.isArray(payload.repositories)) {
            for (const repo of payload.repositories) {
              await Repository.findOneAndUpdate(
                { githubId: repo.id },
                {
                  githubId: repo.id,
                  name: repo.name,
                  fullName: repo.full_name,
                  private: Boolean(repo.private),
                  owner: {
                    id: installationData.account?.id || 0,
                    login: installationData.account?.login || 'unknown',
                  },
                  installationId: installationData.id,
                  status: 'active',
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
              );
            }
          }

          res.status(200).json({ message: 'Installation created' });
          return;
        }

        if (action === 'deleted' && installationData) {
          await Installation.findOneAndUpdate(
            { installationId: installationData.id },
            {
              status: 'deleted',
              deletedAt: new Date(),
            },
          );

          await Repository.updateMany(
            { installationId: installationData.id },
            { status: 'inactive' },
          );

          res.status(200).json({ message: 'Installation deleted' });
          return;
        }

        // Unhandled installation actions (e.g. suspend, unsuspend)
        res.status(202).json({ message: 'Event action ignored' });
        return;
      }

      if (event === 'installation_repositories') {
        const installationData = payload.installation;

        if (action === 'added' && installationData) {
          if (Array.isArray(payload.repositories_added)) {
            for (const repo of payload.repositories_added) {
              await Repository.findOneAndUpdate(
                { githubId: repo.id },
                {
                  githubId: repo.id,
                  name: repo.name,
                  fullName: repo.full_name,
                  private: Boolean(repo.private),
                  owner: {
                    id: installationData.account?.id || 0,
                    login: installationData.account?.login || 'unknown',
                  },
                  installationId: installationData.id,
                  status: 'active',
                },
                { upsert: true, new: true, setDefaultsOnInsert: true },
              );
            }
          }

          res.status(200).json({ message: 'Repositories added' });
          return;
        }

        if (action === 'removed') {
          if (Array.isArray(payload.repositories_removed)) {
            for (const repo of payload.repositories_removed) {
              await Repository.findOneAndUpdate({ githubId: repo.id }, { status: 'inactive' });
            }
          }

          res.status(200).json({ message: 'Repositories removed' });
          return;
        }

        // Unhandled installation_repositories actions
        res.status(202).json({ message: 'Event action ignored' });
        return;
      }

      // Ignore everything else with 202
      res.status(202).json({ message: 'Event ignored' });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
