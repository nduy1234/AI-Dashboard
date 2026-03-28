# API Server (Backend) Guide

Backend service for AI Revenue Command Center. This service exposes REST APIs for auth, leads, campaigns, AI actions, outbound orchestration, webhooks, and analytics.

## Index

1. [Scope](#1-scope)
2. [Tech Stack](#2-tech-stack)
3. [Run Backend Locally](#3-run-backend-locally)
4. [Environment Variables](#4-environment-variables)
5. [Backend Scripts](#5-backend-scripts)
6. [API Base URLs and Docs](#6-api-base-urls-and-docs)
7. [Phase 1 Outbound APIs](#7-phase-1-outbound-apis)
8. [Phase 1.1 Operationalization](#8-phase-11-operationalization)
9. [n8n Workflow Template](#9-n8n-workflow-template)
10. [Webhook Security](#10-webhook-security)
11. [Smoke Test Order](#11-smoke-test-order)
12. [Troubleshooting](#12-troubleshooting)

## 1. Scope

This backend owns:

- OIDC auth/session handling
- Multi-tenant org-aware API access
- Lead/campaign CRUD and AI generation endpoints
- Phase 1 outbound orchestration jobs
- Sending/CRM webhook ingestion
- KPI and analytics computations

## 2. Tech Stack

- Node.js + Express 5 (ESM)
- Drizzle ORM + PostgreSQL
- OpenAPI spec-first contract (`lib/api-spec/openapi.yaml`)
- Generated zod validation (`@workspace/api-zod`)
- OpenID Connect auth (`openid-client`)

## 3. Run Backend Locally

From repository root:

```bash
pnpm --filter @workspace/api-server run dev
```

Default backend URL: `http://localhost:5000`

## 4. Environment Variables

Set in root `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/your_db"
PUBLIC_URL="http://localhost:3000"
PORT="5000"
SWAGGER_DOCS_ENABLED="true"

GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

AI_INTEGRATIONS_OPENAI_API_KEY="sk-..."
AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1"

WEBHOOK_SECRET_DEFAULT="dev-webhook-secret"
WEBHOOK_SECRET_RESEND="..."
WEBHOOK_SECRET_INSTANTLY="..."
WEBHOOK_SECRET_SMARTLEAD="..."
```

## 5. Backend Scripts

Run from repo root:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run seed:phase1.1
```

## 6. API Base URLs and Docs

Base paths:

- Canonical: `/api/v1`
- Legacy alias: `/api`

Docs endpoints:

- `GET /api/v1/docs`
- `GET /api/v1/openapi.json`
- `GET /api/v1/openapi.yaml`

## 7. Phase 1 Outbound APIs

Jobs:

- `POST /api/v1/outbound/jobs/import`
- `POST /api/v1/outbound/jobs/enrich`
- `POST /api/v1/outbound/jobs/verify`
- `POST /api/v1/outbound/jobs/personalize`
- `POST /api/v1/outbound/jobs/launch`
- `POST /api/v1/outbound/jobs/{id}/retry`
- `GET /api/v1/outbound/jobs/{id}`

Read and KPI:

- `GET /api/v1/outbound/config`
- `GET /api/v1/outbound/leads/pipeline`
- `GET /api/v1/outbound/campaigns/{id}/performance`
- `POST /api/v1/outbound/pilot/run`

## 8. Phase 1.1 Operationalization

Bootstrap integrations/provider accounts/domain pool:

```bash
SEED_USER_ID="<your-user-id>" pnpm --filter @workspace/api-server run seed:phase1.1
```

Seeder path:

- `artifacts/api-server/src/seedPhase11Operationalization.ts`

## 9. n8n Workflow Template

Import:

- `artifacts/api-server/workflows/outbound-phase1-1.n8n.workflow.json`

Expected input payload keys:

- `baseUrl`
- `token`
- `campaignId`
- `leadIds`
- `leads`

## 10. Webhook Security

Webhook routes:

- `POST /api/v1/webhooks/sending/{provider}`
- `POST /api/v1/webhooks/crm/{provider}`

Required header:

- `x-webhook-signature`

Signature algorithm:

- HMAC SHA256 over raw JSON body
- secret from `WEBHOOK_SECRET_<PROVIDER>` or fallback `WEBHOOK_SECRET_DEFAULT`

## 11. Smoke Test Order

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

For every mutating outbound job call, send `Idempotency-Key` header.

## 12. Troubleshooting

- `401 Authentication required`: use valid bearer session token.
- `403 Insufficient role permissions`: user is not `owner` or `admin` in org.
- `400 Idempotency-Key header is required`: include `Idempotency-Key` for mutating job routes.
- `500` on outbound send: check integration/provider config and webhook secrets.
- Missing docs routes: ensure `SWAGGER_DOCS_ENABLED="true"`.
