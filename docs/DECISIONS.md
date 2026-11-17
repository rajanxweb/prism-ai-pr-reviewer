# Architecture Decision Log (ADR)

## Format

Entries follow the format:

- **Date**: YYYY-MM-DD
- **Status**: Proposed / Accepted / Superseded / Deprecated
- **Context**: Problem statement, constraints, requirements
- **Decision**: Choice made and rationale
- **Consequences**: Positive, negative, and neutral trade-offs

---

## Decisions

### ADR-001: Tech Stack Baseline and Engineering Guardrails

- **Date**: 2026-11-17
- **Status**: Accepted
- **Context**:
  Establishing the foundational technology stack and engineering practices for "AI PR Reviewer", an automated GitHub App review system with a MERN code-quality dashboard.
- **Decision**:
  - Adopt Node 20 with TypeScript strict mode (disallowing `any`).
  - Use Express, Mongoose (MongoDB), BullMQ + Redis, Octokit, Zod, and Pino for the backend services.
  - Use React, Vite, and Tailwind CSS for the frontend dashboard.
  - Use Vitest and Supertest for testing, enforcing strict TDD (failing test first, no editing existing tests to pass).
  - Enforce interface-based boundaries for all external dependencies (GitHub, LLM, vector store, embeddings, clock) to allow fast, deterministic testing using fakes without network access.
  - Require Zod-validated environment configuration at startup.
- **Consequences**:
  - Enables clean separation of concerns, test isolation, type safety, and reproducible test runs.
  - Requires upfront design of ports/interfaces before implementation.
