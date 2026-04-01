# Phase 1.1 Operationalization

This document moves Phase 1 from implemented APIs to repeatable day-to-day operation.

## Outcomes

- Bootstrap sender providers and domain pool in database.
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

- Integrations: `apollo`, `clay`, `millionverifier`, `resend`, `hubspot`, `calcom`, `rb2b`
- Provider accounts: `resend`, `instantly`, `smartlead`
- Domain pool baseline with safe daily limits and warmup enabled

Script path:

- `artifacts/api-server/src/seedPhase11Operationalization.ts`


## Step 2: Pilot execution checklist

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
