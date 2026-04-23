/**
 * Renders the Plan 11 composed context into **two** prompt segments, ordered for
 * Anthropic prompt caching:
 *
 *   1. Stable — the authority rules + Layer C (structural assumptions). Identical
 *      across every user and every request. Placed first so it sits at the beginning
 *      of the system prefix where `cache_control: { type: "ephemeral" }` can cache it.
 *   2. Volatile — Layer A (user's current state) + Layer B (their learned patterns).
 *      Varies per user per request; placed after the cached prefix.
 *
 * Callers (see {@link buildAskSonnetAnswerSystemPrompt}) emit the stable block first,
 * with `cache_control` attached, then the volatile block unmarked. The prefix match
 * means the tools + stable-system segment serve from cache on every subsequent call,
 * at ~0.1× the per-token cost.
 *
 * Keep the rendered JSON terse — whitespace eats tokens. Do not pretty-print.
 *
 * @module lib/ai/context/render-prompt
 */

import type { ComposedContext } from "./schemas/composed-context";

function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Identical wording for every request; ordered at the start of the system prefix so
 * Anthropic's prompt cache can return it at ~0.1× cost on repeat calls.
 */
const LAYERED_AUTHORITY_RULES = `LAYERED_CONTEXT authority:
1. userContext (Layer A) — observed truth. Cite specific numbers from here for any
   question about the user's actual money. These are facts, not estimates.
2. learnedPatterns (Layer B) — behavioural signals from this user's transaction
   history. Use for "how do I usually..." questions. If learnedPatterns.isEmpty is
   true, say "I don't have enough history yet to spot a pattern".
3. structuralAssumptions (Layer C) — Australian economic baseline. Use for
   long-horizon claims (>12 months). ALWAYS surface confidence levels when citing,
   e.g. "assuming 2.9% CPI (Layer C, medium confidence)".

Long-horizon rules (>12 months):
- Use Layer A for the starting point (current balance, savings rate, goals).
- Use Layer B for likely user behaviour over the period (drift, consistency).
- Use Layer C for inflation / wage growth / asset-return assumptions.
- Explicitly NAME the assumption each number relies on.
- Provide a RANGE rather than a point estimate; uncertainty compounds.
- If Layer B is empty, say so; fall back to Layer C defaults but flag the limited
  personal data.

If the question requires data that none of the three layers contains, reply with a
freeform response that explicitly names what is missing. Do not invent numbers.`;

/**
 * The stable half of the layered context — Layer C + authority rules. Designed to be
 * byte-identical across every user and every request so the cached prefix survives.
 */
export function renderStableLayeredPrompt(context: ComposedContext): string {
  return `STRUCTURAL_ASSUMPTIONS_JSON:
${compactJson(context.structuralAssumptions)}

${LAYERED_AUTHORITY_RULES}`;
}

/**
 * The volatile half — Layer A (observed) + Layer B (learned). Must come AFTER the
 * stable block in the system array or caching won't take effect.
 */
export function renderVolatileLayeredPrompt(context: ComposedContext): string {
  return `USER_CONTEXT_JSON (Layer A — observed truth):
${compactJson(context.userContext)}

LEARNED_PATTERNS_JSON (Layer B — behavioural signals):
${compactJson(context.learnedPatterns)}

LAYERED_CONTEXT_META:
${compactJson({ version: context.version, generatedAt: context.generatedAt })}`;
}

/**
 * Single-block fallback for legacy callers that can't pass system blocks as an array.
 * Do not use for the main Ask Keel path — it defeats prompt caching.
 */
export function renderLayeredContextPrompt(context: ComposedContext): string {
  return `${renderStableLayeredPrompt(context)}

${renderVolatileLayeredPrompt(context)}`;
}
