# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run lint         # ESLint (zero warnings enforced)
npm test             # Vitest single run
npm run test:watch   # Vitest watch mode

# Run a single test file
npx vitest run src/lib/engine/keel.test.ts

# Prisma
npx prisma generate          # Regenerate client after schema changes
npx prisma migrate dev       # Create + apply a new migration (local)
npm run db:migrate:deploy    # Deploy migrations to production DB
```

TypeScript is checked via `npx tsc --noEmit` (no dedicated script in package.json).

## Architecture

### What the app does

Keel answers: *"After every bill and savings contribution is accounted for, what do I actually have left?"*

Available money = bank balance − commitment reserves − per-pay goal contributions

It supports multiple income sources (weekly/fortnightly/monthly), per-income allocation of bills and goals, a 60-day projection timeline with shortfall alerting, skip/defer strategies for one-off missed payments, and optional AI-assisted bill capture.

### Persistence layer (`src/lib/persistence/`)

The app has two persistence modes controlled by `hasConfiguredDatabase()` and `hasSupabaseAuthConfigured()` in `config.ts`:

| Mode | When | Storage |
|---|---|---|
| Demo / local dev | `DATABASE_URL` unset | `data/dev-store.json` (last-write-wins) |
| Full | Both `DATABASE_URL` + Supabase env set | Prisma → PostgreSQL |
| Hybrid | `DATABASE_URL` set, Supabase absent | Reads Prisma state, disables auth-required writes |

**`keel-store.ts`** is a barrel that re-exports the full public API from domain modules (`income.ts`, `commitments.ts`, `goals.ts`, `skips.ts`, `categories.ts`, `wealth.ts`, `budget.ts`, `spend.ts`, `reports.ts`, `dashboard.ts`). Callers import from `@/lib/persistence/keel-store` and never directly from sub-modules — this keeps the split from the original God Object transparent.

**`auth.ts`** is the tenancy choke point. `getBudgetContext()` returns `{ authedUser, budget, membership }` and is called at the top of every DB mutator. All Prisma queries scope by `budgetId` to enforce row-level isolation.

**`state.ts`** defines the `StoredKeelState` shape shared by both persistence paths, plus narrowing helpers (`narrowIncomeFrequency`, `narrowCommitmentFrequency`) that emit `console.warn` when unexpected enum values are read from the DB.

### Projection engine (`src/lib/engine/keel.ts`)

Pure domain logic — no I/O, fully deterministic. Key entry points:

- **`calculateAvailableMoney()`** — single-point balance after all reserves/contributions
- **`buildProjectionTimeline()`** — expands income/commitment/goal schedules into dated cashflow events, applies active skips, walks a running balance. Accepts `horizonDays` + optional `startDate` for chunked loading. All dates use UTC midnight (`T00:00:00Z`) throughout.
- **`detectProjectedShortfall()`** — finds the first negative-balance event
- **`getCurrentPayPeriod()`** — locates the current pay window around the primary income

Engine input types (`EngineIncome`, `EngineCommitment`, `EngineGoal`) live in `keel.ts`. UI/display types (`DashboardSnapshot`, `ProjectionEventView`, `ForecastHorizon`, etc.) live in `src/lib/types.ts`.

### Server actions pattern

All mutations live in `src/app/actions/`. The consistent pattern is:

1. `"use server"` + validate (Zod schema or typed FormData helpers)
2. `getBudgetContext()` for tenant isolation
3. Prisma `$transaction` for any multi-step write
4. `revalidatePath()` for cache invalidation
5. `redirect()` (PRG) for form submissions

Skip actions (`skips.ts`) additionally call `assertSkipsPersistence()` which gates on both DB + Supabase being configured.

### AI layer (`src/lib/ai/`)

`client.ts` exports `getAnthropicClient()` — a lazy singleton keyed by `ANTHROPIC_API_KEY`. Returns `null` if the key is absent; callers fall back to rule-based parsing. All AI-gated server actions call `assertAiEnabledOrThrow()` + `assertWithinAiRateLimit()` (20 calls/hour/user, stored in `AiRateLimit` table).

### Auth & routing

`middleware.ts` (edge) handles Supabase JWT cookie refresh and redirects unauthenticated requests to `/login?next=…`. Public paths: `/_next`, `/api`, `/auth`, `/login`. **API routes perform their own session checks** — middleware does not protect them.

### Prisma schema notes

- Multi-tenant via `Budget` → `BudgetMember` → `User`
- `Income` and `Commitment` both have append-only `*Version` tables for effective-dated history (used by the projection engine to replay past states)
- `CommitmentSkip` / `GoalSkip` store skip strategies (`MAKE_UP_NEXT`, `SPREAD`, `MOVE_ON` / `EXTEND_DATE`, `REBALANCE`) with `revokedAt` for undo
- `WealthAccount` has `@@unique([budgetId, name])` — default account creation uses `upsert`
- After any schema change, run `npx prisma generate` before `tsc --noEmit`

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooled connection (append `?pgbouncer=true`) |
| `DIRECT_URL` | Supabase direct connection (migrations only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key |
| `ANTHROPIC_API_KEY` | Enables AI bill parsing; sets `NEXT_PUBLIC_KEEL_ASK_AVAILABLE=1` |
| `BANK_ENCRYPTION_KEY` | AES-256-GCM key for bank account number encryption (HKDF-derived internally) |
