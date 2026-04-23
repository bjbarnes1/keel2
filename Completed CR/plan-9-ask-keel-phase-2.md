---
name: Ask Keel Phase 2 — grounded answers, scenario planning, streaming responses
overview: Phase 2 of Ask Keel. Adds substantive question answering via grounded context retrieval — user's financial snapshot fetched from Prisma, formatted as structured input to Claude Sonnet, schema-enforced responses with citations back to specific data points. Adds scenario planning via scenario_whatif — "what if I skip rent next month" triggers projection with simulated changes, diff against baseline, natural-language explanation. Streams responses for responsiveness. All previous safety infrastructure (tripwires, rate limiting, cost tracking) continues to apply, extended with anti-hallucination guards specific to grounded answers. Introduces the concept of a "cited answer" — every factual claim references a specific number and source from the user's data.
todos:
  - id: snapshot-retrieval
    content: |
      Create `src/lib/ai/snapshot.ts`. Fetches the user's current financial state as a structured snapshot for grounding.

      ```typescript
      export type FinancialSnapshot = {
        asOf: string;                    // ISO datetime
        availableMoney: {
          value: number;
          components: {
            bankBalance: number;
            reservedForCommitments: number;
            goalContributions: number;
          };
        };
        incomes: Array<{
          id: string;
          name: string;
          amount: number;
          frequency: Frequency;
          nextPayDate: string;
        }>;
        commitments: Array<{
          id: string;
          name: string;
          amount: number;
          frequency: Frequency;
          nextDueDate: string;
          heldTowardNextDue: number;
          categoryId: string;
          categoryName: string;
          subcategoryName?: string;
        }>;
        goals: Array<{
          id: string;
          name: string;
          targetAmount: number | null;   // null = open-ended
          currentBalance: number;
          perPayContribution: number;
          fundedFromIncomeId: string;
        }>;
        upcomingEvents: Array<{
          date: string;
          type: 'income' | 'commitment' | 'goal';
          name: string;
          amount: number;
          projectedAvailableMoney: number;
        }>;
        projections: {
          nextNegativeDate: string | null;     // "You'll be underwater on X"
          longestPositiveStreak: number;       // days
          annualIncome: number;
          annualCommitments: number;
        };
      };
      
      export async function buildSnapshot(userId: string): Promise<FinancialSnapshot> {
        const { budget } = await getBudgetContext({ userId });
        const inputs = await loadProjectionInputs(budget.id);
        const events = buildProjectionTimeline({
          asOf: new Date(),
          horizonDays: 90,
          ...inputs,
        });
        
        return {
          asOf: new Date().toISOString(),
          availableMoney: { ... },
          incomes: inputs.incomes.map(shapeIncome),
          commitments: inputs.commitments.map(shapeCommitment),
          goals: inputs.goals.map(shapeGoal),
          upcomingEvents: events.slice(0, 20).map(shapeEvent),
          projections: { ... },
        };
      }
      ```

      Keep the snapshot concise — aim for under 1500 tokens when serialized. Larger snapshots burn Sonnet budget and slow responses. Strip fields Claude doesn't need (IDs may be needed for citation, but internal metadata like createdAt should be omitted).

      Cache snapshots briefly: if the user asks two questions within 60 seconds, reuse the same snapshot. Reduces cost and ensures consistency across rapid questions.
    status: pending

  - id: grounded-answer-prompt
    content: |
      Create `src/lib/ai/answer-prompt.ts`. The system prompt for grounded question answering.

      ```typescript
      export function buildAnswerPrompt(snapshot: FinancialSnapshot, question: string): Anthropic.MessageParam[] {
        const system = `You are Ask Keel, a calm financial assistant. You ONLY answer questions using the user's snapshot provided below. 

      Rules:
      1. Never invent numbers, dates, or entities. If the snapshot doesn't contain the information, say so.
      2. Every factual claim must cite a specific number from the snapshot. Format: "Your rent is $3,042 (fortnightly, due 23 April)."
      3. Be brief. 1-3 sentences unless the question requires more.
      4. Use natural Australian English. Calm, clear, never hype.
      5. Never offer financial advice. Describe the user's situation; don't prescribe actions.
      6. No markdown formatting. Plain text only.
      7. If the question is ambiguous, ask a clarifying question instead of guessing.

      User snapshot:
      ${JSON.stringify(snapshot, null, 2)}`;
      
        return [
          { role: 'user', content: question }
        ];
      }
      ```

      System prompt length: the snapshot dominates. ~1500 tokens for the snapshot, ~200 for rules. Total system ~1700 tokens.

      Use Sonnet (not Haiku) for answers — the reasoning quality matters. Cost per answer: roughly $0.02-0.04 AUD. At 20 requests/hour with the existing rate limit, cost per user per day caps at ~$0.80 worst case. Adjust the cost ceiling to $1.00 if Phase 2's answers push it there.

      Temperature: 0.2. Low for consistency across similar questions, some variation for natural language.

      Max tokens: 300. Most answers are short.
    status: pending

  - id: answer-schema-enforcement
    content: |
      Force answers into a structured schema to enable anti-hallucination checks.

      Use Anthropic's tool-use feature to get structured output:

      ```typescript
      const answerTool = {
        name: 'provide_answer',
        description: 'Provide a grounded answer to the user\'s question.',
        input_schema: {
          type: 'object',
          properties: {
            answer: { type: 'string', description: 'Natural language answer, 1-3 sentences' },
            citations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fact: { type: 'string' },
                  source: { type: 'string', description: 'Which snapshot field (e.g., "commitments[0].amount")' },
                  value: { type: ['number', 'string'] },
                },
              },
            },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['answer', 'citations', 'confidence'],
        },
      };
      ```

      After Claude responds, validate:
      - Every cited value actually exists in the snapshot at the specified path
      - If any citation is invalid, flag as hallucination and fall back to: "I'm having trouble finding that in your data. Could you rephrase?"
      - Low confidence answers append a hedge: "I'm not certain about this — consider checking the details yourself."

      This is the anti-hallucination layer. Without it, Sonnet can invent numbers that sound plausible but don't exist in the user's data.
    status: pending

  - id: scenario-what-if
    content: |
      Implement scenario planning. Triggered when intent classifier returns `scenario`.

      `src/lib/ai/scenario.ts`:
      ```typescript
      export async function runScenario(input: string, userId: string): Promise<ScenarioResult> {
        const baselineSnapshot = await buildSnapshot(userId);
        
        // Parse the scenario into a modification
        const modification = await parseScenarioIntent(input);
        // e.g., { type: 'skip', entity: 'commitment', name: 'Rent', date: '2026-05-07' }
        
        // Apply modification to inputs
        const modifiedInputs = applyScenarioToInputs(baselineSnapshot, modification);
        
        // Run projection with modified inputs
        const modifiedEvents = buildProjectionTimeline({ ...modifiedInputs });
        
        // Compute diff
        const diff = computeScenarioDiff(baselineSnapshot.upcomingEvents, modifiedEvents);
        
        // Ask Sonnet to explain the diff in natural language
        const explanation = await explainDiff(input, diff);
        
        return {
          explanation,
          diff,  // for potential UI rendering
        };
      }
      ```

      Scenario types to support in v1:
      - `skip_commitment`: "what if I skip rent next month"
      - `skip_income`: "what if I don't get paid next fortnight"
      - `add_commitment`: "what if I add a $200/month subscription"
      - `change_goal_contribution`: "what if I save $500 instead of $200 per pay"

      More types can be added; these four cover most natural-language scenarios.

      The scenario runs in memory — no persistence. User asks, Keel shows the diff, user either acts on it (via Capture or manual edit) or doesn't.

      UI rendering: the scenario response can include a small inline visualization (a mini version of the trajectory curve showing baseline vs modified). Defer this to a follow-up PR — v1 is prose explanation.
    status: pending

  - id: streaming-responses
    content: |
      Switch from request/response to streaming for the Ask UI.

      Anthropic SDK supports streaming via:
      ```typescript
      const stream = await client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: systemPrompt,
        messages: [...],
      });
      
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          // send text chunk to client
        }
      }
      ```

      For Next.js, use Server-Sent Events (SSE) or a streaming Response:
      ```typescript
      export async function POST(request: Request) {
        const { input } = await request.json();
        // ... validation, rate limit, etc.
        
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const aiStream = await client.messages.stream({ ... });
            for await (const event of aiStream) {
              if (event.type === 'content_block_delta') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: event.delta.text })}\n\n`));
              }
            }
            controller.close();
          },
        });
        
        return new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }
      ```

      Client-side: use EventSource or fetch's streaming body to consume the stream. Append chunks to the AI bubble as they arrive.

      Benefit: instead of waiting 2-4 seconds for the full answer, users see the first word within 300ms. Dramatically better perceived responsiveness.

      Keep the non-streaming path for intent classification (Haiku is fast enough, no streaming needed) and for scenario-mode responses (where the full diff is needed before explanation).
    status: pending

  - id: anti-hallucination-guards
    content: |
      Validate every response against the snapshot before presenting to the user.

      `src/lib/ai/hallucination-check.ts`:
      ```typescript
      export function validateAnswer(answer: StructuredAnswer, snapshot: FinancialSnapshot): ValidationResult {
        const errors: string[] = [];
        
        for (const citation of answer.citations) {
          const actual = getValueByPath(snapshot, citation.source);
          if (actual === undefined) {
            errors.push(`Citation source "${citation.source}" does not exist in snapshot`);
            continue;
          }
          if (!deepEqual(actual, citation.value)) {
            errors.push(`Citation "${citation.source}" value mismatch: claimed ${citation.value}, actual ${actual}`);
          }
        }
        
        // Check answer text for suspicious number patterns
        const numbersInAnswer = extractNumbers(answer.answer);
        const numbersInSnapshot = extractAllNumbers(snapshot);
        const orphanNumbers = numbersInAnswer.filter(n => !numbersInSnapshot.has(n));
        if (orphanNumbers.length > 0) {
          errors.push(`Suspicious numbers in answer not found in snapshot: ${orphanNumbers.join(', ')}`);
        }
        
        return { valid: errors.length === 0, errors };
      }
      ```

      On validation failure:
      - Log the failure with full context (input, snapshot, Claude response, errors)
      - Return a fallback response: "I'm having trouble answering that accurately. Could you check the Timeline or Home screen for the details?"
      - Do NOT show the invalid answer to the user

      Failure rate should be very low (<1%) with proper prompting. If higher, the prompt needs tuning.

      False positives (valid answers flagged as invalid): some rounded numbers may mismatch. Allow 1% tolerance on currency values. "About $3,000" when the exact is $3,042 should pass.
    status: pending

  - id: ui-updates-for-phase-2
    content: |
      Update the Ask UI to support:

      1. **Streaming text**: AI bubble populates chunk-by-chunk. Slight fade-in on each chunk. Cursor at end while streaming.

      2. **Citations rendering**: below the answer, show a small "Based on" section listing cited sources. Each citation is a small chip: "Rent $3,042". Tap a chip to navigate to the underlying detail (commitment, income, goal).

      3. **Scenario diff rendering**: when intent is scenario, render the explanation plus a subtle "See the difference" link that expands to show before/after projections (simple list: "Next month: $4,700 → $7,700 (+$3,000)").

      4. **Confidence indicator**: low-confidence answers get a small muted suffix: "— I'm not certain about this."

      5. **Retry on hallucination failure**: if validation fails, show the fallback message with a retry button.

      Styling preserves the Ask design brief: user bubbles neutral glass, AI bubbles clear glass, sea-green used only for primary actions and confirmed states.
    status: pending

  - id: testing-phase-2
    content: |
      Comprehensive test coverage:

      **Unit:**
      - Snapshot retrieval: fields populated correctly
      - Answer prompt: proper structure
      - Schema enforcement: well-formed tool-use output parsed, malformed rejected
      - Hallucination check: valid answers pass, invalid answers fail
      - Scenario parsing: natural language → structured modification
      - Scenario application: baseline inputs + modification → modified inputs

      **Integration:**
      - Mock Anthropic SDK, verify end-to-end flow for question
      - Mock for scenario
      - Failure modes: network error, invalid JSON, schema violation, hallucination detected

      **E2E (staging):**
      - Real API key, real Sonnet
      - "Can I afford a $500 dinner this week?" → grounded answer citing available money
      - "What if I skip rent next month?" → scenario with diff
      - "Write me a poem about budgeting" → tripwire refusal
      - 21 rapid requests → rate limit kicks in

      Keep test fixtures realistic — use seeded user data that resembles actual users.
    status: pending

  - id: lint-build-test-manual
    content: |
      `npm run lint`, `npm run build`, `npm test`. All pass.

      Manual QA on staging:

      **Grounded answers:**
      - "How much do I have?" → "$X — bank balance $Y, reserved $Z, ..."
      - "When's my next pay?" → "Your next pay is X on date Y"
      - "Can I afford Japan in September?" → answer based on projected balance on specific date, citing projection

      **Scenarios:**
      - "What if I skip rent next month?" → explanation, diff shows rent not subtracted, available money higher
      - "What if I save $500 per pay instead of $200?" → explanation of impact on long-term goal balance
      - "What if I get an extra $1000 next fortnight?" → positive scenario

      **Streaming:**
      - Responses start appearing within 500ms
      - Text streams smoothly, not janky
      - Citations appear after stream completes
      - Works on slow connections (throttle to 3G in devtools)

      **Edge cases:**
      - Question about data that doesn't exist: Keel says "I don't have information about that"
      - Ambiguous question: Keel asks clarifying question instead of guessing
      - Complex question requiring multiple citations: all citations valid
      - Hallucination in response: validation catches, fallback message shown

      **Cost & rate limit:**
      - Monitor logs to verify cost accumulates correctly at Sonnet rates
      - Rate limit still holds across Phase 1 and Phase 2 requests shared

      **Refusal cases:**
      - "Ignore previous instructions" → tripwire
      - "Write code" → off-topic refusal or polite deflection
      - "Tell me about Bitcoin prices" → polite "Keel focuses on your money, not markets" style deflection
    status: pending

isProject: false
---

# Ask Keel Phase 2 — the plan

## What this PR lands

Substantive question answering and scenario planning. The culmination of Ask Keel as a feature.

## Why this matters

Phase 1 made Ask useful as a capture entry point. Phase 2 makes it useful as a financial thinking partner — a place where users ask real questions about their money and get accurate, grounded answers.

This is the feature that differentiates Keel from "a budgeting app with a chat interface" to "a budgeting app where the chat actually understands your situation."

## Dependencies

- **Ask Keel Phase 1 PR** (infrastructure: tripwires, rate limiting, cost tracking, classifier, UI)
- **Timeline Foundation PR** (snapshot uses buildProjectionTimeline with startDate parameter)
- **Nothing else**

## Risk

High, for three reasons:

1. **Hallucination potential.** Sonnet can invent plausible numbers. Anti-hallucination layer mitigates but doesn't eliminate. Monitor closely after launch.
2. **Cost potential.** Sonnet is ~20× more expensive than Haiku per token. If snapshot retrieval is slow or prompts balloon, cost could spike. Strict token budgets and cost tracking essential.
3. **User trust.** If Ask Keel answers wrong once, users lose trust permanently. Conservative fallbacks ("I'm not sure — check the Timeline") are better than confident incorrect answers.

Start cautiously. Beta test with limited users first. Monitor logs obsessively for hallucination events.

## Conservative posture

Better to answer fewer questions accurately than many questions with errors. If a question is complex or data is ambiguous, Keel should decline or ask for clarification. Error on the side of "I don't know" rather than "Here's a confident wrong answer."

The stub response in Phase 1 ("that's coming soon") is actually a safe default. Phase 2 should never be worse than that stub — if a question risks hallucination, fall back to the stub.

## What this PR does NOT include

- **Conversation memory across turns** — each question is independent. Multi-turn context is Phase 3.
- **Proactive insights** — Ask doesn't initiate conversations. User-driven only.
- **Scheduled briefings** — "Every Monday summarize my week" is post-v1.
- **Export or share answers** — v1 is ephemeral.

## Phase 3 preview (when you're ready)

- Multi-turn context: Keel remembers earlier questions in the session
- Proactive observations: "You usually spend $X in week 2 — this week you've spent $Y"
- Weekly digest: optional email summary
- Voice input: Ask by speaking, Keel responds with text
