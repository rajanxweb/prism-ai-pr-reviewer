# Verification Gate: Phase 3 GitHub App Integration

## Date

2026-11-17

## Scope

GitHub App integration in `apps/api`:

- **RAW Request Body Webhook Handler** (`apps/api/src/github/webhook-router.ts`, `apps/api/src/app.ts`):
  - Mounted before `express.json()` using `express.raw({ type: '*/*' })`.
  - Verifies body is received as an unparsed Buffer prior to running signature checks.
- **Timing-Safe Signature Verification** (`apps/api/src/github/signature.ts`):
  - Validates `X-Hub-Signature-256` header against HMAC-SHA256 digest using `crypto.timingSafeEqual`.
  - Rejects missing, invalid, or tampered signatures with HTTP 401 Unauthorized.
  - Logs warning without leaking payload body contents.
- **Delivery Deduplication** (`apps/api/src/github/webhook-router.ts`, `apps/api/src/models/webhook-delivery.model.ts`):
  - Tracks deliveries via `X-GitHub-Delivery` header in MongoDB with a 7-day TTL index on `createdAt`.
  - Replayed deliveries return HTTP 200 `{ "message": "Delivery already processed" }` and perform no duplicate work.
- **Event Filtering & Processing**:
  - Handles `pull_request` (`opened`, `synchronize`, `reopened`), updating `PullRequest` and `Repository` models and enqueuing review.
  - Handles `installation` (`created`, `deleted`), managing `Installation` and associated repository active/inactive statuses.
  - Handles `installation_repositories` (`added`, `removed`), activating added repositories and deactivating removed repositories.
  - Returns HTTP 202 `{ "message": "Event ignored" }` / `{ "message": "Event action ignored" }` for unsupported events/actions.
- **Review Queue Stub** (`apps/api/src/github/queue.ts`):
  - Dependency-injected `ReviewQueue` interface with `StubReviewQueue` for instantaneous response without blocking the webhook response.
- **Octokit & Token Cache** (`apps/api/src/github/client.ts`, `apps/api/src/github/token-cache.ts`, `apps/api/src/github/clock.ts`):
  - `GithubClient` interface and `OctokitGithubClient` implementation.
  - Caches GitHub App installation tokens until 5 minutes before expiry (`expiresAt - buffer`).
  - Tested with `FakeClock` without any external network calls.
- **Mongoose Models with Indexes** (`apps/api/src/models/`):
  - `Installation`: unique index on `installationId`, indexes on `account.login` and `status`.
  - `Repository`: unique index on `githubId`, indexes on `fullName`, `installationId`, and `status`.
  - `PullRequest`: unique index on `githubId`, unique compound index on `{ repositoryFullName: 1, number: 1 }`, indexes on `repositoryId`, `installationId`, and `state`.
  - `WebhookDelivery`: unique index on `deliveryId`, TTL expiration index on `createdAt`.
- **Documentation** (`docs/GITHUB_APP_SETUP.md`):
  - Complete registration guide, permission matrix (pull requests read/write, contents read, checks write, metadata read), event subscriptions, private key generation, and local webhook forwarding via `smee.io`.

---

## 1. Full Workspace Verification Commands

### 1.1 Linting (`npm run lint`)

```
> prism-monorepo@0.1.0 lint
> npm run lint --workspaces --if-present

> @ai-pr-reviewer/shared@0.1.0 lint
> eslint .

> @ai-pr-reviewer/api@0.1.0 lint
> eslint .

> @ai-pr-reviewer/web@0.1.0 lint
> eslint .
```

Result: **Exit code 0 (Clean, 0 errors, 0 warnings across all workspaces)**

### 1.2 Typecheck (`npm run typecheck`)

```
> prism-monorepo@0.1.0 typecheck
> npm run typecheck --workspaces --if-present

> @ai-pr-reviewer/shared@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json

> @ai-pr-reviewer/api@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json

> @ai-pr-reviewer/web@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json
```

Result: **Exit code 0 (TypeScript strict compliance across all packages)**

### 1.3 Test Suite (`npm test`)

```
> prism-monorepo@0.1.0 test
> npm run test --workspaces --if-present

> @ai-pr-reviewer/shared@0.1.0 test
> vitest run

 RUN  v2.1.9 C:/Users/rajan/OneDrive/Scans/Desktop/PRism/packages/shared
 ✓ src/__tests__/health.test.ts (3 tests) 11ms
 Test Files  1 passed (1)
      Tests  3 passed (3)

> @ai-pr-reviewer/api@0.1.0 test
> vitest run

 RUN  v2.1.9 C:/Users/rajan/OneDrive/Scans/Desktop/PRism/apps/api
 ✓ src/__tests__/config.test.ts (3 tests) 22ms
 ✓ src/__tests__/github-client.test.ts (5 tests) 28ms
 ✓ src/__tests__/logger.test.ts (2 tests) 139ms
 ✓ src/__tests__/lifecycle.test.ts (3 tests) 77ms
 ✓ src/__tests__/health.test.ts (1 test) 227ms
 ✓ src/__tests__/rate-limiter.test.ts (1 test) 135ms
 ✓ src/__tests__/error-handler.test.ts (3 tests) 231ms
 ✓ src/__tests__/ready.test.ts (4 tests) 206ms
 ✓ src/__tests__/webhook-signature.test.ts (7 tests) 78ms
 ✓ src/__tests__/webhook-delivery.test.ts (4 tests) 601ms
 ✓ src/__tests__/webhook-events.test.ts (7 tests) 964ms
 Test Files  11 passed (11)
      Tests  40 passed (40)

> @ai-pr-reviewer/web@0.1.0 test
> vitest run

 RUN  v2.1.9 C:/Users/rajan/OneDrive/Scans/Desktop/PRism/apps/web
 ✓ src/__tests__/App.test.tsx (1 test) 74ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Result: **Exit code 0 (44 tests passed across all 3 workspaces, 0 failed)**

### 1.4 Build (`npm run build`)

```
> prism-monorepo@0.1.0 build
> npm run build --workspace=@ai-pr-reviewer/shared && npm run build --workspace=@ai-pr-reviewer/api && npm run build --workspace=@ai-pr-reviewer/web

> @ai-pr-reviewer/shared@0.1.0 build
> tsc -p tsconfig.json

> @ai-pr-reviewer/api@0.1.0 build
> tsc -p tsconfig.json

> @ai-pr-reviewer/web@0.1.0 build
> tsc -p tsconfig.json && vite build

vite v6.4.6 building for production...
transforming...
✓ 27 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.44 kB │ gzip:  0.30 kB
dist/assets/index-SxUlgiWg.css    6.78 kB │ gzip:  1.95 kB
dist/assets/index-Cr8mUjNz.js   145.02 kB │ gzip: 46.52 kB
✓ built in 2.68s
```

Result: **Exit code 0**

---

## 2. Test Regression Check

- Baseline tests prior to this phase: 21 tests (3 shared, 17 api, 1 web).
- All 21 previous tests continue to pass without modification.
- Total tests now: **44 tests** (3 shared, 40 api, 1 web).
- New tests added:
  - `webhook-signature.test.ts`: 7 tests
  - `github-client.test.ts`: 5 tests
  - `webhook-delivery.test.ts`: 4 tests
  - `webhook-events.test.ts`: 7 tests
- No existing tests were modified or deleted.

---

## 3. Scope Comparison to Plan

| File                                                  | Change Status | Justification                                                                                                               |
| :---------------------------------------------------- | :------------ | :-------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/app.ts`                                 | Modified      | Mounted `/webhooks/github` raw body handler before `express.json()`; exposed DI for `reviewQueue` and `githubClient`.       |
| `apps/api/src/github/`                                | Added         | Interfaces and implementations for client, token cache, fake clock, signature verification, queue stub, and webhook router. |
| `apps/api/src/models/`                                | Added         | Mongoose models for `Installation`, `Repository`, `PullRequest`, and `WebhookDelivery`.                                     |
| `apps/api/src/__tests__/`                             | Added         | Unit and integration tests for signatures, delivery deduplication, events, and token cache with fake clock.                 |
| `docs/GITHUB_APP_SETUP.md`                            | Added         | Step-by-step GitHub App registration and smee.io guide required by prompt.                                                  |
| `CHANGELOG.md`                                        | Modified      | Phase 3 release notes entry added.                                                                                          |
| `docs/verification/phase-3-github-app-integration.md` | Added         | This verification report.                                                                                                   |

No files outside `apps/api` and `docs/` were touched.

---

## 4. Live Runtime Verification with curl

The server was started in live development mode on port 4005 with active MongoDB and Redis connections.

### 4.1 Missing Signature -> 401 Unauthorized

```bash
curl.exe -i -X POST http://127.0.0.1:4005/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: live-test-del-1" \
  -d '{"action":"opened"}'
```

Output:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
x-request-id: ad6a7bd1-d551-4c24-91a0-8c2b86b10987

{"error":{"code":"UNAUTHORIZED","message":"Invalid or missing webhook signature","requestId":"ad6a7bd1-d551-4c24-91a0-8c2b86b10987"}}
```

### 4.2 Invalid Signature -> 401 Unauthorized

```bash
curl.exe -i -X POST http://127.0.0.1:4005/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: live-test-del-2" \
  -H "X-Hub-Signature-256: sha256=0000000000000000000000000000000000000000000000000000000000000000" \
  -d '{"action":"opened"}'
```

Output:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
x-request-id: 2035a951-2d7c-497f-ac76-4045dcb2ca99

{"error":{"code":"UNAUTHORIZED","message":"Invalid or missing webhook signature","requestId":"2035a951-2d7c-497f-ac76-4045dcb2ca99"}}
```

### 4.3 Unsupported Event (`ping`) with Valid Signature -> 202 Accepted

```bash
curl.exe -i -X POST http://127.0.0.1:4005/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -H "X-GitHub-Delivery: live-test-del-ping" \
  -H "X-Hub-Signature-256: sha256=6aa73e3746abd9da164d1f4b9cea67ae30daf1045ff66d3b65d3cd3ad64aec13" \
  --data-binary "@scratch/payload-ping.json"
```

Output:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json; charset=utf-8
x-request-id: 85e088bc-a33a-4e69-8d8a-d187962fc133

{"message":"Event ignored"}
```

### 4.4 Handled Event (`pull_request.opened`) with Valid Signature -> 200 OK

```bash
curl.exe -i -X POST http://127.0.0.1:4005/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: live-test-del-pr-1" \
  -H "X-Hub-Signature-256: sha256=05ee4795af6ab35053dac71b224a1ee755af8092aada5d902acc778239c56447" \
  --data-binary "@scratch/payload-pr.json"
```

Output:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
x-request-id: bf23c7f8-fc83-46e2-80e2-b47ee3a63708

{"message":"Pull request event processed"}
```

MongoDB verification confirmed documents were successfully saved:

- PullRequest: `githubId: 9001`, `title: "Add GitHub App Webhook Integration"`
- Repository: `githubId: 50001`, `fullName: "prism-org/prism"`
- WebhookDelivery: `deliveryId: "live-test-del-pr-1"`

### 4.5 Delivery Replay -> 200 OK (Deduplicated)

```bash
curl.exe -i -X POST http://127.0.0.1:4005/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: live-test-del-pr-1" \
  -H "X-Hub-Signature-256: sha256=05ee4795af6ab35053dac71b224a1ee755af8092aada5d902acc778239c56447" \
  --data-binary "@scratch/payload-pr.json"
```

Output:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
x-request-id: 3e8e80ef-778f-476c-9ed1-d485a7755d04

{"message":"Delivery already processed"}
```

### 4.6 Tampered Body -> 401 Unauthorized

```bash
curl.exe -i -X POST http://127.0.0.1:4005/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-GitHub-Delivery: live-test-del-tampered" \
  -H "X-Hub-Signature-256: sha256=05ee4795af6ab35053dac71b224a1ee755af8092aada5d902acc778239c56447" \
  --data-binary "@scratch/payload-tampered.json"
```

Output:

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8
x-request-id: 753eb4f4-0645-4a88-bee3-80005721845d

{"error":{"code":"UNAUTHORIZED","message":"Invalid or missing webhook signature","requestId":"753eb4f4-0645-4a88-bee3-80005721845d"}}
```
