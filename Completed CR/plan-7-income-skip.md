---
name: Income Skip — new Prisma model, engine integration, UI for missed pay events
overview: Add the concept of skipping income events — for users with unpaid leave, contractor gaps, or pay cycles that don't happen. New Prisma model (IncomeSkip) mirrors the CommitmentSkip pattern but scoped to income events. Engine integration in buildProjectionTimeline applies skips during warmup and viewport generation. UI integration in the income detail page's upcoming list renders Skip / Unskip toggles on each pay event row. Because income has no downstream "make up" concept (you can't retroactively earn a skipped paycheck), only STANDALONE strategy is supported — other strategies available in commitment skips don't apply here. Small, well-scoped addition that completes parity between income and commitment timeline manipulation.
todos:
  - id: income-skip-prisma-model
    content: |
      Add `IncomeSkip` model to `prisma/schema.prisma`.

      ```prisma
      model IncomeSkip {
        id           String   @id @default(cuid())
        incomeId     String
        income       Income   @relation(fields: [incomeId], references: [id], onDelete: Cascade)
        originalDate DateTime @db.Date
        strategy     IncomeSkipStrategy @default(STANDALONE)
        notes        String?
        createdAt    DateTime @default(now())
        revokedAt    DateTime?
        
        budgetId     String
        budget       Budget   @relation(fields: [budgetId], references: [id], onDelete: Cascade)
        
        @@unique([incomeId, originalDate, revokedAt])
        @@index([budgetId, originalDate])
      }
      
      enum IncomeSkipStrategy {
        STANDALONE
      }
      ```

      Only one strategy for now — STANDALONE. If future needs emerge ("reassign this pay to a different date" or similar), add enum values then. Don't speculatively design for them.

      The `@@unique([incomeId, originalDate, revokedAt])` constraint allows the same incomeId/originalDate pair to exist multiple times (a skip can be revoked, then re-created), but only one un-revoked skip can exist per pair.

      Add reverse relation on `Income` model:
      ```prisma
      model Income {
        // ... existing fields
        skips IncomeSkip[]
      }
      ```

      Run `npx prisma migrate dev --name add_income_skip_model`. Commit schema and migration.

      Verify: open Prisma Studio, IncomeSkip table exists, no existing income data affected.
    status: pending

  - id: income-skip-engine-integration
    content: |
      Extend the engine to respect IncomeSkip records during projection generation.

      In `src/lib/engine/keel.ts`, update `loadProjectionInputs` (or wherever income data is gathered) to fetch active (non-revoked) IncomeSkip records alongside commitments and goals.

      In `buildProjectionTimeline`, when generating raw income events:
      - Generate events as currently
      - After generation, apply a filter: remove any event whose `incomeId` + date matches an active IncomeSkip

      Implementation sketch:
      ```typescript
      function generateRawIncomeEvents(incomes: Income[], range: DateRange, incomeSkips: IncomeSkip[]): ProjectionEvent[] {
        const events = /* existing generation logic */;
        return events.filter(event => {
          const isSkipped = incomeSkips.some(skip => 
            skip.incomeId === event.incomeId &&
            dateEquals(skip.originalDate, event.date) &&
            skip.revokedAt === null
          );
          return !isSkipped;
        });
      }
      ```

      This happens during warmup AND viewport generation — skipped pays correctly don't contribute to the starting balance either.

      Unit tests in `src/lib/engine/keel.test.ts`:
      - Income with one skip applied: event missing from projection
      - Skip for date outside horizon: ignored, no crash
      - Skip then revoke: revoked skip ignored, event present again
      - Multiple skips on different dates: all applied independently
      - Skip during warmup period: warmup balance computed without that pay
    status: pending

  - id: income-skip-server-actions
    content: |
      Create `src/app/actions/income-skips.ts` mirroring the commitment-skip action patterns.

      Actions:

      ```typescript
      'use server';
      
      export async function createIncomeSkip(input: {
        incomeId: string;
        originalDate: string;  // ISO date
        notes?: string;
      }) {
        // validate via zod
        // check authed user / budget ownership
        // check no active skip already exists for this (incomeId, originalDate)
        // insert new IncomeSkip with strategy=STANDALONE
        // revalidate /timeline, /, /incomes, /incomes/[id]
      }
      
      export async function revokeIncomeSkip(input: { skipId: string }) {
        // validate
        // check ownership
        // set revokedAt = new Date()
        // revalidate same paths
      }
      
      export async function listActiveIncomeSkips(incomeId: string): Promise<IncomeSkip[]> {
        // scoped to user's budget
        // returns non-revoked skips for the given income
      }
      ```

      Zod validation for all inputs. No bypass.

      Integration tests in `src/app/actions/income-skips.test.ts`:
      - Create skip: row inserted, projections reflect absence
      - Create skip for date with existing active skip: rejected with user-friendly error
      - Revoke skip: revokedAt set, projections restore
      - Revoke already-revoked skip: idempotent (no error)
      - Skip for other user's income: rejected with auth error
    status: pending

  - id: income-detail-upcoming-list-with-skips
    content: |
      Update the income detail page's upcoming list (created as read-only in Pre-Launch Sprint PR) to include Skip / Unskip toggles.

      Find the upcoming list section in `src/app/incomes/[id]/page.tsx` (or the income detail component). The Pre-Launch Sprint version renders rows but without action buttons — add them now.

      Row structure:
      - Grid: `80px 1fr auto`
      - Date cell: formatted date
      - Amount cell: formatAud(amount)
      - Action cell: Skip or Unskip button

      Button behavior:

      **If no active skip for this date:**
      - Button labeled "Skip"
      - Ghost pill style: `rgba(255,255,255,0.04)` bg, 0.5px border `rgba(255,255,255,0.08)`, 11px font, padding 4px 10px
      - On tap: opens small confirmation
        - "Skip {income.name} on {date}?"
        - "Your available money won't include this pay. You can unskip anytime."
        - [Cancel] [Skip] where Skip is `.glass-tint-attend`
      - Confirm: call `createIncomeSkip({ incomeId, originalDate })`, optimistic UI flip to Unskip state

      **If active skip for this date:**
      - Button labeled "Unskip"
      - Styled with `.glass-tint-attend` (amber)
      - Row amount shows strikethrough + muted `--keel-ink-4`
      - Subtitle below row: "Skipped on {createdAt date}"
      - On tap (no confirmation needed — unskip is safer than skip): call `revokeIncomeSkip({ skipId })`, optimistic UI flip back

      The confirmation for Skip is a small inline confirmation, not a full GlassSheet — faster for a single-strategy action.

      Opacity fade for distant events same as commitment pattern: rows 1-3 full, 4-6 at 90%, 7-10 at 75%.

      Upcoming row count: same per-frequency logic as commitment detail (10 for fortnightly, 6 for monthly, 4 for quarterly, etc.)
    status: pending

  - id: home-and-timeline-skip-rendering
    content: |
      Ensure skipped income events render appropriately on Home and Timeline.

      On Home's upcoming pay section:
      - Skipped upcoming pay: either hide entirely (clean approach) or show at 40% opacity with "skipped" label
      - Decision: **hide entirely.** The user has already declared they're not expecting that pay — no need to clutter Home with it. If they change their mind, they unskip from the detail page and it returns.

      On Timeline chart:
      - Skipped income marker: render as hollow circle (no fill, stroke only) at 40% opacity, size smaller
      - The trajectory curve naturally reflects the absence (money doesn't arrive, curve doesn't rise at that point)
      - In the legend: skipped pay rows show with strikethrough + muted, "Skipped" suffix

      The visual affordance for "you did this" should be subtle but discoverable. Hollow markers are well-established visual language for "declared absence."
    status: pending

  - id: unit-tests
    content: |
      Tests across the stack:

      **Engine:**
      - Income skip creates correct projection absence
      - Warmup-period skips correctly affect starting balance
      - Multiple skips on different dates handled independently
      - Revoked skip doesn't affect projection

      **Server actions:**
      - Create/revoke happy paths
      - Auth checks
      - Duplicate-active-skip rejection
      - Idempotent revoke

      **UI components:**
      - Skip button on row fires correct action
      - Unskip button on skipped row fires correct action
      - Strikethrough + Unskip state renders correctly
      - Confirmation sheet opens on Skip tap
      - Confirmation cancel leaves row unchanged
    status: pending

  - id: lint-build-test-manual
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual QA:

      **Prisma:**
      - Migration runs cleanly on local dev DB
      - Migration applies to preview environment without data loss

      **Income detail page:**
      - Upcoming list shows pay events with Skip buttons
      - Tap Skip → confirmation opens
      - Confirm → row shows strikethrough, Unskip button appears
      - Tap Unskip → row returns to normal

      **Projections:**
      - Available Money on Home decreases after skipping a near-term pay (that pay no longer contributes)
      - Timeline chart shows hollow marker at skipped position
      - Timeline legend shows skipped pay with strikethrough + "Skipped" suffix

      **Skip then unskip:**
      - Skip a pay event
      - Verify Timeline updates (marker hollow, trajectory reflects absence)
      - Unskip
      - Verify Timeline returns to original state
      - Available Money returns to pre-skip value

      **Edge cases:**
      - Skip multiple pay events for same income: each independent
      - Skip a past pay event (retrospective logging of missed pay): valid, affects historical projections
      - Try to skip an already-skipped pay: UI prevents (button already says Unskip)

      **Cross-cutting:**
      - Ask Keel, if available: reflects skipped pays in any context-aware answers
      - CSV import / spend reconciliation: unaffected by income skips
    status: pending

isProject: false
---

# Income Skip — the plan

## What this PR lands

The ability to mark income events as "not happening this cycle" — with full engine integration so projections, Available Money, and Timeline correctly reflect the absence.

## Why this matters

From the commitments skip pattern, users know they can skip payments. They've told you they want to skip income too — unpaid leave, contractor gaps, salary pauses. Currently there's no way to do this. Users resort to editing the income amount temporarily or creating workaround commitments, which corrupts the data.

A proper IncomeSkip primitive mirrors CommitmentSkip, scoped to income events. Small and clean.

## Why only STANDALONE

CommitmentSkip supports four strategies (STANDALONE, MAKE_UP_NEXT, SPREAD, MOVE_ON) because commitments have downstream semantic options. IncomeSkip only supports STANDALONE because income has no analog:

- MAKE_UP_NEXT: "next paycheck is doubled" — no. You can't retroactively earn skipped pay.
- SPREAD: "spread the missed pay across future pays" — also no. Same reason.
- MOVE_ON: "redirect the skipped pay to a goal" — there's nothing TO redirect. No money exists.

STANDALONE ("just skip, no downstream effect") is the only semantically valid option. Other strategies might emerge if real use cases appear, but don't build for speculation.

## Dependencies

- **Pre-Launch Sprint PR** (creates income detail page with read-only upcoming list — this PR adds the skip buttons)
- **Nothing else required**

Independent of Timeline rebuild, Commitments rebuild, Unified Edit Sheet. Can land at any point after Pre-Launch Sprint.

## Risk

Low. New model, new actions, additive UI. No changes to existing commitment skip logic. Migration is additive (new table, new enum, no alteration of existing data).

## What this PR does NOT include

- **Bulk skip across date range** ("skip all pays for May") — that's a potential future UI but not needed for v1. Users can skip individual events one at a time.
- **Skip history / audit log UI** — a single "Skipped on {date}" subtitle is sufficient for v1. No separate history screen.
- **Income skip from Timeline directly** — for v1, skip only happens from income detail. Timeline shows the effect but isn't the origin point.
