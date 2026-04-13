# Architecture Standards

This document defines project structure conventions for SOLID backend design and atomic frontend structure.

## Backend (SOLID)

### Layers

- `routes/`: HTTP transport only (parse, validate, map response).
- `services/`: use-case orchestration and business rules.
- `repositories/`: data-access logic only.
- `security/`: owner context, scoping, authz helpers.
- `lib/`: cross-cutting infrastructure helpers (auth, provider config, integration clients).

### Rules

- Routes must not import `@workspace/db` or `drizzle-orm` in migrated modules.
- All owner/org scoping must use `getOwnerContext()` + `ownerScope()`.
- Multi-write flows should use transactions where possible.
- Provider access should go through adapter contracts, not direct vendor calls in route handlers.

## Frontend (Atomic)

### Layers

- `components/ui/`: primitive controls (atoms, shadcn-compatible).
- `components/molecules/`: composed UI blocks (page headers, stat cards, etc.).
- `components/layout/`: template-level layout shell.
- `pages/`: route-level screens and data orchestration.

### Rules

- Keep data fetching/mutations in `hooks/` or page/container level.
- Molecules should accept props and avoid direct API calls.
- Reusable non-primitive UI belongs in `components/molecules/` or `components/organisms/`.

## Guardrails

- Architecture boundary check script:
  - `pnpm run check:architecture`
- Backend smoke test script:
  - `pnpm run smoke:backend:phase1`
