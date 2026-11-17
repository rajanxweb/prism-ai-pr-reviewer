# GitHub App Setup & Webhook Configuration Guide

This guide details the step-by-step procedure for creating, configuring, and testing the **PRism** GitHub App for local development and production.

---

## 1. Prerequisites

- A GitHub personal account or organization with administrative privileges.
- Node.js 20+ and npm installed.
- MongoDB and Redis instances running (e.g., via `docker compose -f docker-compose.dev.yml up -d`).

---

## 2. Registering the GitHub App on GitHub

1. Navigate to GitHub:
   - **Personal Account**: [GitHub Developer Settings - GitHub Apps](https://github.com/settings/apps)
   - **Organization**: Go to `https://github.com/organizations/<YOUR_ORG>/settings/apps`
2. Click **New GitHub App**.
3. Fill in the **App Details**:
   - **GitHub App name**: `PRism-Reviewer-Dev` (must be globally unique).
   - **Homepage URL**: `http://localhost:5173` (or your production frontend URL).
   - **Callback URL**: (Leave blank for now, or `http://localhost:4000/auth/github/callback`).
   - Uncheck **Expire user authorization tokens** (optional).

---

## 3. Webhook Configuration & Smee.io Forwarding

For local development, GitHub cannot send webhooks directly to `localhost`. We use **smee.io** as a webhook proxy.

### 3.1 Create a Smee.io Channel

1. Go to [https://smee.io/](https://smee.io/) and click **Start a new channel**.
2. Copy the generated webhook proxy URL (e.g., `https://smee.io/abc123xyz456`).

### 3.2 Configure Webhook in GitHub App

In the GitHub App creation form:

- **Webhook URL**: Enter your Smee URL (e.g., `https://smee.io/abc123xyz456`).
- **Webhook secret**: Enter a strong random secret. You can generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  _Save this secret for your `.env` file._
- Ensure **Active** checkbox is checked under Webhook.

### 3.3 Run Local Webhook Forwarder

In a dedicated terminal, run the Smee client to forward payloads to your local API server:

```bash
npx smee-client --url https://smee.io/abc123xyz456 --target http://localhost:4000/webhooks/github
```

You should see:

```text
Forwarding https://smee.io/abc123xyz456 to http://localhost:4000/webhooks/github
Connected https://smee.io/abc123xyz456
```

---

## 4. Setting Permissions

Under **Permissions**, configure the following access levels:

### Repository Permissions

| Permission        | Access           | Justification                                                         |
| :---------------- | :--------------- | :-------------------------------------------------------------------- |
| **Pull requests** | **Read & write** | Read PR metadata, diffs, commits, and submit review comments.         |
| **Contents**      | **Read-only**    | Retrieve repository source files for LLM analysis.                    |
| **Checks**        | **Read & write** | Create and annotate GitHub Check Runs with code review feedback.      |
| **Metadata**      | **Read-only**    | Mandatory for all GitHub Apps to access basic repository information. |

### Organization / Account Permissions

- None required for standard PR review workflows.

---

## 5. Subscribing to Webhook Events

Under **Subscribe to events**, check the following event triggers:

- [x] **Pull request**: Needed to detect `opened`, `synchronize`, and `reopened` actions to trigger reviews.
- [x] **Installation**: Needed to record when the app is installed (`created`) or uninstalled (`deleted`).
- [x] **Installation repositories**: Needed to track when repositories are added or removed from an installation.

---

## 6. Where can this GitHub App be installed?

Select:

- **Only on this account** (for development/testing), OR
- **Any account** (if publishing as a multi-tenant GitHub App).

Click **Create GitHub App**.

---

## 7. Generating Private Key & Credentials

1. On the app summary page, note the **App ID** (e.g., `123456`).
2. Scroll to the **Private keys** section at the bottom.
3. Click **Generate a private key**.
4. A `.pem` file will download automatically (e.g., `prism-reviewer-dev.2026-11-17.private-key.pem`).
5. Store this key securely in your project directory (e.g., `keys/github-app.pem`) and ensure `keys/` is added to `.gitignore`.

---

## 8. Configuring Environment Variables

Update your local `.env` file with the GitHub App configuration:

```env
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_PRIVATE_KEY_PATH=./keys/github-app.pem
GITHUB_WEBHOOK_SECRET=your_generated_webhook_secret_here

# Server & Database Configuration
PORT=4000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/prism
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:5173
```

---

## 9. Installing the App to a Test Repository

1. In the GitHub App settings page, click **Install App** in the left sidebar.
2. Select your account or test organization.
3. Select **Only select repositories** and pick a repository to test with.
4. Click **Install**.
5. Observe the Smee client forwarding the `installation.created` event to `http://localhost:4000/webhooks/github`.
6. Open a test Pull Request on that repository: observe the `pull_request.opened` event delivered and processed!
