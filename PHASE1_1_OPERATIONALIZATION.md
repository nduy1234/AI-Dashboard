# Phase 1.1 Operationalization

This document moves Phase 1 from implemented APIs to repeatable day-to-day operation.

## Outcomes

- Bootstrap sender providers and domain pool in database.
- Connect a baseline n8n flow to outbound job endpoints.
- Run a pilot and validate KPI thresholds through API.

## Prerequisites

- Backend is running.
- Database schema is up to date.
- You have a user id (`SEED_USER_ID`) that owns or belongs to an org.
- Environment has webhook secrets if you plan to test signatures:
  - `WEBHOOK_SECRET_DEFAULT`
  - or provider-specific `WEBHOOK_SECRET_<PROVIDER>`

## Step 1: Bootstrap Phase 1.1 records

Run:

```bash
SEED_USER_ID="<your-user-id>" pnpm --filter @workspace/api-server run seed:phase1.1
```

This script ensures:

- Integrations: `apollo`, `clay`, `millionverifier`, `resend`, `hubspot`, `calcom`, `rb2b`, `n8n`
- Provider accounts: `resend`, `instantly`, `smartlead`
- Domain pool baseline with safe daily limits and warmup enabled

Script path:

- `artifacts/api-server/src/seedPhase11Operationalization.ts`

## Step 2: Import n8n baseline workflow

Workflow file:

- `artifacts/api-server/workflows/outbound-phase1-1.n8n.workflow.json`

Import into n8n and set an input object containing:

- `baseUrl` (example: `http://localhost:5000`)
- `token` (session bearer token)
- `campaignId` (existing campaign id)
- `leadIds` (array of lead ids)
- `leads` (array of lead objects for import stage)

Flow stages:

1. Create import job
2. Create enrich job
3. Create verify job
4. Create personalize job
5. Create launch job
6. Validate pilot KPIs

## Step 3: Pilot execution checklist

- Confirm frozen config:
  - `GET /api/v1/outbound/config`
- Check lead pipeline before/after run:
  - `GET /api/v1/outbound/leads/pipeline`
- Check campaign performance:
  - `GET /api/v1/outbound/campaigns/:id/performance`
- Run pilot validation:
  - `POST /api/v1/outbound/pilot/run`

Success criteria:

- Open rate >= configured minimum
- Reply rate >= configured minimum
- Positive reply rate >= configured minimum

## Step 4: Webhook readiness

Configured webhook endpoints:

- `POST /api/v1/webhooks/sending/:provider`
- `POST /api/v1/webhooks/crm/:provider`

Required header:

- `x-webhook-signature` (HMAC SHA256 over raw JSON body)

## Suggested first production-safe defaults

- Start with provider `resend` for controlled pilot sending.
- Keep `dailyCap` at 50 or less for initial campaigns.
- Use deterministic idempotency keys per run/stage.
- Pause domains if health drops below 80.
