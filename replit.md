# Agentic AI Revenue Platform

## Overview

A production-ready SaaS web application — an AI Revenue Command Center for B2B companies to automate pipeline generation. Built as a pnpm workspace monorepo using TypeScript.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui + Recharts + wouter
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect with PKCE)
- **AI**: OpenAI GPT via Replit AI Integrations
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle for API server), Vite (frontend)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          # Express 5 API server
│   └── revenue-platform/    # React + Vite frontend
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval codegen config
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   ├── db/                  # Drizzle ORM schema + DB connection
│   ├── replit-auth-web/     # Frontend auth hook (useAuth)
│   └── integrations-openai-ai-server/ # OpenAI client
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Core Features

1. **Dashboard** — KPI stat cards (prospects, emails sent, reply rate, meetings booked, reactivated leads, website conversions) + charts (outbound performance, pipeline generated, conversion funnel)
2. **AI Outbound Agent** — Lead sourcing, email verification, AI-personalized email generation, campaign sequences
3. **CRM Reactivation Agent** — Dormant lead revival, re-engagement campaigns
4. **Website Conversion Agent** — AI chat widget, visitor qualification, auto-booking
5. **Campaigns** — Create, launch, pause, track outbound and reactivation campaigns
6. **Integrations** — Apollo, MillionVerifier, Instantly, Mailwarm, GoHighLevel, HubSpot, Calendly, Tidio
7. **Analytics** — Open rates, reply rates, meetings booked, revenue generated with historical trends
8. **Settings** — Team management, API keys, prompt templates

## Database Schema

Tables: `users`, `sessions`, `leads`, `campaigns`, `campaign_leads`, `email_accounts`, `integrations`, `knowledge_base_docs`, `agent_logs`, `api_keys`, `prompt_templates`, `analytics_events`, `team_members`, `organizations`, `org_memberships`

Multi-tenant: Each user gets an auto-created organization on first login. Leads, campaigns, email accounts, and integrations carry both `userId` and `orgId`. Team members are scoped via `org_memberships`.

## API Routes (all under `/api`)

- `GET /healthz` — Health check
- `GET/POST /auth/*` — Authentication (login, callback, logout, user)
- `GET /dashboard/stats`, `GET /dashboard/charts` — Dashboard data
- `GET/POST /leads`, `GET/PATCH/DELETE /leads/:id`, `POST /leads/import`, `POST /leads/verify`
- `GET/POST /campaigns`, `GET/PATCH/DELETE /campaigns/:id`, `POST /campaigns/:id/launch`, `POST /campaigns/:id/pause`
- `GET/POST /email-accounts`, `DELETE /email-accounts/:id`
- `GET /integrations`, `PATCH /integrations/:id`
- `GET /analytics/overview`, `GET /analytics/campaigns`
- `POST /ai/personalize`, `POST /ai/generate-sequence`, `POST /ai/qualify-lead`, `POST /ai/chat`, `POST /ai/reactivation`
- `GET/POST /knowledge-base`, `DELETE /knowledge-base/:id`
- `GET /agent-logs`
- `GET /settings/team`, `GET/POST /settings/api-keys`, `DELETE /settings/api-keys/:id`
- `GET/POST /settings/prompt-templates`, `PATCH/DELETE /settings/prompt-templates/:id`

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — `pnpm run typecheck`
- **`emitDeclarationOnly`** — only emit `.d.ts` files; JS bundling handled by esbuild/tsx/vite
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array

## Root Scripts

- `pnpm run build` — runs `typecheck` then recursively `build` in all packages
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server with Replit Auth, OpenAI integration, and all route handlers.

- Entry: `src/index.ts` — reads `PORT`, starts Express, seeds demo data
- App setup: `src/app.ts` — CORS, JSON parsing, auth middleware, routes at `/api`
- Auth: `src/lib/auth.ts` + `src/middlewares/authMiddleware.ts` + `src/routes/auth.ts`
- Routes: dashboard, leads, campaigns, emailAccounts, integrations, analytics, ai, knowledgeBase, agentLogs, settings
- Depends on: `@workspace/db`, `@workspace/api-zod`, `@workspace/integrations-openai-ai-server`

### `artifacts/revenue-platform` (`@workspace/revenue-platform`)

React + Vite frontend with dark theme, shadcn/ui components, and full dashboard.

- Pages: login, dashboard, ai-outbound, campaigns, integrations, reactivation, conversion, analytics, settings
- Hooks: use-dashboard, use-leads, use-campaigns, use-integrations, use-ai
- Layout: sidebar + header with user avatar
- Depends on: `@workspace/api-client-react`, `@workspace/replit-auth-web`

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

- Schema: auth (users, sessions), leads, campaigns, emailAccounts, integrations, knowledgeBase, agentLogs, apiKeys, promptTemplates, analyticsEvents, teamMembers, organizations
- Push schema: `pnpm --filter @workspace/db run push`

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec and Orval codegen config.

- Codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from OpenAPI spec for request/response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from OpenAPI spec.

### `lib/replit-auth-web` (`@workspace/replit-auth-web`)

Frontend auth hook (`useAuth`) for Replit Auth integration.

### `lib/integrations-openai-ai-server` (`@workspace/integrations-openai-ai-server`)

OpenAI client configured via Replit AI Integrations proxy.
