# AI Revenue Command Center (Monorepo)

A production-ready AI revenue platform for B2B pipeline generation. This is a TypeScript monorepo using pnpm workspaces, with an Express 5 API backend and React + Vite frontend.

## Index

1. [Platform Overview](#1-platform-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Prerequisites](#4-prerequisites)
5. [Installation](#5-installation)
6. [Environment Configuration](#6-environment-configuration)
7. [Database Setup](#7-database-setup)
8. [Run Locally](#8-run-locally)
9. [API Documentation](#9-api-documentation)
10. [OpenAPI Tooling](#10-openapi-tooling)
11. [Phase 1 AI Outbound Endpoints](#11-phase-1-ai-outbound-endpoints)
12. [Phase 1.1 Operationalization](#12-phase-11-operationalization)
13. [Smoke Test Flow](#13-smoke-test-flow)
14. [Build for Production](#14-build-for-production)
15. [License](#15-license)
16. [Backend-Only Guide](#16-backend-only-guide)

## 1. Platform Overview

- Omni-channel AI agents for outbound, reactivation, and conversion.
- Multi-tenant architecture with organizations and team access.
- Event-driven analytics for campaign performance and pipeline health.
- OpenAPI-first contracts with generated clients and Zod validation.

## 2. Tech Stack

- Frontend: React 18, Vite, Tailwind CSS, shadcn/ui, wouter, TanStack Query.
- Backend: Express 5 (ESM), Node.js 24+, OpenID Connect (Google OAuth).
- Database: PostgreSQL + Drizzle ORM.
- AI: OpenAI GPT-4o integration (with outbound model routing support).
- Monorepo: pnpm workspaces + TypeScript composite projects.

## 3. Repository Structure

```text
.
├── artifacts/
│   ├── api-server/          # Express API server (Port 5000)
│   └── revenue-platform/    # React + Vite frontend (Port 3000)
├── lib/
│   ├── db/                  # Shared Drizzle schema and DB client
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   ├── api-client-react/    # Generated React Query hooks
│   └── replit-auth-web/     # Shared auth hooks
├── PHASE1_1_OPERATIONALIZATION.md
├── package.json
└── pnpm-workspace.yaml
```

## 4. Prerequisites

- Node.js 24+
- pnpm 10+
- PostgreSQL instance with a database provisioned

## 5. Installation

```bash
pnpm install
```

## 6. Environment Configuration

Create `.env` at repo root:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/your_db"

# OpenAI
AI_INTEGRATIONS_OPENAI_API_KEY="sk-..."
AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1"

# Google OAuth
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Server
PUBLIC_URL="http://localhost:3000"
PORT="5000"
VITE_PORT="3000"
SWAGGER_DOCS_ENABLED="true"

# Optional webhook secrets
WEBHOOK_SECRET_DEFAULT="dev-webhook-secret"
WEBHOOK_SECRET_RESEND="..."
WEBHOOK_SECRET_INSTANTLY="..."
WEBHOOK_SECRET_SMARTLEAD="..."
```

## 7. Database Setup

Push Drizzle schema:

```bash
pnpm -C lib/db run push
```

## 8. Run Locally

```bash
pnpm -r --parallel run dev
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`

## 9. API Documentation

- Swagger UI: `http://localhost:5000/api/v1/docs`
- OpenAPI JSON: `http://localhost:5000/api/v1/openapi.json`
- OpenAPI YAML: `http://localhost:5000/api/v1/openapi.yaml`

Legacy aliases remain available under `/api/*`.

Canonical OpenAPI file:

- `lib/api-spec/openapi.yaml`

## 10. OpenAPI Tooling

Regenerate typed clients and zod schemas:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Validate OpenAPI:

```bash
pnpm --filter @workspace/api-spec run validate
```

Build static docs:

```bash
pnpm --filter @workspace/api-spec run build:docs:static
```

## 11. Phase 1 AI Outbound Endpoints

Core orchestration:

- `POST /api/v1/outbound/jobs/import`
- `POST /api/v1/outbound/jobs/enrich`
- `POST /api/v1/outbound/jobs/verify`
- `POST /api/v1/outbound/jobs/personalize`
- `POST /api/v1/outbound/jobs/launch`
- `POST /api/v1/outbound/jobs/{id}/retry`
- `GET /api/v1/outbound/jobs/{id}`

Operational and KPI:

- `GET /api/v1/outbound/config`
- `GET /api/v1/outbound/leads/pipeline`
- `GET /api/v1/outbound/campaigns/{id}/performance`
- `POST /api/v1/outbound/pilot/run`

Webhook ingress:

- `POST /api/v1/webhooks/sending/{provider}`
- `POST /api/v1/webhooks/crm/{provider}`

## 12. Phase 1.1 Operationalization

### 12.1 Bootstrap provider/domain state

```bash
SEED_USER_ID="<your-user-id>" pnpm --filter @workspace/api-server run seed:phase1.1
```

Script path:

- `artifacts/api-server/src/seedPhase11Operationalization.ts`

### 12.2 Import n8n workflow template

Workflow file:

- `artifacts/api-server/workflows/outbound-phase1-1.n8n.workflow.json`

Expected workflow input fields:

- `baseUrl`
- `token`
- `campaignId`
- `leadIds`
- `leads`

### 12.3 Full operational runbook

- `PHASE1_1_OPERATIONALIZATION.md`

## 13. Smoke Test Flow

Recommended sequence:

1. `GET /api/v1/outbound/config`
2. `POST /api/v1/outbound/jobs/import`
3. `POST /api/v1/outbound/jobs/enrich`
4. `POST /api/v1/outbound/jobs/verify`
5. `POST /api/v1/outbound/jobs/personalize`
6. `POST /api/v1/outbound/jobs/launch`
7. `GET /api/v1/outbound/leads/pipeline`
8. `GET /api/v1/outbound/campaigns/{id}/performance`
9. `POST /api/v1/outbound/pilot/run`
10. `POST /api/v1/webhooks/sending/{provider}`

Always include `Idempotency-Key` on job-triggering routes.

## 14. Build for Production

```bash
pnpm run build
```

## 15. License

MIT

## 16. Backend-Only Guide

For backend setup and operations only, use:

- `artifacts/api-server/README.md`
