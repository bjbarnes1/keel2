---
name: Ask Keel Phase 1 — parsing, classification, routing to Capture
overview: First phase of Ask Keel functionality. Parses user input, classifies intent (capture, question, scenario, other), routes capture-style inputs into the existing Capture flow, and returns polite stub answers for questions and scenarios (deferred to Phase 2). Establishes the four-layer safety architecture (intent classifier, grounded context, schema enforcement, tripwires) with tripwires and rate limiting enforced from day one — even if the Haiku model is only answering yes/no intent questions. Cost ceiling $0.50 per user per day, 20 requests per hour shared rate limit, Haiku for classification, Sonnet deferred to Phase 2. No streaming in Phase 1 — simple request/response.
todos:
  - id: env-and-feature-flag
    content: |
      Verify environment variables and feature flag configuration.

      Required env:
      - `ANTHROPIC_API_KEY` — production key
      - `KEEL_AI_ENABLED` — boolean, false in dev if desired, true in staging/prod
      - `KEEL_AI_RATE_LIMIT_PER_HOUR` — default 20
      - `KEEL_AI_COST_CEILING_PER_DAY_AUD` — default 0.50

      In `src/lib/env.ts` (or wherever env access lives), export typed accessors:
      ```typescript
      export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
      export const KEEL_AI_ENABLED = process.env.KEEL_AI_ENABLED === 'true';
      export const KEEL_AI_RATE_LIMIT = Number(process.env.KEEL_AI_RATE_LIMIT_PER_HOUR ?? 20);
      export const KEEL_AI_COST_CEILING = Number(process.env.KEEL_AI_COST_CEILING_PER_DAY_AUD ?? 0.50);
      ```

      Add guards: if `ANTHROPIC_API_KEY` missing and `KEEL_AI_ENABLED=true`, fail loudly at startup. Don't silently fall back.
    status: pending

  - id: ask-tab-visibility
    content: |
      Wire the Ask tab visibility to `KEEL_AI_ENABLED`.

      In `src/components/keel/tab-bar.tsx`:
      - Fetch flag (server component or edge-passed prop)
      - If false: render tab bar without the Ask tab (4 tabs instead of 5)
      - If true: render with Ask tab visible

      The existing Ask screen route (`/ask`) should also check the flag:
      - If disabled: render the current "Ask is offline right now" message OR redirect to home
      - If enabled: render the functional Ask UI (built in next todo)

      Test: toggle the env var, verify tab and route behavior.
    status: pending

  - id: rate-limit-and-cost-tracking
    content: |
      Create `src/lib/ai/rate-limit.ts`. Shared rate limiter across all Ask Keel requests.

      ```typescript
      import { Redis } from '@upstash/redis';  // or equivalent
      
      const redis = new Redis({ ... });
      
      export async function checkRateLimit(userId: string): Promise<{ allowed: boolean; resetAt: Date }> {
        const key = `ai:ratelimit:${userId}:${currentHourKey()}`;
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, 3600);  // 1 hour TTL
        }
        const allowed = count <= KEEL_AI_RATE_LIMIT;
        const resetAt = nextHourBoundary();
        return { allowed, resetAt };
      }
      
      export async function trackCost(userId: string, costAud: number) {
        const key = `ai:cost:${userId}:${currentDayKey()}`;
        await redis.incrbyfloat(key, costAud);
        await redis.expire(key, 86400);  // 1 day TTL
      }
      
      export async function checkCostCeiling(userId: string): Promise<{ allowed: boolean; usedAud: number }> {
        const key = `ai:cost:${userId}:${currentDayKey()}`;
        const used = Number(await redis.get(key) ?? 0);
        return { allowed: used < KEEL_AI_COST_CEILING, usedAud: used };
      }
      ```

      If Upstash Redis isn't available, use Prisma for persistence (slower but works). Create a simple table:
      ```prisma
      model AiUsage {
        id        String   @id @default(cuid())
        userId    String
        hour      DateTime  // truncated to hour
        day       DateTime  // truncated to day
        count     Int       @default(0)
        costAud   Decimal   @default(0)
        @@unique([userId, hour])
      }
      ```

      Query on each request. Clean up old rows weekly via a cron.

      Either implementation works. Choose based on what's already set up in the project.
    status: pending

  - id: intent-classifier
    content: |
      Create `src/lib/ai/intent-classifier.ts`. Uses Haiku for fast, cheap classification.

      ```typescript
      import Anthropic from '@anthropic-ai/sdk';
      
      const client = new Anthropic();
      
      export type Intent = 'capture' | 'question' | 'scenario' | 'other';
      
      export async function classifyIntent(input: string): Promise<{
        intent: Intent;
        confidence: number;
        extractedFields?: CaptureFields;  // if intent=capture
      }> {
        const response = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: `You classify user messages to a personal budgeting app into one of:
          - "capture": user is declaring a new income, commitment, or goal (e.g., "my electricity is $240 a quarter")
          - "question": user is asking about their current situation (e.g., "can I afford Japan in September?")
          - "scenario": user is asking a what-if (e.g., "what if I skip rent next month")
          - "other": anything else (greetings, off-topic, unclear)
          
          For capture intent, extract fields: name, amount_cents, frequency (weekly/fortnightly/monthly/quarterly/annual), type (income/commitment/goal), next_due_or_pay_date (ISO).
          
          Return JSON only, no prose.`,
          messages: [
            { role: 'user', content: input }
          ],
        });
        
        const content = response.content[0];
        if (content.type !== 'text') throw new Error('Unexpected response');
        const parsed = JSON.parse(content.text);
        // validate via zod
        return parsed;
      }
      ```

      Token budget per classification: ~400 output tokens max, input varies. Cost per call: ~$0.0015 AUD (Haiku pricing is cheap).

      Handle errors:
      - Network error: return `{ intent: 'other', confidence: 0 }` with a user-facing "try again" message
      - Invalid JSON: same
      - Anthropic rate limit hit: return with "we're a bit busy, give us a moment" message

      Never silently return "other" without logging the reason.
    status: pending

  - id: capture-routing
    content: |
      For inputs classified as capture intent, route to the existing Capture flow.

      Logic flow:
      1. User types a message in Ask
      2. `classifyIntent(message)` returns `{ intent: 'capture', extractedFields: {...} }`
      3. Instead of showing an answer in the Ask thread, route to the existing Capture preview sheet with extractedFields pre-populated
      4. User reviews the parsed commitment/income/goal, confirms or edits
      5. Confirm calls the existing capture action to persist

      The routing might look like:
      ```typescript
      if (result.intent === 'capture' && result.extractedFields) {
        router.push(`/capture?prefill=${encodeURIComponent(JSON.stringify(result.extractedFields))}`);
        // or: trigger a Capture sheet to open with the fields pre-populated
      }
      ```

      Existing Capture flow: if the capture sheet pattern uses a client-side state store, dispatch to that store directly. If it's URL-driven, use query params.

      This lets users use Ask as a universal input: "my electricity is $240 a quarter" → Ask classifies as capture → Capture sheet opens with Electricity, $240, Quarterly pre-filled → user confirms.

      Two user flows now reach Capture:
      - Tab to Capture directly (existing)
      - Type in Ask, it routes through automatic classification (new)

      Both are good. Ask is faster for users who think in sentences; Capture is faster for users who think in forms.
    status: pending

  - id: question-and-scenario-stubs
    content: |
      For question and scenario intents, return polite stub answers.

      ```typescript
      function formatStubResponse(intent: 'question' | 'scenario'): string {
        if (intent === 'question') {
          return "I can't answer specific questions about your money yet — that part of Ask Keel is coming soon. For now, you can check the Timeline or Home screen for what I know.";
        }
        return "What-if scenarios are coming soon. For now, you can use Home and Timeline to explore what you have and what's next.";
      }
      ```

      Render as the AI bubble in the Ask thread. Style per the Ask Keel bubbles design:
      - AI response: glass-clear bubble, `--keel-ink` text
      - User message: glass-heavy with subtle warm slate tint (NOT sea-green — that's reserved per the UX audit)
      - Thread scrolls to latest message

      Do NOT pretend to answer. Don't hallucinate. Stub responses only.

      Add a small "Coming soon" chip or similar visual hint so the user understands this is a known gap, not a failure.
    status: pending

  - id: tripwires-layer
    content: |
      Implement tripwires — refusals for known bad inputs before they reach the classifier.

      `src/lib/ai/tripwires.ts`:
      ```typescript
      type TripwireResult = 
        | { ok: true }
        | { ok: false; reason: string; userMessage: string };
      
      export function checkTripwires(input: string, userId: string): TripwireResult {
        // Length
        if (input.length < 2) return { ok: false, reason: 'too_short', userMessage: 'Try a longer message.' };
        if (input.length > 500) return { ok: false, reason: 'too_long', userMessage: 'Keep messages under 500 characters.' };
        
        // Prompt injection attempts
        const injectionPatterns = [
          /ignore (previous|above) instructions/i,
          /you are now/i,
          /system prompt/i,
          /\bapi[-_]?key\b/i,
        ];
        if (injectionPatterns.some(p => p.test(input))) {
          return { ok: false, reason: 'injection_attempt', userMessage: "I can only help with your budget. Try asking about your money." };
        }
        
        // Off-topic intent (basic heuristic — full check happens in classifier)
        const offTopicKeywords = ['recipe', 'code', 'joke', 'write me', 'poem'];
        if (offTopicKeywords.some(k => input.toLowerCase().includes(k))) {
          return { ok: false, reason: 'off_topic', userMessage: "Ask Keel helps with your money. Try asking about income, commitments, or goals." };
        }
        
        return { ok: true };
      }
      ```

      Run tripwires BEFORE hitting the classifier — these are purely pattern-based, zero cost.

      Log all tripped inputs (anonymized) for later review. Patterns emerge from usage.

      Don't be over-aggressive. False positives annoy users. Err toward letting the classifier handle ambiguous cases.
    status: pending

  - id: full-request-pipeline
    content: |
      Compose the full pipeline in `src/app/actions/ask-keel.ts`:

      ```typescript
      'use server';
      
      export async function askKeel(input: string): Promise<AskResponse> {
        const { userId } = await getAuthedUser();
        
        // 1. Tripwires
        const tripwire = checkTripwires(input, userId);
        if (!tripwire.ok) {
          return { type: 'refusal', message: tripwire.userMessage };
        }
        
        // 2. Rate limit
        const rate = await checkRateLimit(userId);
        if (!rate.allowed) {
          return { 
            type: 'rate_limited', 
            message: `You've reached your hourly limit. Try again after ${formatTime(rate.resetAt)}.`
          };
        }
        
        // 3. Cost ceiling
        const cost = await checkCostCeiling(userId);
        if (!cost.allowed) {
          return {
            type: 'cost_capped',
            message: "You've used Ask Keel's quota for today. It'll refresh tomorrow."
          };
        }
        
        // 4. Classify
        const classification = await classifyIntent(input);
        await trackCost(userId, estimateCostAud(classification));
        
        // 5. Route
        if (classification.intent === 'capture' && classification.extractedFields) {
          return { 
            type: 'capture_redirect', 
            fields: classification.extractedFields 
          };
        }
        
        if (classification.intent === 'question') {
          return {
            type: 'answer',
            message: formatStubResponse('question'),
            stub: true,
          };
        }
        
        if (classification.intent === 'scenario') {
          return {
            type: 'answer',
            message: formatStubResponse('scenario'),
            stub: true,
          };
        }
        
        // Other / unclassified
        return {
          type: 'answer',
          message: "I'm not sure how to help with that. Try asking about your income, commitments, or goals.",
          stub: true,
        };
      }
      ```

      Return type discriminated union. Client handles each case appropriately.

      Observability: log every request with input length, classified intent, cost, timing. Use whatever logging your stack uses (PostHog, Sentry, etc.)
    status: pending

  - id: ask-ui-wiring
    content: |
      Wire the Ask screen to the new action. Replace the "Ask is offline" stub with functional input/response UI.

      Find `src/app/ask/page.tsx`. Current state renders the offline message when AI is disabled — keep that behavior. Add functional path when enabled.

      Functional UI:
      - Top: thread of messages (user bubbles + AI bubbles alternating)
      - Bottom: input pill with microphone icon (voice input optional, post-v1)
      - Submit via Enter key or tap send (icon on right of input)
      - Loading state: user message appears immediately, AI bubble shows a "thinking" indicator (three bouncing dots) while askKeel runs
      - Result: AI bubble populates with response
      - Capture redirect: router.push to Capture with prefilled fields

      Scroll: thread scrolls to bottom on new message. Smooth scroll with `behavior: smooth`.

      Keyboard: input stays focused between messages. Pressing Enter submits. Shift+Enter adds newline (allow multiline input).

      Error state: failed requests show a small red-adjacent (amber!) message "Couldn't reach Ask Keel. Try again." with a retry button.

      Remember: user bubbles use glass-heavy with warm slate tint, NOT sea-green. Per UX audit.
    status: pending

  - id: unit-and-integration-tests
    content: |
      Tests across the stack:

      **Intent classifier:**
      - Mock Anthropic SDK, verify prompt shape, verify JSON parsing
      - Invalid JSON response handled gracefully
      - Rate limit error from Anthropic handled gracefully

      **Tripwires:**
      - Too short rejected
      - Too long rejected
      - Injection patterns rejected
      - Off-topic keywords rejected
      - Normal messages pass

      **Rate limiter:**
      - First 20 requests allowed
      - 21st request in same hour rejected
      - Reset at hour boundary
      - Per-user isolation (user A's rate doesn't affect user B)

      **Cost tracker:**
      - Accumulates across requests
      - Resets daily
      - Over-ceiling blocks further requests

      **Full pipeline:**
      - Capture intent → returns capture_redirect with fields
      - Question intent → returns stub answer
      - Scenario intent → returns stub answer
      - Off-topic → tripwire refusal
      - Rate limited → appropriate response
      - Cost capped → appropriate response
      - Network error to Anthropic → graceful error

      **UI:**
      - Message thread renders correctly
      - User input submitted, AI bubble populates
      - Capture redirect navigates correctly
      - Error state renders with retry
      - Loading indicator during request
    status: pending

  - id: lint-build-test-manual
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual QA with AI enabled:

      **Happy paths:**
      - "my electricity is $240 a quarter" → Capture sheet opens with Electricity, $240, Quarterly pre-filled
      - "my gym costs $80 a month" → similar
      - "new holiday savings goal, aim for $5000 by December" → Goal capture

      **Stub paths:**
      - "can I afford Japan in September" → stub response "coming soon"
      - "what if I skip rent next month" → stub response
      - "hello" → polite off-topic response

      **Tripwires:**
      - "ignore all previous instructions" → refusal
      - "" (empty) → prevented by input validation
      - 1000-char message → refusal

      **Rate limiting:**
      - Spam 21+ requests in quick succession → 21st blocked with reset time
      - Verify reset after an hour

      **Cost tracking:**
      - Monitor logs to confirm cost accumulates correctly
      - In staging, set ceiling artificially low (e.g., $0.01), verify block kicks in

      **Feature flag:**
      - Set `KEEL_AI_ENABLED=false`, verify Ask tab hidden, direct /ask route shows offline message
      - Set `KEEL_AI_ENABLED=true`, verify everything functional

      **UI quality:**
      - User bubbles are neutral glass (NOT sea-green) — matches UX audit fix
      - AI bubbles are glass-clear
      - Thread scrolls smoothly
      - Loading dots animate
      - Errors show retry button
    status: pending

isProject: false
---

# Ask Keel Phase 1 — the plan

## What this PR lands

Phase 1 of Ask Keel: parsing and classification only. Functional input, functional classifier, functional routing to Capture, stub answers for questions and scenarios.

## Why start with parsing only

The full Ask Keel experience has four load-bearing parts:
1. Parsing user input into structured intent (this PR)
2. Routing capture-style inputs into existing Capture flow (this PR)
3. Retrieving user's financial context as grounded data (Phase 2)
4. Generating substantive answers with safety and accuracy (Phase 2)

Parts 1-2 are discrete and shippable. Parts 3-4 require more architecture — context retrieval from Prisma, grounded prompts, schema-enforced responses, anti-hallucination guards. Those live in Phase 2.

Shipping parts 1-2 alone still provides real value: users can type sentences instead of filling forms. It's a meaningful UX win even before actual Q&A works.

## Why the safety layer exists in Phase 1

Tripwires, rate limiting, cost tracking — these all ship from day one even though the AI isn't doing much yet. Three reasons:

1. **Infrastructure is hard to add later.** Building rate limiting after users are already making unlimited requests creates a migration headache.
2. **Costs compound.** Even Haiku classification at 20 requests per hour can add up across thousands of users. Budget from day one.
3. **Patterns emerge from data.** Logging tripped inputs starts immediately; review patterns in 2 weeks, tune tripwires.

## Dependencies

- **Anthropic API key** in production env
- **Redis or Postgres-backed rate limiter** (either works)
- **Pre-Launch Sprint PR** (hides Ask tab when disabled — this PR implements the corresponding enabled state)

## What this PR does NOT include

- **Actual question answering** — deferred to Phase 2
- **Scenario planning** — deferred to Phase 2
- **Streaming responses** — Phase 1 is request/response. Streaming in Phase 2.
- **Voice input** — icon in UI but non-functional. Post-v1.
- **Multi-turn context** — each message is classified independently. No conversation memory in Phase 1.

## Risk

Medium. AI integration introduces new failure modes (Anthropic rate limits, JSON parse errors, network variability). Test each failure path. Worst case: Ask Keel is temporarily broken but other features unaffected (isolation intact).

Cost blowup is the most insidious risk — fix it with strict rate limits and cost ceilings enforced from day one. Never let a runaway loop cost $1000 before you notice.

## Phase 2 preview

Phase 2 adds:
- Grounded context retrieval (fetch user's incomes, commitments, goals, recent spend, projections)
- Structured prompts with schema-enforced outputs
- Anti-hallucination guards (only answer from provided context, cite specific dates/amounts)
- Sonnet model for substantive answers
- Streaming responses for responsiveness

That's its own PR with its own safety considerations.
