/**
 * Sonnet system prompt for Ask Keel structured JSON answers (non-streaming path).
 *
 * Accepts an optional Plan 11 `ComposedContext` — when provided, the prompt carries the
 * full three-layer context (observed / learned / structural) under a
 * `LAYERED_CONTEXT_JSON` block, in addition to the short-horizon ref allow-list. The
 * model is directed to cite Layer C confidence levels for any long-horizon claim.
 *
 * @module lib/ai/ask-answer-prompt
 */

import type { AskContextSnapshot } from "@/lib/ai/ask-context";
import { formatAskSnapshotForPrompt } from "@/lib/ai/ask-context";
import type { ComposedContext } from "@/lib/ai/context/schemas/composed-context";
import { renderLayeredContextPrompt } from "@/lib/ai/context/render-prompt";

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

export function buildAskSonnetAnswerSystemPrompt(
  snapshot: AskContextSnapshot,
  layered?: ComposedContext,
): string {
  const snapshotPrompt = formatAskSnapshotForPrompt(snapshot);
  const refList = buildCitationRefAllowList(snapshot).join(", ");
  const layeredBlock = layered ? `\n\n${renderLayeredContextPrompt(layered)}` : "";
  return `${snapshotPrompt}${layeredBlock}

You are Keel's assistant for Australian household cashflow.

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
- For type "goal_projection", chart.todayValue MUST equal the snapshot field "availableMoney" (${snapshot.availableMoney}).
- For type "freeform", when you mention any specific dollar amount or ISO date from the snapshot, include "citations". Each citation MUST use a "ref" from this exact allow-list: ${refList}
- Citation "label" should be a short human label (e.g. "Rent", "Next pay"). "amount" / "dateIso" must match the snapshot value for that ref.
- Set "confidence" to "low" when the question is ambiguous or the snapshot is thin; "high" when the answer is fully supported by cited refs.`;
}
