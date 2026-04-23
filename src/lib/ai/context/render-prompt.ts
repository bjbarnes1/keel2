/**
 * Renders the Plan 11 composed context as the `LAYERED_CONTEXT` system-prompt section
 * that Sonnet receives on every Ask Keel grounded answer.
 *
 * The rendered block is inlined into {@link buildAskSonnetAnswerSystemPrompt} alongside
 * the short-horizon ref-based snapshot. Structuring it as a dedicated block (with clear
 * authority rules) lets the model reason about:
 *   - Short-horizon facts → Layer A
 *   - Behavioural "how do I usually..." → Layer B (or honestly admit no data)
 *   - Long-horizon projections (>12 months) → Layer A starting point + Layer B drift
 *     + Layer C inflation / wage / return assumptions, always citing confidence levels
 *
 * Keep the rendered JSON terse — we are already spending a few KB on the snapshot. Do
 * not pretty-print with `JSON.stringify(x, null, 2)` for the structural-assumptions blob;
 * compact form is enough and halves the tokens.
 *
 * @module lib/ai/context/render-prompt
 */

import type { ComposedContext } from "./schemas/composed-context";

/**
 * Compact JSON rendering with a single-line key grouping that stays under ~5KB for a
 * typical user. Uses `JSON.stringify` with no indent so whitespace does not eat tokens.
 */
function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

/** The fixed rules block — same wording for every request so caching is effective. */
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

/** Builds the prompt block. Called from the Sonnet answer prompt builder. */
export function renderLayeredContextPrompt(context: ComposedContext): string {
  return `LAYERED_CONTEXT_JSON:
${compactJson(context)}

${LAYERED_AUTHORITY_RULES}`;
}
