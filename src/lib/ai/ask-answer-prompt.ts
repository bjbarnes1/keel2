/**
 * Sonnet system prompt builder for Ask Keel structured JSON answers (non-streaming path).
 *
 * Returns an array of system blocks ordered for Anthropic prompt caching:
 *   1. **Stable** (`cache_control: { type: "ephemeral" }`) — the Keel instructions, JSON
 *      response schema, rules, and Layer C structural assumptions + authority rules.
 *      Byte-identical across every user, every request. Cached prefix served at ~0.1×
 *      cost after the first request.
 *   2. **Volatile** (no cache_control) — Layer A + B, the grounded snapshot, and the
 *      dynamic rules referencing per-user values (ref allow-list, availableMoney).
 *
 * Prefix invariant: any byte change in the stable block invalidates the cache for every
 * request downstream of it. Keep user-specific strings out of block 1 at all costs — in
 * particular, do not interpolate `snapshot.*` values or commitment IDs into the rules
 * section of the stable block.
 *
 * @module lib/ai/ask-answer-prompt
 */

import type Anthropic from "@anthropic-ai/sdk";

import type { AskContextSnapshot } from "@/lib/ai/ask-context";
import { formatAskSnapshotForPrompt } from "@/lib/ai/ask-context";
import type { ComposedContext } from "@/lib/ai/context/schemas/composed-context";
import {
  renderStableLayeredPrompt,
  renderVolatileLayeredPrompt,
} from "@/lib/ai/context/render-prompt";

/** Allowed `citations[].ref` values the model may cite (validated in {@link validateFreeformCitations}). */
export function buildCitationRefAllowList(snapshot: AskContextSnapshot): string[] {
  const refs: string[] = [
    "available_money",
    "bank_balance",
    "end_projected_42d",
    "balance_as_of",
  ];
  if (snapshot.availableMoneyComponents) {
    refs.push("reserved_total", "goal_contributions_total");
  }
  for (const inc of snapshot.incomes) {
    refs.push(`income:${inc.id}:amount`, `income:${inc.id}:nextPayDate`);
  }
  for (const c of snapshot.commitments) {
    refs.push(`commitment:${c.id}:amount`, `commitment:${c.id}:nextDueDate`);
  }
  for (const g of snapshot.goals) {
    refs.push(`goal:${g.id}:currentBalance`, `goal:${g.id}:contributionPerPay`);
    if (g.targetAmount != null) refs.push(`goal:${g.id}:targetAmount`);
    if (g.targetDate) refs.push(`goal:${g.id}:targetDate`);
  }
  return refs;
}

/**
 * Static instruction template. Byte-identical across every user and every request — any
 * dynamic value belongs in {@link buildVolatileBlock}, not here. If this string changes,
 * the cached prefix is invalidated and the next request pays the write premium.
 */
const STABLE_INSTRUCTION_TEMPLATE = `You are Keel's assistant for Australian household cashflow.

Return only valid JSON for one of these shapes (discriminate with "type"):
1) { "type":"goal_projection", "headline": string, "chart": { "months": string[], "todayValue": number, "targetValue": number, "targetLabel": string }, "chips"?: (string | { "text": string, "action"?: string })[] }
2) { "type":"spending_summary", "headline": string, "breakdown": { "label": string, "amount": number }[], "chips"?: (string | { "text": string, "action"?: string })[] }
3) { "type":"freeform", "headline": string, "body"?: string, "confidence"?: "high" | "medium" | "low", "chips"?: (string | { "text": string, "action"?: string })[] , "citations"?: Array<{ "ref": string, "label": string, "amount"?: number, "dateIso"?: string }> }

Rules:
- Prefer structured types when the user question clearly matches.
- Use AUD thinking; amounts are numbers (not strings).
- Keep headline short; body optional and concise.
- Chips may include optional "action" for deep links (e.g. skip_commitment:id:yyyy-mm-dd).
- **Grounding:** You may only cite amounts and dates that appear in GROUNDED_SNAPSHOT_JSON. If the snapshot does not contain enough information to answer safely, return type "freeform" explaining what is missing.
- For type "freeform", when you mention any specific dollar amount or ISO date from the snapshot, include "citations". The allowed refs are provided in the per-request CITATION_REFS_ALLOWLIST block below.
- Citation "label" should be a short human label (e.g. "Rent", "Next pay"). "amount" / "dateIso" must match the snapshot value for that ref.
- Set "confidence" to "low" when the question is ambiguous or the snapshot is thin; "high" when the answer is fully supported by cited refs.`;

function buildStableBlock(layered?: ComposedContext): string {
  if (!layered) return STABLE_INSTRUCTION_TEMPLATE;
  return `${STABLE_INSTRUCTION_TEMPLATE}

${renderStableLayeredPrompt(layered)}`;
}

function buildVolatileBlock(
  snapshot: AskContextSnapshot,
  layered?: ComposedContext,
): string {
  const snapshotPrompt = formatAskSnapshotForPrompt(snapshot);
  const refList = buildCitationRefAllowList(snapshot).join(", ");
  const volatileLayered = layered ? `\n\n${renderVolatileLayeredPrompt(layered)}` : "";
  return `${snapshotPrompt}${volatileLayered}

CITATION_REFS_ALLOWLIST: ${refList}

Per-request rules:
- For type "goal_projection", chart.todayValue MUST equal the snapshot field "availableMoney" (${snapshot.availableMoney}).`;
}

/**
 * Builds the system prompt as a two-block array. The first block carries
 * `cache_control: ephemeral` so the static instruction template + Layer C serves from
 * Anthropic's prompt cache on repeat calls.
 *
 * For callers that need a string (e.g. tests, the streaming path), use
 * {@link buildAskSonnetAnswerSystemPromptString} — note that form defeats prompt caching.
 */
export function buildAskSonnetAnswerSystemPrompt(
  snapshot: AskContextSnapshot,
  layered?: ComposedContext,
): Anthropic.TextBlockParam[] {
  return [
    {
      type: "text",
      text: buildStableBlock(layered),
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: buildVolatileBlock(snapshot, layered),
    },
  ];
}

/** String form — joins the two blocks. Defeats prompt caching; use only for tests. */
export function buildAskSonnetAnswerSystemPromptString(
  snapshot: AskContextSnapshot,
  layered?: ComposedContext,
): string {
  return `${buildStableBlock(layered)}\n\n${buildVolatileBlock(snapshot, layered)}`;
}
