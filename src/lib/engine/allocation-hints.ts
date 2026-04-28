/**
 * Non-authoritative transfer hints (“recommended” only — users execute in bank apps).
 * Uses a simple float threshold vs available cash after reserves.
 *
 * @module lib/engine/allocation-hints
 */

export type HouseholdMoneyHints = {
  /** Cash suggested to leave in the main / UBank-style hub account as working float. */
  ubankFloatTarget: number;
  /** Suggested sweep from hub to everyday spend (e.g. joint Up). */
  suggestedToSpendEveryday: number;
  /** Optional second bucket (e.g. ING saver) — remainder after spend suggestion. */
  suggestedToSecondarySaver: number;
  notes: string;
};

export function buildHouseholdMoneyHints(input: {
  availableMoney: number;
  /** From `Budget.householdConfig.ubankFloatThreshold` when set. */
  floatThreshold?: number | null;
}): HouseholdMoneyHints {
  const floatTarget = input.floatThreshold ?? 3000;
  const surplus = Math.max(0, input.availableMoney - floatTarget);
  const toSpend = Math.round(surplus * 0.65 * 100) / 100;
  const toSaver = Math.max(0, Math.round((surplus - toSpend) * 100) / 100);

  const notes =
    surplus <= 0
      ? "Available money is at or below your float target — no sweep suggested this fortnight."
      : "Split is illustrative (65% to everyday spend, remainder to saver). Adjust to your real buckets.";

  return {
    ubankFloatTarget: floatTarget,
    suggestedToSpendEveryday: toSpend,
    suggestedToSecondarySaver: toSaver,
    notes,
  };
}
