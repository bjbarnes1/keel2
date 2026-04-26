# Keel — Technical Overview

*For incoming architects and UX contributors. Current as of commit `b12bfc4`.*

---

## What Keel does

Keel answers one question: **after every bill and savings contribution is covered, what do I actually have left?**

Available money = bank balance − commitment reserves − per-pay goal contributions

Users add income sources (weekly/fortnightly/monthly), recurring bills ("commitments"), and savings goals. Keel projects a 60-day cashflow timeline, flags shortfalls before they happen, and lets users skip or defer bills with defined strategies. An optional AI layer handles natural-language bill capture and a chat interface for questions about their money.

---

## Tech stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router | 16.x |
| Language | TypeScript (strict) | 6.x |
| React | React | 19.x |
| Database | PostgreSQL via Supabase | — |
| ORM | Prisma | 7.x |
| Auth | Supabase Auth (magic link) | — |
| Styling | Tailwind CSS v4 | 4.x |
| AI | Anthropic Claude API | — |
| Deployment | Vercel | — |

---

## Repository layout

```
src/
  app/                  Next.js App Router pages, layouts, API routes, server actions
  components/keel/      All UI components (no shadcn — custom design system)
  lib/
    engine/             Pure cashflow projection engine (no I/O)
    persistence/        All database access (Prisma)
    ai/                 Claude integration (context, prompts, parsing)
    hooks/              Two custom React hooks (timeline only)
    security/           AES-256-GCM encryption for bank account numbers

prisma/
  schema.prisma         Single schema file, 23 models
  migrations/           Applied migrations (never edit manually)

docs/                   This file and design references
```

---

## Route map

### Tab bar surfaces (main navigation)

| Route | Rendering | Purpose |
|---|---|---|
| `/` | Server (dynamic) | Dashboard — available money hero, upcoming events, goal cards, AI insight card |
| `/timeline` | Server shell + Client | Waterline chart with scrollable 24-week projection; focal-date driven |
| `/commitments` | Server (dynamic) | Browse active and archived bills; edit, skip, archive inline |
| `/ask` | Server shell + Client | Chat interface for natural-language questions about money |

### Supporting surfaces

| Route | Rendering | Purpose |
|---|---|---|
| `/capture` | Server (dynamic) | Voice/text bill capture — parses a sentence into a commitment, income, or asset |
| `/incomes` | Server (dynamic) | Income list; set primary, archive, edit future amounts |
| `/goals` | Server (dynamic) | Savings goals; skip, edit, track balance |
| `/wealth` | Server (dynamic) | Manual asset holdings (property, shares, crypto) |
| `/spend` | Server (dynamic) | Bank transaction import hub |
| `/spend/import` | Server (dynamic) | CSV upload and column mapping |
| `/spend/reconcile` | Server (dynamic) | Match imported transactions to commitments |
| `/spend/report` | Server (dynamic) | Actual vs planned spending report |
| `/spend/patterns` | Server (dynamic) | AI-computed monthly spending pattern analysis |
| `/balance` | Server (dynamic) | Update bank balance (single action, sheet target) |
| `/settings` | Server | Navigation into sub-settings |
| `/settings/categories` | Server | Create/delete spend categories |
| `/settings/household` | Server | Budget invite management |
| `/settings/incomes` | Server | Redundant income management path (mirrors `/incomes`) |
| `/onboarding` | Server shell + Client | First-run wizard (balance, first income, first bill) |
| `/login` | Client | Magic-link email auth |
| `/budget/invite/[token]` | Server | Accept a household budget invitation |
| `/admin/context-inspector` | Server | Internal debug view for the AI context layers |
| `/profile` | Server | **Hidden from UI** — pending design (TODO comment in file) |

### API routes

| Route | Purpose |
|---|---|
| `/api/ask-keel` | Ask Keel chat — intent classify → stream or structured JSON |
| `/api/capture` | Natural-language capture → structured commitment/income/asset |
| `/api/parse-bill` | Legacy bill parsing (used by the older CommitmentIntakeFlow) |
| `/auth/callback` | Supabase OAuth callback |

---

## Architecture patterns

### Server Components by default

Every page is an async Server Component that loads data via Prisma, then passes it as props to any client components it contains. No API calls from pages — data flows down as typed props.

```
page.tsx (async server) → loads data → ClientComponent (receives props)
```

`force-dynamic` is set on every user-facing page (data is per-user, must not be statically cached).

### Server Actions for all mutations

Every write goes through a `"use server"` function in `src/app/actions/`. The pattern is consistent:

1. Authenticate via `getBudgetContext()` (tenant isolation — all queries scope by `budgetId`)
2. Validate input (Zod or typed FormData)
3. Prisma write (transactions for multi-step)
4. `revalidatePath()` to invalidate Next.js cache
5. Redirect (PRG) or return result

### Persistence barrel

`src/lib/persistence/keel-store.ts` is the single import point for all database helpers. Never import from the sub-modules directly — this keeps the internal split transparent to callers.

### Pure projection engine

`src/lib/engine/keel.ts` contains all cashflow math. It is **completely pure** — no I/O, no side effects, fully deterministic and unit-tested. The engine accepts typed inputs and returns events. Key functions:

- `calculateAvailableMoney()` — single-point "what do you have right now"
- `buildProjectionTimeline()` — expands all schedules into dated events; accepts optional `startDate` for chunked loading
- `availableMoneyAt(date, events, starting)` — walk events to a specific date
- `detectProjectedShortfall()` — first negative event in the timeline

### Multi-tenancy

One `Budget` per household. Users join via `BudgetMember`. Every Prisma query must scope by `budgetId`. The `getBudgetContext()` function is the single tenancy choke point — it authenticates via Supabase and returns `{ authedUser, budget, membership }`.

---

## Data model (key models only)

```
Budget
  ├── Income[]           (weekly/fortnightly/monthly, archivedAt for soft delete)
  │     └── IncomeVersion[]  (append-only history for projection replay)
  ├── Commitment[]       (bills, archivedAt for soft delete)
  │     └── CommitmentVersion[]  (append-only history)
  ├── Goal[]             (savings goals, no soft delete)
  ├── Category[]         (spend categories, unique per budget by name)
  │     └── Subcategory[]
  ├── CommitmentSkip[]   (revokedAt for undo)
  ├── GoalSkip[]         (revokedAt for undo)
  ├── IncomeSkip[]       (revokedAt for undo)
  ├── WealthAccount[]
  │     └── WealthHolding[]
  ├── SpendAccount[]
  │     ├── SpendImportBatch[]
  │     └── SpendTransaction[]
  ├── AiRateLimit        (one per user, rolling hourly window + daily cost ceiling)
  ├── UserLearnedPatterns  (one per budget, deterministic stats from transactions)
  └── UserAiInsight      (one per budget, last AI-generated insight headline + body)
```

**Soft delete:** `Income` and `Commitment` have `archivedAt DateTime?`. Archived rows are excluded from the engine but visible in the UI's archived list. `Goal` has no soft delete — goals are deleted hard.

**Skip strategies:**
- Commitments: `MAKE_UP_NEXT` (add to next bill), `SPREAD` (distribute over N future bills), `MOVE_ON` (drop the occurrence entirely), `STANDALONE` (just skip, no redistribution)
- Goals: `EXTEND_DATE`, `REBALANCE`
- Incomes: `STANDALONE` only

---

## AI integration

All AI features are behind two environment variables:

- `ANTHROPIC_API_KEY` — enables the Claude client
- `KEEL_AI_ENABLED=true` — server-side gate on all AI endpoints and actions
- `NEXT_PUBLIC_KEEL_ASK_AVAILABLE=1` — computed at build time; controls whether the Ask tab appears in the UI

**What calls Claude:**

| Feature | Route/Action | Models |
|---|---|---|
| Ask Keel chat | `/api/ask-keel` | Haiku (intent classify) → Sonnet (answer) or Haiku (citation extraction) |
| Natural-language capture | `/api/capture` | Haiku (classify) → Sonnet (parse) |
| Legacy bill parse | `/api/parse-bill` | Haiku |
| Proactive insight card | `generateInsightAction` | Haiku (with prompt caching) |

Current models: `claude-haiku-4-5-20251001` and `claude-sonnet-4-6`.

**Rate limiting:** 20 AI calls per user per hour, tracked in `AiRateLimit` (rolling window). A separate daily cost ceiling in AUD cents is also enforced — the ceiling is configurable via env var.

**Ask Keel flow:**
1. User message → classify intent (Haiku, ~100ms): `answer` | `capture` | `scenario_whatif` | `out_of_scope`
2. `capture` → parse structured payload → return inline capture card to UI (no page nav)
3. `scenario_whatif` → run hypothetical skip overlay on the projection engine → return delta
4. `answer` → stream Sonnet prose → Haiku extracts citations → validate against snapshot → return

The anti-hallucination system: every dollar amount the AI mentions must cite a ref from an allowlist built from the user's actual data (`buildCitationRefAllowList`). Citations that don't match are rejected and replaced with a safe fallback.

---

## Design system

### Tokens (CSS custom properties)

```css
/* Backgrounds */
--keel-tide:     #0e1412   /* page background */
--keel-tide-2:   #141a17   /* elevated surface */

/* Text scale */
--keel-ink:      #f0ebdc   /* primary text */
--keel-ink-2:    #d4cfbf
--keel-ink-3:    #a8ac9f
--keel-ink-4:    #8a8f88
--keel-ink-5:    #5f645e   /* labels, timestamps */

/* Semantic accents */
--keel-safe:     #6bb391   /* positive / confirm */
--keel-safe-soft:#8ec4a8
--keel-attend:   #d48f46   /* attention / warning */

/* Asset identity */
--keel-btc:      #d4a55c
--keel-eth:      #9f97e8
--keel-stock:    #7fb5e8
```

### Glass utility classes

Four composable glass surface classes drive all UI surfaces:

| Class | Use |
|---|---|
| `.glass-clear` | Default card surface — subtle frosted glass |
| `.glass-heavy` | Floating panels, bottom bar — heavier blur + tint |
| `.glass-tint-safe` | Confirm/positive actions — green-tinted glass |
| `.glass-tint-attend` | Warning states — amber-tinted glass |

Plus `.keel-chip` for inline tag/badge elements.

### Component structure

Components live in `src/components/keel/`. There is no shadcn or third-party component library — everything is custom. Components fall into three categories:

**Primitives (reused across 3+ surfaces):**
`primitives.tsx` (AppShell, SurfaceCard), `projection-row.tsx`, `kebab-row.tsx`, `sparkline.tsx`, `submit-button.tsx`, `keel-select.tsx` (custom glass dropdown)

**Sheets (bottom-sheet overlays):**
`glass-sheet.tsx` (base), `commitment-archive-sheet.tsx`, `commitment-edit-sheet.tsx`, `commitment-restore-sheet.tsx`, `commitment-skip-sheet.tsx`, `goal-skip-sheet.tsx`, `goal-restore-sheet.tsx`, `income-archive-sheet.tsx`, `income-edit-sheet.tsx`, `record-edit-sheet.tsx`

**Surface-specific (one-off client components):**
`timeline-view.tsx`, `waterline-chart.tsx`, `timeline-legend.tsx`, `ask-keel-panel.tsx`, `capture-keel-panel.tsx`, `commitments-browse-client.tsx`, `insight-card.tsx`, `wealth-overview.tsx`, `spend-import-flow.tsx`, `onboarding-flow.tsx`, and others

**Tech debt note:** `commitment-intake-flow.tsx` and `onboarding-flow.tsx` use raw Tailwind semantic colors (`text-emerald-500`, `bg-amber-500/10`, `text-red-400`) rather than the `--keel-*` token system. These are legacy components not yet migrated.

---

## Custom hooks

Only two custom hooks exist — both serve the Timeline surface:

**`useTimelineEvents`** (`src/lib/hooks/use-timeline-events.ts`)
Manages a scrolling window of projection events. Fetches the initial chunk on mount, pre-fetches adjacent 28-day windows when the focal date approaches an edge. Enforces a 24-week (168-day) max horizon. Debounced fetch deduplication. Has tests.

**`useTimelineSync`** (`src/lib/hooks/use-timeline-sync.ts`)
Shared focal-date state between the waterline chart and the event legend. Tagged updates (`source: "chart" | "legend"`) prevent feedback loops when either side drives the other. Has tests.

---

## Security notes for architects

- **Bank account numbers** are AES-256-GCM encrypted at rest using a key derived from `BANK_ENCRYPTION_KEY` via HKDF. The IV is stored alongside the ciphertext. Only the last four digits are stored in plaintext for display.
- **All mutations** go through `getBudgetContext()` which enforces that the authenticated user is a member of the budget being modified. There is no way to reach a write without passing this check.
- **AI endpoints** enforce both a rate limit (20/hour/user) and a daily cost ceiling. Input is screened through a tripwire system before hitting Claude.
- **Supabase JWT** is refreshed at the edge via middleware. API routes perform their own session checks — middleware is not the auth boundary for API calls.
- **Multi-tenancy** is row-level: every Prisma query filters by `budgetId`. There is no RLS at the database layer — isolation is enforced in application code.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | For DB | Supabase pooled connection (`?pgbouncer=true`) |
| `DIRECT_URL` | For migrations | Supabase direct connection |
| `NEXT_PUBLIC_SUPABASE_URL` | For auth | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For auth | Supabase publishable key |
| `ANTHROPIC_API_KEY` | For AI | Enables all Claude features |
| `KEEL_AI_ENABLED` | For AI | Must be the string `true` (not `"true"`) |
| `BANK_ENCRYPTION_KEY` | For spend | AES key for account number encryption |

`NEXT_PUBLIC_KEEL_ASK_AVAILABLE` is **not set manually** — it is computed at build time from the presence of `ANTHROPIC_API_KEY` in `next.config.ts`.

---

## Things worth knowing before you change anything

1. **The engine is the source of truth.** Persistence functions return raw state; the engine transforms it into money. Never compute reserves or projections outside `src/lib/engine/`.

2. **Every page is `force-dynamic`.** There is no static generation — all data is user-specific. This is intentional.

3. **`getBudgetContext()` must be called at the top of every mutation.** Skipping it is a multi-tenancy bug.

4. **Skip `revokedAt` is not `deletedAt`.** A revoked skip still exists in the database and is excluded by filtering `revokedAt IS NULL`. The append-only pattern is intentional for audit purposes.

5. **Version tables (`IncomeVersion`, `CommitmentVersion`) are active.** They record effective-dated history so the projection engine can replay what the schedule looked like at any past date. The `pickCommitmentVersionAt` / `pickIncomeVersionAt` helpers in `src/lib/` handle the lookup.

6. **`Commitment.isPaused` exists but is lightly used.** It is currently only filtered in the spend reports and reconciliation queries — it has no effect on the projection engine. Whether paused commitments should be excluded from the engine is an open design question.

7. **The Ask tab is hidden until `NEXT_PUBLIC_KEEL_ASK_AVAILABLE=1`** which requires `ANTHROPIC_API_KEY` to be set at build time. Changing it in the dashboard requires a redeploy.
