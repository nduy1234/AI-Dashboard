# AI Revenue Command Center — Complete Project Guide

> Last updated: March 2026  
> Platform: AI-Dashboard monorepo  
> Stack: React + Vite (frontend), Express 5 + TypeScript (backend), PostgreSQL + Drizzle, Redis

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Tech Stack](#3-tech-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Authentication Flow](#5-authentication-flow)
6. [Phase 1 AI Outbound Pipeline](#6-phase-1-ai-outbound-pipeline)
7. [Integration Status](#7-integration-status)
8. [API Documentation](#8-api-documentation)
9. [Environment Variables Reference](#9-environment-variables-reference)
10. [Running Locally](#10-running-locally)
11. [Testing Each Integration](#11-testing-each-integration)
12. [End-to-End Test Flow](#12-end-to-end-test-flow)
13. [Frontend Auth Integration](#13-frontend-auth-integration)
14. [Session and Token Persistence](#14-session-and-token-persistence)
15. [Known Limitations](#15-known-limitations)
16. [Next Steps / Roadmap](#16-next-steps--roadmap)
17. [Setting Up Integration Tools](#17-setting-up-integration-tools)

---

## 1. Project Overview

**AI Revenue Command Center** is a multi-tenant B2B SaaS platform that automates the full outbound revenue pipeline using AI agents.

### Three core agents

- **AI Outbound Agent** — Sources leads, enriches, verifies, personalizes emails, and launches campaigns.
- **CRM Reactivation Agent** — Reactivates dormant leads from CRM systems.
- **Website Conversion Agent** — Qualifies website visitors and books meetings via AI chat.

---

## 2. Repository Structure

```
AI-Dashboard/
├── artifacts/
│   ├── api-server/          # Express 5 backend (Port 5000)
│   │   ├── src/
│   │   │   ├── lib/         # Provider clients (Apollo, Clay, etc.)
│   │   │   ├── routes/      # Express route handlers
│   │   │   ├── services/    # Business logic (outbound, webhook, onboarding)
│   │   │   ├── repositories/# DB query layer (Drizzle)
│   │   │   ├── middlewares/ # Auth, role, idempotency
│   │   │   └── security/    # Owner context / RBAC
│   └── revenue-platform/    # React + Vite frontend (Port 3000)
│       └── src/
│           ├── pages/       # Dashboard, Outbound, Analytics, etc.
│           ├── hooks/       # API hooks (leads, campaigns, AI, etc.)
│           └── components/  # UI components (layout, molecules, ui/)
├── lib/
│   ├── db/                  # PostgreSQL schema + Drizzle ORM client
│   ├── api-spec/            # OpenAPI 3.1 spec (openapi.yaml) + Orval codegen
│   ├── api-client-react/    # Generated React Query hooks from OpenAPI
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   └── replit-auth-web/     # Auth hooks (useAuth, auth-storage)
├── scripts/                 # Shell scripts for smoke tests and live integration tests
├── .env                     # Environment variables (never commit this)
└── pnpm-workspace.yaml      # Monorepo workspace config
```

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, shadcn/ui, Wouter, TanStack Query |
| Backend | Express 5, Node.js 24+, TypeScript (ESM) |
| Database | PostgreSQL + Drizzle ORM |
| Auth | Google OIDC via `openid-client`, httpOnly session cookies + JWTs |
| AI | OpenAI GPT-4o |
| API Contract | OpenAPI 3.1 → Orval codegen → typed React hooks + Zod schemas |
| Job Queue | Redis (BullMQ-style worker) |
| Monorepo | pnpm workspaces + TypeScript composite projects |
| API Docs | Swagger UI served at `/api/v1/docs` |

---

## 4. Architecture Overview

```
                          ┌─────────────────────────────────┐
                          │   Frontend (revenue-platform)   │
                          │   React + Vite + TanStack Query │
                          └────────────┬────────────────────┘
                                       │ HTTP/fetch + credentials:include
                                       ▼
                          ┌─────────────────────────────────┐
                          │   API Server (Express 5)        │
                          │   /api/v1/*                     │
                          │                                 │
                          │  Auth → Outbound → Webhooks     │
                          │  AI → Analytics → Integrations  │
                          └──────────┬──────────────────────┘
                    ┌────────────────┼─────────────────────┐
                    ▼                ▼                      ▼
             ┌────────────┐  ┌────────────┐       ┌──────────────┐
             │ PostgreSQL │  │   Redis    │       │ External     │
             │ (Drizzle)  │  │ Job Queue  │       │ Providers    │
             └────────────┘  └─────┬──────┘       └──────┬───────┘
                                   ▼                      │
                            ┌────────────┐       Apollo / Clay /
                            │  Worker    │       MillionVerifier /
                            │  Process   │       Resend / Instantly /
                            └────────────┘       OpenAI
```

### Request flow

1. Frontend calls generated React hook → `customFetch` → API server
2. `authMiddleware` attaches `req.user` from session (cookie) or Bearer JWT
3. Route handler validates request (Zod)
4. Business logic in service layer
5. DB operations via Drizzle repositories
6. Heavy jobs enqueued to Redis → processed by worker

---

## 5. Authentication Flow

### Browser flow (canonical)

```
1. User clicks "Sign in"
         ↓
2. Frontend: GET /api/v1/auth/google/start?redirectUri=http://localhost:3000/auth/google/callback
         ↓
3. Backend returns { authUrl, state }
         ↓
4. Browser redirects to Google OAuth (authUrl)
         ↓
5. Google redirects to http://localhost:3000/auth/google/callback?code=...&state=...
         ↓
6. Frontend: POST /api/v1/auth/google/exchange { code, state, redirectUri }
         ↓
7. Backend: creates DB session, sets httpOnly sid cookie, returns { accessToken, refreshToken, user }
         ↓
8. Frontend: stores { user, accessToken } in localStorage (ai-dashboard.auth-cache.v1)
         ↓
9. App loads, user profile visible
```

### Session persistence

- **Server-side**: `sessions` table in PostgreSQL, keyed by `sid`
- **Browser cookie**: `sid` (httpOnly, lax, not readable by JS)
- **Frontend localStorage**: user profile + accessToken for immediate rehydration on refresh
- **Bearer token**: auto-attached by `customFetch` on every API call from localStorage

### Logout flow

```
1. Frontend: window.location.href = "/api/v1/logout"
2. Backend: clears session + cookies
3. Redirects to app origin (Google end_session fallback)
4. Frontend localStorage cleared before redirect
```

---

## 6. Phase 1 AI Outbound Pipeline

### Pipeline stages

```
IMPORT → ENRICH → VERIFY → PERSONALIZE → LAUNCH
```

Each stage is an independent async job, queued in Redis, processed by the worker.

### Stage details

| Stage | Provider | What happens | API Endpoint |
|---|---|---|---|
| **Import** | Apollo (API) or manual CSV | Pulls lead list into DB | `POST /outbound/jobs/import` |
| **Enrich** | Clay (webhook) | Adds industry, company size, LinkedIn | `POST /outbound/jobs/enrich` |
| **Verify** | MillionVerifier | Marks email valid/invalid/risky | `POST /outbound/jobs/verify` |
| **Personalize** | OpenAI + heuristic scoring | Generates subject + body per lead | `POST /outbound/jobs/personalize` |
| **Launch** | Instantly or Resend | Sends campaign emails | `POST /outbound/jobs/launch` |

### Job lifecycle

```
queued → processing → completed / failed
```

- All job-triggering routes require `Idempotency-Key` header
- Jobs are idempotent: duplicate keys return the existing job
- Retry endpoint: `POST /outbound/jobs/:id/retry`

---

## 7. Integration Status

| Tool | Purpose | Status | Notes |
|---|---|---|---|
| **Apollo** | Lead sourcing | Configured, plan blocked | Free plan cannot use mixed_people/search. Use manual/export import instead |
| **Clay** | Lead enrichment | **Working** | Webhook mode, `x-clay-webhook-auth` header, returns industry/companySize/linkedinUrl |
| **MillionVerifier** | Email verification | Configured | Key set, ready to use |
| **Resend** | Email sending (pilot) | **Working** | Tested and verified via cURL |
| **Instantly** | Bulk campaign sending | Configured | API key set, needs `INSTANTLY_SEND_URL` for direct send; campaign launch via API works |
| **OpenAI** | Email personalization | Configured | Key set |
| **HubSpot** | CRM sync | Not configured | No API key yet |
| **Groq** | LLM alternative routing | Not configured | No key yet |
| **RB2B** | Website visitor identification | Not configured | No key yet |
| **Slack** | Notifications | Configured | Set `SLACK_WEBHOOK_URL` or `SLACK_BOT_TOKEN` |
| **Cal.com** | Meeting booking | Configured | Set `CALCOM_API_KEY` and `CALCOM_WEBHOOK_SECRET` |
| **Supabase** | Alternative DB/Auth | Not configured | Currently using PostgreSQL + custom auth |
| **Google OAuth** | User authentication | **Working** | OIDC via openid-client |
| **PostgreSQL** | Primary database | **Working** | Drizzle ORM |
| **Redis** | Job queue | Configured | Must be running locally |

---

## 8. API Documentation

### Interactive Swagger UI

```
http://localhost:5000/api/v1/docs
```

### OpenAPI endpoints

| Endpoint | Description |
|---|---|
| `GET /api/v1/openapi.json` | OpenAPI spec as JSON |
| `GET /api/v1/openapi.yaml` | OpenAPI spec as YAML |
| `GET /api/v1/docs` | Swagger UI |

### Key API route groups

| Group | Base path | Auth required |
|---|---|---|
| Auth | `/api/v1/auth/*`, `/api/v1/login`, `/api/v1/logout` | No |
| Dashboard | `/api/v1/dashboard/*` | Yes |
| Leads | `/api/v1/leads/*` | Yes |
| Campaigns | `/api/v1/campaigns/*` | Yes |
| Outbound | `/api/v1/outbound/*` | Yes (owner/admin role) |
| Analytics | `/api/v1/analytics/*` | Yes |
| AI | `/api/v1/ai/*` | Yes |
| Integrations | `/api/v1/integrations/*` | Yes |
| Webhooks | `/api/v1/webhooks/*` | No (HMAC signature required) |
| Docs | `/api/v1/docs`, `/api/v1/openapi.*` | No |

### API versioning

- Canonical: `/api/v1/*`
- Legacy alias: `/api/*` (same routes, backward compatible)

---

## 9. Environment Variables Reference

```env
# --- Database ---
DATABASE_URL="postgresql://user:password@localhost:5432/db"

# --- OpenAI ---
AI_INTEGRATIONS_OPENAI_API_KEY="sk-..."
AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1"

# --- Google OAuth ---
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
ISSUER_URL="https://accounts.google.com"

# --- JWT ---
JWT_SECRET="long-random-secret"
ACCESS_TOKEN_TTL_SECONDS="900"
REFRESH_TOKEN_TTL_SECONDS="2592000"

# --- Server ---
PUBLIC_URL="http://localhost:3000"
PORT="5000"
VITE_PORT="3000"
BASE_PATH="/"

# --- Swagger Docs ---
SWAGGER_DOCS_ENABLED="true"

# --- Redis ---
REDIS_URL="redis://127.0.0.1:6379"

# --- Webhook Secrets ---
WEBHOOK_SECRET_DEFAULT="dev-webhook-secret"
WEBHOOK_SECRET_RESEND="..."
WEBHOOK_SECRET_INSTANTLY="..."
WEBHOOK_SECRET_SMARTLEAD="..."

# --- Apollo ---
APOLLO_API_KEY="..."
APOLLO_BASE_URL="https://api.apollo.io"
APOLLO_IMPORT_ENDPOINT="/v1/mixed_people/search"

# --- Clay ---
CLAY_API_KEY="..."
CLAY_ENRICH_URL="https://api.clay.com/v3/sources/webhook/pull-in-data-from-a-webhook-<id>"
CLAY_WEBHOOK_AUTH_TOKEN="..."

# --- MillionVerifier ---
MILLIONVERIFIER_API_KEY="..."
MILLIONVERIFIER_BASE_URL="https://api.millionverifier.com/api/v3/"

# --- Resend ---
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="outbound@yourdomain.com"

# --- Instantly ---
INSTANTLY_API_KEY="..."
INSTANTLY_BASE_URL="https://api.instantly.ai"
INSTANTLY_ENDPOINTS_JSON='{"createCampaign":"/api/v2/campaigns","addLeads":"/api/v2/leads/add","activateCampaignTemplate":"/api/v2/campaigns/{id}/activate"}'
INSTANTLY_TIMEZONE="Etc/GMT"
INSTANTLY_CAMPAIGN_TEMPLATE_JSON=""

# --- Smartlead (disabled by default) ---
SMARTLEAD_API_KEY=""
SMARTLEAD_SEND_URL=""


# --- Provider toggles ---
OUTBOUND_DISABLED_PROVIDERS="smartlead"

# --- Slack ---
SLACK_WEBHOOK_URL=""
SLACK_BOT_TOKEN=""
SLACK_NOTIFY_CHANNEL="#outbound-alerts"

# --- Cal.com ---
CALCOM_API_KEY=""
CALCOM_WEBHOOK_SECRET=""

# --- Not yet integrated (add keys when ready) ---
# HUBSPOT_API_KEY=""
# GROQ_API_KEY=""
# RB2B_API_KEY=""
# SUPABASE_URL=""
# SUPABASE_ANON_KEY=""
```

---

## 10. Running Locally

### Prerequisites

- Node.js 24+
- pnpm 10+
- PostgreSQL instance
- Redis instance

### Setup

```bash
# Install dependencies
pnpm install

# Push DB schema
pnpm -C lib/db run push

# Start all services in parallel
pnpm -r --parallel run dev
```

### Services

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Swagger UI | http://localhost:5000/api/v1/docs |
| OpenAPI JSON | http://localhost:5000/api/v1/openapi.json |

### Regenerate API clients (after OpenAPI spec changes)

```bash
pnpm --filter @workspace/api-spec run codegen
```

### Validate OpenAPI spec

```bash
pnpm --filter @workspace/api-spec run validate
```

---

## 11. Testing Each Integration

First, load env vars:

```bash
set -a && source .env && set +a
```

### Apollo

```bash
# Test API key (expect 403 on free plan for this endpoint)
curl -i -X POST "${APOLLO_BASE_URL}${APOLLO_IMPORT_ENDPOINT}" \
  -H "Content-Type: application/json" \
  -H "x-api-key: ${APOLLO_API_KEY}" \
  -d '{"page":1,"per_page":1,"person_titles":["Founder"]}'
```

> Free plan blocks `mixed_people/search`. Use manual/CSV import instead.

### Clay

```bash
# Test webhook enrichment (should return 200)
curl -i -X POST "${CLAY_ENRICH_URL}" \
  -H "Content-Type: application/json" \
  -H "x-clay-webhook-auth: ${CLAY_WEBHOOK_AUTH_TOKEN}" \
  -d '{"email":"john@stripe.com","company":"Stripe","title":"Founder"}'
```

### MillionVerifier

```bash
# Test email verification
curl -sS "https://api.millionverifier.com/api/v3/?api=${MILLIONVERIFIER_API_KEY}&email=test@gmail.com" | jq .
```

### Resend

```bash
# Test API key validity
curl -sS "https://api.resend.com/domains" \
  -H "Authorization: Bearer ${RESEND_API_KEY}" | jq .
```

### OpenAI

```bash
# Test key validity
curl -sS "https://api.openai.com/v1/models" \
  -H "Authorization: Bearer ${AI_INTEGRATIONS_OPENAI_API_KEY}" | jq '.data[0].id'
```

---

## 12. End-to-End Test Flow

This is the minimum viable pipeline you can run today.

### Step 1: Import leads manually

```bash
curl -sS -X POST "http://localhost:5000/api/v1/outbound/jobs/import" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-import-001" \
  -d '{
    "source": "manual",
    "importType": "manual",
    "leads": [
      {
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@stripe.com",
        "company": "Stripe",
        "title": "Head of Growth"
      },
      {
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane@notion.so",
        "company": "Notion",
        "title": "VP of Sales"
      }
    ]
  }' | jq .
```

### Step 2: Enrich with Clay

```bash
curl -sS -X POST "http://localhost:5000/api/v1/outbound/jobs/enrich" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-enrich-001" \
  -d '{
    "leadIds": [1, 2],
    "provider": "clay"
  }' | jq .
```

### Step 3: Verify emails

```bash
curl -sS -X POST "http://localhost:5000/api/v1/outbound/jobs/verify" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-verify-001" \
  -d '{
    "leadIds": [1, 2],
    "provider": "millionverifier"
  }' | jq .
```

### Step 4: Personalize emails

```bash
curl -sS -X POST "http://localhost:5000/api/v1/outbound/jobs/personalize" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-personalize-001" \
  -d '{
    "leadIds": [1, 2],
    "campaignId": 1,
    "provider": "openai"
  }' | jq .
```

### Step 5: Launch with Resend

```bash
curl -sS -X POST "http://localhost:5000/api/v1/outbound/jobs/launch" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-launch-001" \
  -d '{
    "campaignId": 1,
    "leadIds": [1, 2],
    "provider": "resend",
    "dailyCap": 50
  }' | jq .
```

### Step 6: Check pipeline stats

```bash
curl -sS "http://localhost:5000/api/v1/outbound/leads/pipeline" \
  -H "Authorization: Bearer ${TOKEN}" | jq .
```

### Step 7: Run pilot KPI validation

```bash
curl -sS -X POST "http://localhost:5000/api/v1/outbound/pilot/run" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-pilot-001" \
  -d '{"campaignId": 1}' | jq .
```

### Poll a job status

```bash
curl -sS "http://localhost:5000/api/v1/outbound/jobs/<JOB_ID>" \
  -H "Authorization: Bearer ${TOKEN}" | jq .
```

---

## 13. Frontend Auth Integration

### How login works (browser)

1. User visits app → `useAuth()` checks localStorage for cached user
2. If cached → show app immediately, validate with server in background
3. If no cache → `isLoading=true`, fetch `/api/v1/auth/user`
4. If unauthenticated → show `LoginPage`
5. Click "Sign in" → fetch `/api/v1/auth/google/start` → redirect to Google
6. Google returns to `/auth/google/callback`
7. Frontend calls `POST /api/v1/auth/google/exchange`
8. User + accessToken stored in localStorage, user redirected to app

### Files involved

| File | Role |
|---|---|
| `lib/replit-auth-web/src/use-auth.ts` | Core auth hook — login/logout/user state |
| `lib/replit-auth-web/src/auth-storage.ts` | localStorage read/write for user + token |
| `artifacts/revenue-platform/src/pages/auth-callback.tsx` | Handles `/auth/google/callback` route |
| `artifacts/revenue-platform/src/App.tsx` | Route guard via `ProtectedRoute` |
| `lib/api-client-react/src/custom-fetch.ts` | Auto-attaches Bearer token to all API calls |

### Auth routes used by frontend

| Route | Purpose |
|---|---|
| `GET /api/v1/auth/google/start` | Get Google OAuth URL |
| `POST /api/v1/auth/google/exchange` | Exchange code for tokens |
| `GET /api/v1/auth/user` | Check current session |
| `GET /api/v1/logout` | Clear session + redirect |

---

## 14. Session and Token Persistence

### What is stored where

| Data | Location | Readable by JS? | Cleared on logout? |
|---|---|---|---|
| Session ID (`sid`) | httpOnly cookie | No | Yes |
| Refresh token | httpOnly cookie | No | Yes |
| User profile | localStorage | Yes | Yes |
| Access token (JWT) | localStorage | Yes | Yes |
| `returnTo` path | sessionStorage | Yes | After redirect |
| Session data (full) | PostgreSQL `sessions` table | No (server-only) | Yes |

### localStorage key

```
ai-dashboard.auth-cache.v1
```

Contains:
```json
{
  "user": {
    "id": "...",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "profileImageUrl": "https://..."
  },
  "accessToken": "eyJ..."
}
```

### How API calls are authenticated

1. `customFetch` reads `accessToken` from localStorage
2. Adds `Authorization: Bearer <token>` header automatically
3. Also sends `credentials: "include"` for cookie session fallback
4. Backend `authMiddleware` accepts either Bearer JWT or cookie `sid`

---

## 15. Known Limitations

| Issue | Detail |
|---|---|
| Apollo free plan | `mixed_people/search` blocked on free tier — use manual/CSV import |
| Clay token leaked | Token shared in chat — rotate at `Settings > API key > Refresh auth token` |
| No token refresh UI | Access token expires in 15 min — no silent refresh implemented yet |
| HubSpot/Groq/RB2B | Not configured — missing API keys |
| Supabase | Not integrated — using PostgreSQL + custom auth |
| pnpm build | `mockup-sandbox` and `revenue-platform` have missing `vite/client` types in full monorepo build (unrelated to auth/outbound) |

---

## 16. Next Steps / Roadmap

### Immediate (can do today)

- [ ] Rotate Clay webhook token (leaked in chat)
- [ ] Run end-to-end manual import → launch test

### Short term

- [ ] Add HubSpot integration (CRM sync for reactivation)
- [ ] Wire frontend Integrations page to real connect/test actions

### Medium term

- [ ] Implement silent token refresh (`POST /api/v1/auth/refresh`)
- [ ] Add RB2B visitor identification webhook handler
- [ ] Add Groq as OpenAI alternative for model routing
- [ ] Add Apollo paid plan or alternative (Instantly, Lemlist) for lead sourcing

### Platform

- [ ] Fix full monorepo `pnpm run build` typecheck failures
- [ ] Add automated tests (unit + integration)
- [ ] Add CI/CD pipeline with OpenAPI spec validation gate

---

## 17. Setting Up Integration Tools

### Slack Integration

The platform supports two ways to send Slack notifications for events like booked meetings and positive replies. **You only need to configure one method**.

#### Method 1: Incoming Webhook (The Easy Way)
*Best if you just want to drop all alerts into a single specific channel.*

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create an App** > **From scratch**.
2. Name it (e.g., "AI Revenue Dashboard") and select your workspace.
3. On the left sidebar, click **Incoming Webhooks** and flip the toggle to **On**.
4. Scroll down and click **Add New Webhook to Workspace**.
5. Select the channel for notifications and click Allow.
6. Copy the Webhook URL and save it to `.env`:
   ```env
   SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
   ```
*(You can leave `SLACK_BOT_TOKEN` empty).*

#### Method 2: Bot Token (The Robust Way)
*Best if you might want to dynamically post to different channels later or eventually let the bot read channel messages.*

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps).
2. Go to **OAuth & Permissions** on the left.
3. Under **Bot Token Scopes**, click **Add an OAuth Scope** and add `chat:write`.
4. Run up to the top and click **Install to Workspace** > **Allow**.
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`).
6. Identify the **Channel ID** where you want to post (Right click the channel in Slack > View channel details > copy the ID at the bottom, e.g., `C12345678`).
7. Save these to `.env`:
   ```env
   SLACK_BOT_TOKEN="xoxb-..."
   SLACK_NOTIFY_CHANNEL="C12345678"
   ```
*(You can leave `SLACK_WEBHOOK_URL` empty).*

### Cal.com Integration
*Used to automatically track when prospects book meetings from your outbound emails.*

1. Go to [Cal.com](https://cal.com) and sign into your account.
2. On the left sidebar, go to **Settings** > **Developer** > **API Keys**.
3. Create a new API key (e.g., "AI Dashboard API").
4. Copy the key and add it to your `.env` as `CALCOM_API_KEY`.
5. Now, go to **Settings** > **Developer** > **Webhooks**.
6. Click **New Webhook**.
   - **Payload URL**: `https://<YOUR_PRODUCTION_DOMAIN>/api/v1/webhooks/calcom` (If testing locally, you can use ngrok: `https://<your-ngrok-id>.ngrok-free.app/api/v1/webhooks/calcom`)
   - **Events**: Select **Booking Created** (and any other booking statuses you want to track).
7. Save the webhook. Cal.com will generate a **Webhook Secret**.
8. Click to reveal the secret, copy it, and add it to your `.env` as `CALCOM_WEBHOOK_SECRET`.

---

*This document covers the full project state as of March 2026.*
*Generated from actual codebase and conversation context.*
