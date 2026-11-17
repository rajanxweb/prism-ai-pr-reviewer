# Architecture Overview

## 1. System Overview

<!-- High-level summary of the AI PR Reviewer and MERN dashboard -->

## 2. High-Level Architecture Diagram

<!-- Flow of GitHub webhooks, asynchronous queue workers, LLM analysis, inline comment posting, and dashboard ingestion -->

## 3. Core Components

### 3.1 GitHub Webhook Ingestion & App Engine

<!-- Octokit integration, webhook signature verification, event handling -->

### 3.2 Job Queue & Worker Architecture

<!-- BullMQ + Redis job processing, concurrency, retry strategies -->

### 3.3 LLM Review Pipeline & Interfaces

<!-- Prompt management, chunking/diff analysis, interface abstractions, inline comment generation -->

### 3.4 Data Storage & Aggregation

<!-- MongoDB / Mongoose schema design: Repositories, Reviews, Metrics, Code Quality Trends -->

### 3.5 API Server

<!-- Express REST API, Zod request/response validation, authentication/authorization -->

### 3.6 Frontend Dashboard

<!-- React + Vite + Tailwind, data visualization (trends, metrics, review history) -->

## 4. Cross-Cutting Concerns

### 4.1 Configuration & Secrets Management

<!-- Zod-validated environment config, key management -->

### 4.2 Security Architecture

<!-- Untrusted PR input sanitization, webhook signature verification, rate limiting -->

### 4.3 Observability & Logging

<!-- Structured logging with Pino, error tracking, queue monitoring -->

## 5. Testing & Isolation Strategy

<!-- Port & adapter / interface fakes, Vitest, Supertest, no external network access in tests -->
