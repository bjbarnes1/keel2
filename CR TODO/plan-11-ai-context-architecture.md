---
name: AI Context Architecture — three-layer reference system for grounded Ask Keel
overview: Establishes a canonical three-layer context system that every Ask Keel (and future AI) interaction draws from. Layer A — user's observed state plus 12-month forecast, generated fresh on each request from Prisma. Layer B — learned behavioral patterns (spending tendencies, seasonal variance, category drift), updated weekly from transaction data. Layer C — structural assumptions (Australian CPI, wage growth, long-run asset returns, age-specific cost shifts), maintained as versioned repository files. All three compose into a single frozen context snapshot passed to Sonnet on every answer. Makes Keel's AI answers reproducible, auditable, and rich enough to handle long-horizon questions like "can we afford Europe in 5 years."
todos:
  - id: directory-structure
    content: |
      Establish the reference-file location. Decision: these are runtime data + long-lived repo-tracked files, so they live across two places.

      **Repo-tracked files** (Layer C assumptions):
      ```
      src/lib/ai/context/
        assumptions/
          economic.json           — CPI, wage growth, asset returns, long-run rates
          australian-tax.json     — ATO brackets, Medicare levy, HECS thresholds
          life-stage.json         — age-specific cost shifts, retirement assumptions
          meta.json               — last-reviewed dates, source citations, confidence levels
        schemas/
          layer-a-schema.ts       — Zod schema for observed-truth shape
          layer-b-schema.ts       — Zod schema for learned-patterns shape
          layer-c-schema.ts       — Zod schema for structural-assumptions shape
          composed-context.ts     — Zod schema for the final merged context
        generators/
          build-layer-a.ts        — builds from Prisma on demand
          build-layer-b.ts        — builds from transaction history (scheduled)
          load-layer-c.ts         — reads + validates Layer C files
          compose-context.ts      — orchestrates all three into the final JSON
      ```

      **Database-stored data** (Layer B learned patterns):
      - New Prisma model `UserLearnedPatterns` per budget, updated weekly by a cron job
      - Stored rather than repo-tracked because it's per-user and regenerated from their transactions

      **Not repo-tracked** (Layer A observed truth):
      - Built fresh on every Ask Keel request. Never persisted to disk or DB. Exists only for the duration of one request.

      Create the directory structure and empty placeholder files. Don't populate yet — subsequent todos handle each layer.

      Commit the folder structure with a README at `src/lib/ai/context/README.md` explaining the three-layer model and pointing to `docs/ai-guidelines.md` for the deeper architecture.
    status: pending

  - id: layer-c-economic-assumptions
    content: |
      Populate `src/lib/ai/context/assumptions/economic.json` with Australian economic baseline data.

      Required fields:
      ```json
      {
        "version": "2026.04",
        "lastReviewed": "2026-04-22",
        "reviewIntervalDays": 90,
        "nextReviewDue": "2026-07-22",
        "cpi": {
          "currentAnnualRate": 0.032,
          "rbaTarget": [0.02, 0.03],
          "fiveYearAssumption": 0.029,
          "tenYearAssumption": 0.028,
          "source": "RBA statement on monetary policy, Feb 2026",
          "confidence": "medium"
        },
        "wageGrowth": {
          "currentAnnualRate": 0.037,
          "fiveYearAssumption": 0.035,
          "confidence": "medium"
        },
        "interestRates": {
          "cashRateCurrent": 0.041,
          "mortgageRateCurrent": 0.063,
          "mortgageRateFiveYearAssumption": 0.058,
          "source": "RBA, major bank averages",
          "confidence": "low"
        },
        "assetReturns": {
          "asx200LongRunAnnualNominal": 0.089,
          "asx200LongRunAnnualReal": 0.061,
          "bitcoinVolatilityNote": "Claude should not assume any specific BTC return trajectory. Use current price for valuations; flag uncertainty explicitly in any long-horizon answer involving crypto.",
          "cashSavingsAnnual": 0.042,
          "confidence": "low-long-term"
        },
        "propertyAssumptions": {
          "melbourneHousePriceGrowthFiveYear": 0.045,
          "propertyGrowthNote": "Significant regional variation. Do not project individual property values beyond 2 years.",
          "confidence": "very-low"
        }
      }
      ```

      Values are illustrative — research actual current figures from RBA, ABS, and major bank forecasts. The critical element is not the specific numbers but the structure: every assumption has a confidence level and a citation, and the file has a review cadence.

      **Confidence levels are load-bearing.** The AI must surface them in long-horizon answers. "Assuming 2.9% annual inflation (RBA target midpoint, medium confidence)" reads honestly. "Assuming 2.9% inflation" reads like false precision.
    status: pending

  - id: layer-c-tax-and-life-stage
    content: |
      Populate the other two Layer C files.

      **`australian-tax.json`** — ATO-sourced. Current brackets, Medicare levy, HECS/HELP thresholds, private health rebate thresholds, super guarantee rate, super contribution caps.

      Structure example:
      ```json
      {
        "version": "FY2026-27",
        "effectiveFrom": "2026-07-01",
        "effectiveUntil": "2027-06-30",
        "individualIncomeTaxBrackets": [
          { "from": 0, "to": 18200, "rate": 0, "offset": 0 },
          { "from": 18201, "to": 45000, "rate": 0.16, "offset": 0 },
          { "from": 45001, "to": 135000, "rate": 0.30, "offset": 4288 },
          { "from": 135001, "to": 190000, "rate": 0.37, "offset": 31288 },
          { "from": 190001, "to": null, "rate": 0.45, "offset": 51638 }
        ],
        "medicareLevyRate": 0.02,
        "superGuaranteeRate": 0.12,
        "hecsRepaymentThresholds": [
          { "from": 54435, "rate": 0.01 },
          { "from": 62850, "rate": 0.02 }
        ],
        "source": "ATO FY2026-27 schedules",
        "lastReviewed": "2026-04-22"
      }
      ```

      **`life-stage.json`** — structural assumptions about how costs shift over life. Much more speculative, mark confidence as "low" throughout.

      Structure example:
      ```json
      {
        "version": "2026.04",
        "lastReviewed": "2026-04-22",
        "childCosts": {
          "childcarePerChildAnnualAverage": 18000,
          "childcareEndsAtAge": 5,
          "schoolAgeAdditionalAnnual": 3500,
          "teenAgeAdditionalAnnual": 4500,
          "confidence": "low",
          "note": "Regional, school-type, and activity-level variance is enormous. Treat as rough ceiling, not forecast."
        },
        "retirement": {
          "comfortableRetirementCoupleAnnual": 73337,
          "modestRetirementCoupleAnnual": 47731,
          "source": "ASFA Retirement Standard, update Dec 2025",
          "confidence": "medium"
        },
        "generalLifeCostShifts": [
          "Discretionary spending typically declines 20-30% when a child is born",
          "Housing costs typically peak between ages 35-50",
          "Healthcare costs accelerate after age 55"
        ]
      }
      ```

      **`meta.json`** — single source of truth for review cadence, last-reviewed dates, file versions.

      These files should feel opinionated and cautious. The AI will cite them in long-horizon answers; better to be hedged-but-accurate than confidently wrong.
    status: pending

  - id: layer-c-loader-and-validator
    content: |
      Create `src/lib/ai/context/generators/load-layer-c.ts`.

      Function:
      ```typescript
      export async function loadLayerC(): Promise<LayerC> {
        const economic = await readAndValidate('./assumptions/economic.json', economicSchema);
        const tax = await readAndValidate('./assumptions/australian-tax.json', taxSchema);
        const lifeStage = await readAndValidate('./assumptions/life-stage.json', lifeStageSchema);
        const meta = await readAndValidate('./assumptions/meta.json', metaSchema);

        checkReviewDue(meta);  // warn (don't fail) if any file is past review date

        return {
          version: meta.version,
          lastComposed: new Date().toISOString(),
          economic,
          tax,
          lifeStage,
        };
      }
      ```

      Zod schemas in `schemas/layer-c-schema.ts` enforce structure and confidence-level enums.

      `checkReviewDue` logs a warning if any file's `nextReviewDue` is in the past. Doesn't block — the stale data is still usable, but operations should see the warning in logs.

      Cache the loaded result in memory for the server's lifetime (restart on deploy is frequent enough to refresh). Layer C doesn't change mid-session.

      Add Vitest coverage for the loader — valid files load, invalid files throw with clear messages, stale files warn but don't throw.
    status: pending

  - id: layer-a-observed-truth-builder
    content: |
      Create `src/lib/ai/context/generators/build-layer-a.ts`.

      Function:
      ```typescript
      export async function buildLayerA(userId: string, asOf: Date = new Date()): Promise<LayerA> {
        const budget = await getBudget(userId);
        const inputs = await loadProjectionInputs(budget.id);
        const events = buildProjectionTimeline({
          asOf,
          horizonDays: 366,
          ...inputs,
        });

        return {
          asOf: asOf.toISOString(),
          horizon: {
            start: asOf.toISOString(),
            end: addDays(asOf, 366).toISOString(),
            days: 366,
          },
          availableMoney: {
            now: computeAvailableMoneyAt(asOf, events, inputs.startingBalance),
            projectedMinOverHorizon: minBalanceInEvents(events),
            projectedMinDate: dateOfMinBalance(events),
            projectedMaxOverHorizon: maxBalanceInEvents(events),
            projectedMaxDate: dateOfMaxBalance(events),
            projectedAnnualEndBalance: balanceAtDate(addDays(asOf, 365), events),
          },
          incomes: inputs.incomes.map(shapeIncome),
          commitments: inputs.commitments.map(shapeCommitment),
          goals: inputs.goals.map(shapeGoal),
          wealth: await summarizeWealth(budget.id),
          upcomingEvents: events.slice(0, 50).map(shapeEvent),
          activeSkips: inputs.activeSkips.map(shapeSkip),
        };
      }
      ```

      Target size: ~2-4 KB serialized JSON for a typical user. Keep field names terse but readable; strip internal DB fields (IDs only kept where citations will reference them; createdAt/updatedAt dropped).

      Include the 12-month horizon by default — this is what makes "can we afford Europe in 5 years" actually answerable. The 12-month data gives the AI grounded "here's where you'll be next year" which is the foundation for any 5-year projection.

      Cache per-user with a short TTL (60 seconds) so that rapid-fire questions in one Ask session don't re-query Prisma repeatedly. Invalidate cache on any write action.

      Test coverage: builds correctly from seeded data, handles edge cases (no commitments, no goals, single income), horizon extends correctly, caching works.
    status: pending

  - id: layer-b-learned-patterns-schema
    content: |
      Add `UserLearnedPatterns` Prisma model. This stores per-user behavioral observations derived from transaction data.

      ```prisma
      model UserLearnedPatterns {
        id        String   @id @default(cuid())
        budgetId  String   @unique
        budget    Budget   @relation(fields: [budgetId], references: [id], onDelete: Cascade)
        
        lastAnalyzedAt     DateTime
        analysisCoveringFrom DateTime
        analysisCoveringTo   DateTime
        
        patterns  Json     // structured below
        
        createdAt DateTime @default(now())
        updatedAt DateTime @updatedAt
      }
      ```

      The `patterns` JSON field shape (Zod-validated on read):
      ```typescript
      type LearnedPatterns = {
        categoryDrift: Array<{
          categoryId: string;
          categoryName: string;
          budgetedMonthly: number;
          actualMonthlyAverage: number;
          driftPercent: number;         // positive = over budget
          confidence: 'high' | 'medium' | 'low';  // high if >6 months data
          monthsObserved: number;
        }>;
        seasonalVariance: Array<{
          categoryId: string;
          highMonths: number[];         // e.g., [6, 7, 8] for winter peak
          highMonthMultiplier: number;
          lowMonths: number[];
          lowMonthMultiplier: number;
          confidence: 'high' | 'medium' | 'low';
        }>;
        cashflowTendencies: {
          typicalEndOfCycleRemaining: number;
          variancePctOverLast6Cycles: number;
          skipCommitmentsPerQuarter: number;
        };
        meta: {
          totalTransactionsAnalyzed: number;
          analysisVersion: string;
        };
      };
      ```

      Empty shape for new users: all arrays empty, all counters 0, confidence is 'low' across the board. New users ship with Layer B effectively empty, and the AI knows to say "I don't have enough history yet" when asked pattern-based questions.

      Migration: `npx prisma migrate dev --name add_user_learned_patterns`.

      Zod schema for runtime validation in `schemas/layer-b-schema.ts`.
    status: pending

  - id: layer-b-analyzer-cron
    content: |
      Build the analyzer that populates `UserLearnedPatterns`.

      `src/lib/ai/context/generators/analyze-patterns.ts`:
      ```typescript
      export async function analyzePatternsForBudget(budgetId: string): Promise<LearnedPatterns> {
        const transactions = await fetchTransactionsLastNMonths(budgetId, 12);
        const commitments = await fetchCommitments(budgetId);
        const categories = await fetchCategories(budgetId);

        return {
          categoryDrift: computeCategoryDrift(transactions, commitments, categories),
          seasonalVariance: computeSeasonalVariance(transactions, categories),
          cashflowTendencies: computeCashflowTendencies(transactions, commitments),
          meta: {
            totalTransactionsAnalyzed: transactions.length,
            analysisVersion: '2026.04.v1',
          },
        };
      }
      ```

      Minimum data thresholds:
      - Category drift: requires 3+ months of data per category. Fewer months → confidence 'low'.
      - Seasonal variance: requires 12+ months. Fewer → return empty array.
      - Cashflow tendencies: requires 6+ pay cycles. Fewer → return zeros with confidence 'low'.

      Runs as a scheduled job (weekly cadence is plenty):
      - Vercel cron if you're on Vercel Pro
      - Supabase scheduled function otherwise
      - Manual `/api/admin/reanalyze-patterns` route for testing

      Does NOT run synchronously during Ask Keel requests. Layer B is slow-moving — the analyzer can take 5-10 seconds per user. Keep it asynchronous.

      If a user has no pattern data yet (new user, or analysis hasn't run), Layer B returns the empty-shape default. The AI's answer handles this explicitly: "I don't have enough history yet to spot spending patterns — ask me again after a few months of data."

      Test coverage: seeded transactions produce expected drift values, seasonal variance detected correctly, edge cases (no data, single month, single category) handled.
    status: pending

  - id: context-composer
    content: |
      Create `src/lib/ai/context/generators/compose-context.ts`. The orchestrator that produces the final context object passed to every Ask Keel request.

      ```typescript
      export async function composeAskContext(userId: string, asOf: Date = new Date()): Promise<ComposedContext> {
        const [layerA, layerB, layerC] = await Promise.all([
          buildLayerA(userId, asOf),
          loadLayerB(userId),
          loadLayerC(),
        ]);

        return {
          generatedAt: new Date().toISOString(),
          version: '2026.04.v1',
          userContext: layerA,
          learnedPatterns: layerB,
          structuralAssumptions: layerC,
        };
      }
      ```

      Zod schema in `schemas/composed-context.ts` validates the final shape. If any layer returns malformed data, throw a clear error — the Ask Keel route handles this by falling back to "I'm having trouble accessing your data, try again in a moment" rather than returning a bad answer.

      Serialize compactly: ~3-5 KB total for a typical user. Well under Sonnet's context budget, leaves room for conversation.

      Performance: Layer A takes 50-200ms (one Prisma query + projection build). Layer B is ~5ms (one Prisma read). Layer C is cached, ~1ms after first call. Parallel execution keeps total under 250ms.
    status: pending

  - id: ask-keel-route-integration
    content: |
      Wire the composed context into the Ask Keel route.

      In `/api/ask-keel/route.ts`, after auth and rate limiting, before intent classification:
      ```typescript
      const context = await composeAskContext(userId);
      ```

      Update the system prompt to include the context as a structured data block:
      ```typescript
      const systemPrompt = `
      You are Keel — a calm, obligation-first money assistant.

      You have access to three layers of context about the user. Use them in this order of authority:

      1. USER_CONTEXT (Layer A) — observed truth. Current state and 12-month forecast. Always cite specific numbers from here for questions about the user's actual money. These are facts, not estimates.

      2. LEARNED_PATTERNS (Layer B) — behavioral observations from this user's transaction history. Use for "how do I usually..." questions. If learnedPatterns is empty, say so honestly.

      3. STRUCTURAL_ASSUMPTIONS (Layer C) — baseline economic data and assumptions for Australia. Use for long-horizon projections (>12 months) where actual data doesn't exist. Always surface the confidence level when citing these.

      Rules:
      - Answer ONLY using the three layers above.
      - For long-horizon questions (>12 months), combine Layer A (current) + Layer B (patterns) + Layer C (assumptions). State which layer each assumption came from.
      - If a question requires data outside the three layers, say so explicitly — do not invent.
      - For regulated advice territories (investment picks, tax, legal, medical), respond with the advice_refused schema type.
      - Output must match the response schema.

      <context>
      ${JSON.stringify(context, null, 2)}
      </context>
      `;
      ```

      The AI now physically has everything it needs to answer long-horizon questions grounded in layered truth. "Can we afford Europe in 5 years for $20k" draws from:
      - Layer A: current savings rate, current goal progress, current commitments
      - Layer B: user's actual savings consistency over past months
      - Layer C: inflation assumption to adjust $20k to 2031 dollars

      Update the Zod response schema to require a `citations` array where every factual claim references the layer and specific field used. The AI must cite, not just assert.
    status: pending

  - id: citation-validation
    content: |
      Add response validation that checks citations against the context.

      `src/lib/ai/validate-citations.ts`:
      ```typescript
      export function validateCitations(
        response: AskResponse,
        context: ComposedContext
      ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        for (const citation of response.citations ?? []) {
          const value = getValueByPath(context, citation.path);
          if (value === undefined) {
            errors.push(`Citation path ${citation.path} not found in context`);
            continue;
          }
          if (citation.value !== undefined && !approximatelyEqual(value, citation.value)) {
            errors.push(`Citation ${citation.path}: claimed ${citation.value}, actual ${value}`);
          }
        }

        return { valid: errors.length === 0, errors };
      }
      ```

      Used in the Ask Keel route after Claude returns:
      ```typescript
      const validation = validateCitations(response, context);
      if (!validation.valid) {
        logHallucination(userId, question, response, validation.errors);
        return fallbackResponse("I'm having trouble answering that accurately. Could you rephrase or check your Timeline for the details?");
      }
      ```

      This is the anti-hallucination gate. If Claude claims "your mortgage is $2,400/fortnight" but Layer A shows $1,840, the response never reaches the user.

      Tolerance: approximatelyEqual allows 1% variance for rounding in currency values. Exact match required for categorical values.

      Log every hallucination event with full context — input, response, errors. Review logs weekly to identify prompt weaknesses.
    status: pending

  - id: long-horizon-question-handling
    content: |
      Add explicit handling for questions beyond the 12-month Layer A horizon.

      In the system prompt, add a section:
      ```
      For long-horizon questions (more than 12 months into the future):

      1. Use Layer A (current state) to establish starting point
      2. Use Layer B (learned patterns) to project user behavior forward
      3. Use Layer C (structural assumptions) for inflation, wage growth, asset returns
      4. Explicitly name the assumptions in your answer
      5. Provide a RANGE not a point estimate — acknowledge uncertainty compounds over time
      6. If Layer B is sparse (new user), lean more heavily on Layer C but flag the limited personal data

      Example answer format for "can we afford Europe in 5 years for $20,000":

      "At your current savings rate of $400 per pay (22 fortnights per year = $8,800 annual), you'd accumulate around $44,000 over 5 years — enough for the trip in today's dollars.

      Adjusting for inflation: $20,000 today is around $23,000 in 5 years at 2.9% CPI (Layer C, medium confidence). You'd still clear the target by roughly $21,000.

      Caveats:
      - Assumes current goal contribution continues unchanged (Layer A says $400/pay into 'Holiday Savings')
      - Assumes no major life changes in the next 5 years (the system can't predict those)
      - Doesn't include your BTC position — if you wanted to fund partly from crypto, the answer changes depending on price at the time

      Short answer: yes, and with buffer. Want me to show what 5 years of saving looks like month by month?"
      ```

      This is the single most important capability this architecture unlocks. Most finance AI fails at long-horizon questions because it either invents numbers or refuses the question. Keel answers honestly, cites sources, and flags uncertainty.

      Test with 10 canonical long-horizon questions during QA. Each answer must cite Layer C with confidence levels, Layer B if relevant, and Layer A for starting point.
    status: pending

  - id: update-invalidation
    content: |
      Define when each layer invalidates and needs rebuilding.

      **Layer A** rebuilds on every request (with 60-second cache). Triggers a fresh build:
      - Any commitment / income / goal create, update, archive
      - Any skip create, revoke
      - Any transaction import
      - Manual user refresh
      
      Implement via cache invalidation on the relevant server actions:
      ```typescript
      await invalidateLayerACache(userId);
      ```
      called from `createCommitment`, `updateCommitment`, `archiveCommitment`, `createSkip`, etc.

      **Layer B** rebuilds weekly via scheduled job. Triggers an immediate rebuild:
      - Bulk transaction import (CSV upload)
      - User manually requests "refresh insights" (future feature)
      
      Between weekly rebuilds, Layer B is intentionally stale — a week of lag on behavioral patterns is fine.

      **Layer C** rebuilds when the files are edited. No runtime invalidation needed — server restart picks up the new version. For long-running servers, could add a watch mode in dev, a redeploy in prod.

      Add telemetry: log cache hits, cache builds, and build durations. Surface in an admin dashboard (future). For now, console logs suffice.
    status: pending

  - id: admin-context-inspector
    content: |
      Build an admin-only route that lets you inspect the current composed context for any user.

      `src/app/admin/context-inspector/page.tsx`:
      - Input: user email or ID
      - Output: full composed context as pretty-printed JSON
      - Gated behind admin auth check

      Why this matters: debugging "why did Claude answer wrong for user X" requires seeing exactly what context was passed. Without this tool, you're guessing.

      Also add: "test question" input. Enter a hypothetical question, see:
      - What intent the classifier picks
      - What context gets composed
      - What Claude would respond (dry run, no logged turn)
      - Validation result (citations valid? hallucinations detected?)

      Invaluable for prompt iteration. Spend 10 minutes here every few days during alpha, find the gaps, update prompts.
    status: pending

  - id: lint-build-test-manual
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual QA:

      **Layer A:**
      - Compose context for a seeded user, verify structure
      - All amounts match source DB
      - 12-month horizon includes all expected events
      - Cache invalidates correctly on write actions
      
      **Layer B:**
      - New user: empty patterns with low confidence throughout
      - Seeded user with 12 months of transactions: patterns populated
      - Analyzer handles edge cases (no data, single category, outliers)

      **Layer C:**
      - All JSON files validate against schemas
      - Loader warns on stale review dates
      - Values are reasonable and sourced

      **Ask Keel end-to-end:**
      - Short-horizon question ("what's my rent?") cites Layer A only
      - Medium-horizon ("will I clear rent next month?") cites Layer A
      - Long-horizon ("Europe in 5 years?") cites all three layers with confidence levels
      - Pattern question ("do I usually go over on groceries?") cites Layer B or says "not enough data"
      - Out-of-scope question still blocked by classifier
      
      **Citation validation:**
      - Correctly answered question passes validation
      - Manually-injected hallucination (forge Claude's response with a wrong number) gets blocked
      - Tolerance works (1% rounding variance OK)

      **Admin inspector:**
      - Loads context for test user
      - Test question shows full pipeline output
      - Hallucination detection demo

      **Performance:**
      - Composed context generation <300ms for typical user
      - Full Ask Keel response time <3 seconds end-to-end (context + classifier + Sonnet + validation)

isProject: false
---

# AI Context Architecture — the plan

## What this PR lands

A three-layer context system that every Ask Keel (and future AI feature) draws from, making answers grounded, auditable, and rich enough to handle long-horizon questions.

## Why three layers

A single monolithic "context blob" sounds simpler but has problems:
- Different update cadences (your financial state changes daily, CPI changes quarterly)
- Different trust levels (DB facts vs statistical patterns vs economic assumptions)
- Different invalidation needs (per-user vs global)

Three layers let each one update at its natural pace:
- **Layer A** (Observed): rebuilds per request from Prisma
- **Layer B** (Learned): rebuilds weekly from transactions
- **Layer C** (Structural): edits via PRs, reviews quarterly

## What this unlocks

Questions Keel can answer well that it couldn't before:

- *"Can we afford Europe in 5 years for $20k?"* → combines current savings rate, pattern of consistency, inflation assumption
- *"Will groceries bust our budget next winter?"* → combines budgeted amount, observed drift, seasonal variance
- *"Is my mortgage sustainable if rates go to 7.5%?"* → combines current payment, income, cashflow tendencies, long-run rate assumption
- *"When can I realistically retire?"* → combines super, income, wage growth, retirement standard

None of these are answerable from Layer A alone. All require the full three-layer composition.

## What this PR does NOT include

- **Proactive weekly briefings** (Ask Keel initiating conversations). Post-launch.
- **Voice input.** Post-launch.
- **Multi-turn conversation memory within Ask.** Phase 3 — each question is still independent for now.
- **User-facing controls over assumptions.** Users can't edit Layer C values; they're author-maintained.
- **Transaction import.** Relies on Spend feature for Layer B data. Stub with seeded test data if import isn't live yet.

## No background AI calls

The architecture makes zero AI calls except in direct response to a user action — specifically, submitting a message in Ask Keel or submitting a sentence to Capture. Everything else is deterministic.

Specifically prohibited unless explicitly designed as a separate feature with its own safety review:

- No daily/weekly summaries generated via LLM
- No background pattern analysis via LLM (Layer B uses deterministic statistics, not AI)
- No proactive notifications generated via LLM
- No "insight generation" running on a cron
- No pre-emptive context pre-building for users who haven't asked a question
- No warming of caches via speculative LLM calls

If a future feature requires scheduled AI activity, it requires its own scoping, cost modeling, and inclusion in the per-user daily ceiling. This document's baseline is: **no AI happens unless the user initiated it in the last few seconds.**

This matters for two reasons. First, cost predictability — background AI is how costs balloon unnoticed. Second, trust — users should never be surprised that Keel made an AI call they didn't authorize.

## Layer C is global and shared

A single set of JSON files serves every user. There is no per-user override of economic assumptions, tax brackets, or life-stage costs. Those values are facts about the world (or well-sourced estimates of facts about the world), not user preferences.

If a user's situation genuinely differs from Layer C defaults — a non-resident tax status, a specific visa category, a trust structure — those facts live in **Layer A** (recorded against their budget profile) not in an override of Layer C. Layer C is the universal baseline; Layer A captures individual variance.

This means Layer C changes affect every user immediately at next server restart. Changes should be deliberate and PR-reviewed, with sourcing in the commit message.

## Future Layer D — pooled anonymized patterns

Not in this PR, but worth noting for forward compatibility.

A future **Layer D** will contain aggregate statistics across the Keel user base — age-cohort savings rates, region-specific cost-of-living signals, common category drift patterns. Insight-level data only, never identifying individual users.

Design constraints when Layer D is built (for future reference):

- Minimum cohort size (e.g., 50+ users) before any statistic is exposed
- No statistic that could identify an individual
- User opt-out of contributing to aggregates
- Aggregates refresh monthly, computed by a scheduled job
- Stored as repo-tracked or DB-stored JSON (depending on size)
- Composed alongside Layer C in `composeAskContext`

The current three-layer composition function (`compose-context.ts`) should accommodate a fourth layer without restructuring. Keep the composition shape extensible.

## On using ML instead of LLM calls

A natural optimization is "parse capture sentences with an ML model instead of an LLM call." Worth thinking through before committing.

**Short answer for pre-launch and early post-launch: stay with LLM (Haiku) for capture parsing.** Reasons:

- No labeled training data exists. Fine-tuning a small model requires 500-1000 labeled examples, which you don't have yet.
- Haiku is fast (~400ms) and cheap (~$0.0005 per parse). Not the cost optimization target.
- User phrasing variability is unknown until real usage. Optimizing before seeing input is premature.
- Regex fallback already exists in `parse-capture.ts` — use it as the first-pass path, with Haiku as the fallback when regex fails.

**Recommended pattern for capture parsing:**

```
User input
  → Tripwire check (length, injection patterns)
  → Regex parser (matches ~60-70% of common phrasings deterministically)
  → If regex fails or confidence is low: Haiku call with the capture prompt
  → Cache common parses keyed by normalized input ("my electricity is $240 a quarter" → cached result reused)
  → Return structured output with source flag (regex / llm / cache)
```

This keeps LLM usage as a fallback, not a first-line tool. Monitor the regex-vs-LLM split in logs — if regex handles 70%+ of parses, you're spending minimal on LLM. If regex only handles 20%, your patterns need work or users are phrasing things you didn't anticipate.

**When ML genuinely becomes worthwhile:**

- **Transaction categorization** (future, when CSV import lands). Classifying "COLES 4211 FITZROY" → Groceries is a classic ML problem with plenty of existing solutions. Either buy a service (Basiq, Akahu, or similar Australian providers) or train a small classifier on Australian merchant strings.
- **Intent classification** (post-launch, if Haiku costs become meaningful). A small distilled model trained on 1000+ classified intents could replace the Haiku classifier and run locally.
- **Pattern detection** (Layer B). Already deterministic — never use an LLM for moving averages or seasonal variance. If anything needs more sophistication than SQL can provide, use statistical libraries like `simple-statistics` or Python-via-service for harder analyses.

**What should never be LLM:**

- Moving averages, sums, aggregations — SQL
- Date arithmetic — deterministic functions
- Running balance projection — the existing engine
- "Has this user been saving consistently?" — deterministic statistics over transaction history
- "What's their current available money?" — Prisma query

If an engineer suggests using an LLM for any of these, push back. LLMs are for interpretation of natural language, not arithmetic.

**Forward compatibility.**

The architecture doesn't require a decision between LLM and ML. The capture route calls `parseCapture(input)` which internally decides whether to use regex, ML model, or LLM. The caller doesn't care. Swapping the internals later doesn't require changing callers.

Same for intent classification — `classifyAskIntent(input)` is the contract. Its internals can swap between Haiku, a fine-tuned local model, or rules without touching the Ask Keel route handler.

Don't bake LLM assumptions into the call sites. Keep the internals swappable.

## Dependencies

- **Ask Keel Safety Implementation PR** (or equivalent — the rate limiting, tripwires, cost ceiling work from the AI guidelines doc)
- **Pre-Launch Sprint PR** (establishes some of the data the context composes from)

Can ship after those two, in parallel with Timeline work.

## Risk

Medium-high. Three significant new subsystems (Layer A generator, Layer B analyzer, Layer C files) that all need to cohere. Testing coverage matters — end-to-end tests that pass real questions through the full pipeline catch integration bugs unit tests miss.

The biggest risk is that Layer C values go stale and the AI quotes inaccurate economic figures. Mitigate with:
- Clear review cadences in meta.json
- Loader warns on overdue reviews
- Admin dashboard surfaces stale-file count

The second biggest risk is that Layer B produces bad patterns from insufficient data. Mitigate with:
- Minimum data thresholds per pattern type
- Confidence levels always surfaced in answers
- "Not enough history" is a valid and honest response

## Cost implications

Each Ask Keel request now includes ~5KB of context in the Sonnet prompt. At Sonnet 4 pricing (~$3/M input tokens), that's roughly $0.015 per request in prompt alone plus output costs.

**Expected usage pattern:** First week of a user's life in the product, heavy Ask Keel usage as they explore the feature and ask the questions they've been wondering about their money. After that, settlement to occasional use — maybe 3-10 questions per week for engaged users, less for casual users.

**Real steady-state cost per active user:** probably $2-5/month. Low enough that it's not a primary cost center.

**Per-user daily ceiling** of $1.00 is kept as a safety rail, not a cost-optimization target. It protects against:
- Day-1 curious users testing limits
- Malicious or automated abuse
- Bugs in our own code triggering loops

Normal usage will never come near $1/day. The ceiling is for outliers and anomalies.

**Future paywall alignment.** Ask Keel will sit behind a trial period, then become a paid feature. The rate limit and ceiling architecture in this plan supports that naturally — extending the per-user check to include "subscription tier" alongside "daily spend" is straightforward when the paywall lands.

When paywall ships:
- Free tier: no Ask Keel access (or severely limited, e.g., 5 questions/week)
- Trial: full access for 14 or 30 days
- Paid tier: normal rate limit + daily ceiling applies

Users on trial or paid tiers all share the same rate limit and daily ceiling infrastructure — the only difference is whether they can reach Ask Keel at all. No architectural rework needed to introduce the paywall layer.
