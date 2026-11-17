# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
