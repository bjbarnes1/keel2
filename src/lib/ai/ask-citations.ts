/**
 * Validates Ask Keel `freeform.citations` against {@link AskContextSnapshot} refs.
 *
 * Models emit `ref` keys from the allow-list embedded in the Sonnet system prompt.
 * Invalid refs or value mismatches return `ok: false` so the route can fall back safely.
 *
 * @module lib/ai/ask-citations
 */

import type { AskContextSnapshot } from "@/lib/ai/ask-context";
import { roundMoney } from "@/lib/utils";

export type CitationWire = {
  ref: string;
  label: string;
  amount?: number;
  dateIso?: string;
};

const TOLERANCE = 0.02;

/** Builds the map of allowed citation refs → canonical values for validation. */
export function buildCitationRefMap(snapshot: AskContextSnapshot): Map<string, { amount?: number; dateIso?: string }> {
  const m = new Map<string, { amount?: number; dateIso?: string }>();
  m.set("available_money", { amount: snapshot.availableMoney });
  m.set("bank_balance", { amount: snapshot.bankBalance });
  m.set("end_projected_42d", { amount: snapshot.endProjectedAvailableMoney42d });
  m.set("balance_as_of", { dateIso: snapshot.balanceAsOf });

  if (snapshot.availableMoneyComponents) {
    m.set("reserved_total", { amount: snapshot.availableMoneyComponents.totalReserved });
    m.set("goal_contributions_total", { amount: snapshot.availableMoneyComponents.totalGoalContributions });
  }

  for (const inc of snapshot.incomes) {
    m.set(`income:${inc.id}:amount`, { amount: inc.amount });
    m.set(`income:${inc.id}:nextPayDate`, { dateIso: inc.nextPayDate });
  }
  for (const c of snapshot.commitments) {
    m.set(`commitment:${c.id}:amount`, { amount: c.amount });
    m.set(`commitment:${c.id}:nextDueDate`, { dateIso: c.nextDueDate });
  }
  for (const g of snapshot.goals) {
    m.set(`goal:${g.id}:currentBalance`, { amount: g.currentBalance });
    m.set(`goal:${g.id}:contributionPerPay`, { amount: g.contributionPerPay });
    if (g.targetAmount != null) m.set(`goal:${g.id}:targetAmount`, { amount: g.targetAmount });
    if (g.targetDate) m.set(`goal:${g.id}:targetDate`, { dateIso: g.targetDate });
  }
  for (const cat of snapshot.categoryTotals ?? []) {
    m.set(`category:${cat.category}:annual_total`, { amount: cat.annualTotal });
  }
  return m;
}

function roughlyEqual(a: number | undefined, b: number | undefined): boolean {
  if (a == null || b == null) return true;
  return Math.abs(roundMoney(a) - roundMoney(b)) <= TOLERANCE;
}

/**
 * Returns `ok` when every citation `ref` exists and optional `amount` / `dateIso`
 * match the snapshot within tolerance.
 */
export function validateFreeformCitations(
  citations: CitationWire[] | undefined,
  snapshot: AskContextSnapshot,
): { ok: true } | { ok: false; reasons: string[] } {
  if (!citations || citations.length === 0) {
    return { ok: true };
  }
  const map = buildCitationRefMap(snapshot);
  const reasons: string[] = [];
  for (const c of citations) {
    const row = map.get(c.ref);
    if (!row) {
      reasons.push(`unknown_ref:${c.ref}`);
      continue;
    }
    if (c.amount != null && row.amount != null && !roughlyEqual(c.amount, row.amount)) {
      reasons.push(`amount_mismatch:${c.ref}`);
    }
    if (c.dateIso != null && row.dateIso != null && c.dateIso !== row.dateIso) {
      reasons.push(`date_mismatch:${c.ref}`);
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
