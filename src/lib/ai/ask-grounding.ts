/**
 * Post-parse enforcement so Ask responses stay aligned with {@link AskContextSnapshot}.
 *
 * @module lib/ai/ask-grounding
 */

import type { AskContextSnapshot } from "@/lib/ai/ask-context";
import type { AskKeelResponse } from "@/lib/ai/ask-keel-schema";
import { roundMoney } from "@/lib/utils";

const ALLOWED_BREAKDOWN_LABELS = new Set<string>();

function seedBreakdownLabels(snapshot: AskContextSnapshot) {
  ALLOWED_BREAKDOWN_LABELS.clear();
  for (const c of snapshot.commitments) {
    ALLOWED_BREAKDOWN_LABELS.add(c.name);
    ALLOWED_BREAKDOWN_LABELS.add(c.category);
  }
  for (const g of snapshot.goals) {
    ALLOWED_BREAKDOWN_LABELS.add(g.name);
  }
}

/**
 * Clamps structured responses to snapshot-backed numbers where enforceable.
 */
export function enforceAskResponseGrounding(
  data: AskKeelResponse,
  snapshot: AskContextSnapshot,
): AskKeelResponse {
  if (data.type === "goal_projection") {
    return {
      ...data,
      chart: {
        ...data.chart,
        todayValue: roundMoney(snapshot.availableMoney),
      },
    };
  }

  if (data.type === "spending_summary") {
    seedBreakdownLabels(snapshot);
    const breakdown = data.breakdown.filter((row) => ALLOWED_BREAKDOWN_LABELS.has(row.label));
    if (breakdown.length === 0) {
      return {
        type: "freeform",
        headline: "I don’t have enough labeled detail for that breakdown.",
        body: "Try naming a commitment or goal from your snapshot, or check Timeline for the full picture.",
      };
    }
    return { ...data, breakdown };
  }

  return data;
}
