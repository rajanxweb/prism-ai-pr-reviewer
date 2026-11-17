# AI PR Reviewer - Permanent Workspace Rules

## Project Overview

"AI PR Reviewer" is a GitHub App that reviews pull requests with an LLM, posts inline comments, and provides a MERN dashboard showing code-quality trends.

---

## Tech Stack

- **Runtime & Language**: Node 20, TypeScript strict (no `any`)
- **Backend**: Express, Mongoose, BullMQ + Redis, Octokit, Zod, Pino
- **Frontend**: React, Vite, Tailwind CSS
- **Testing**: Vitest, Supertest

---

## Engineering Rules

1. **Test-Driven Development**: Write a failing test first for all business logic, then implement.
2. **Test Preservation**: Never edit or delete an existing test just to make it pass.
3. **Scope Discipline**: Stay inside the scope of the current task. If a refactor outside scope is needed, propose it and wait for approval.
4. **Dependency Inversion & Isolated Testing**: Every external dependency (GitHub API, LLM, embeddings, vector store, clock) sits behind an interface. Tests use fakes. No test may reach the external internet. Local Mongo and Redis are allowed.
5. **Configuration & Secrets**: All config comes from environment variables validated by Zod at startup. Secrets are never logged or committed.
6. **Security & Input Validation**: Treat all PR content (diffs, titles, comments) as untrusted input.
7. **Version Control**: Conventional commit messages, small commits.
8. **Verification Gate**: Every task ends with the Verification Gate provided in the prompt.
