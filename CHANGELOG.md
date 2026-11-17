# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- GitHub App integration for `apps/api`:
  - RAW request body handler on `POST /webhooks/github` ensuring the incoming body is not parsed before signature verification.
  - Webhook signature verification (`X-Hub-Signature-256`) using timing-safe comparison (`crypto.timingSafeEqual`), rejecting invalid or missing signatures with 401 and logging without leaking payloads.
  - Delivery deduplication using `X-GitHub-Delivery` header recorded in MongoDB `WebhookDelivery` collection with a 7-day TTL index; replayed deliveries return 200 and do nothing.
  - Webhook event handlers for `pull_request` (`opened`, `synchronize`, `reopened`), `installation` (`created`, `deleted`), and `installation_repositories` (`added`, `removed`), ignoring unhandled events and actions with HTTP 202.
  - Asynchronous review job stub (`enqueueReview`) interface and stub implementation responding in milliseconds.
  - `GithubClient` interface and `OctokitGithubClient` implementation using GitHub App authentication with installation token caching and configurable expiry buffer (tested with fake clock).
  - Mongoose models with proper indexes: `Installation`, `Repository`, `PullRequest`, `WebhookDelivery`.
  - Comprehensive guide in `docs/GITHUB_APP_SETUP.md` covering GitHub App registration, permission matrix, event subscriptions, private key handling, and local forwarding via `smee.io`.
- `apps/api` foundation:
  - Zod-validated environment configuration module (`apps/api/src/config.ts`) failing fast with human-readable error listing missing variables.
  - Pino logger (`apps/api/src/logger.ts`) with request-id middleware (`x-request-id`), child logger per request, and automatic redaction of authorization headers, tokens, keys, and secrets.
  - Express application factory `createApp(deps)` (`apps/api/src/app.ts`) supporting dependency injection for fakes/testing, equipped with `helmet`, CORS configured from env, JSON body limits, and global rate limiting (`express-rate-limit`).
  - Central error handling middleware and domain error classes (`apps/api/src/errors.ts`) returning standard `{ error: { code, message, requestId } }` responses without leaking stack traces or internal details in production.
  - Mongoose connection module (`apps/api/src/db.ts`) with configurable retry and exponential backoff.
  - Redis client helper (`apps/api/src/redis.ts`) with health check ping.
  - Graceful shutdown lifecycle manager (`apps/api/src/shutdown.ts`) handling SIGTERM and SIGINT to close the HTTP server, MongoDB connection, and Redis client cleanly.
  - Process liveness endpoint (`GET /health`) and dependency readiness endpoint (`GET /ready`) reflecting MongoDB and Redis operational status with 200/503 codes.
  - Comprehensive test suite for `apps/api` covering config validation failures, error handler JSON shape, rate limiting 429 response, /health, /ready dependency failure, secret redaction in logs, and connection retry/shutdown.
- Monorepo scaffold using npm workspaces (`apps/api`, `apps/web`, `packages/shared`).
- TypeScript strict configurations anchored by `tsconfig.base.json`.
- Per-package and root ESLint, Prettier, and Vitest configurations.
- Root scripts: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run format:check`.
- Husky and lint-staged pre-commit hook enforcing linting and typechecks on staged files.
- Local development stack with MongoDB 7.0 and Redis 7.2 in `docker-compose.dev.yml`.
- GitHub Actions CI pipeline in `.github/workflows/ci.yml` running lint, typecheck, tests, and build with Mongo and Redis service containers.
- Comprehensive `.env.example` capturing all anticipated environment variables without secrets.
- Real smoke tests for `@ai-pr-reviewer/shared` (Zod validation), `@ai-pr-reviewer/api` (Express + Supertest `/health` endpoint), and `@ai-pr-reviewer/web` (React component rendering in JSDOM).
- Initial project workspace rules (`.agent/rules/rules.md` and `docs/RULES.md`).
- Architecture outline (`docs/ARCHITECTURE.md`).
- Decision log (`docs/DECISIONS.md`) documenting ADR-001.
- Verification directory (`docs/verification/`).
