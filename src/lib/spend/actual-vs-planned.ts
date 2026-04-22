/**
 * Pure math for comparing annualized commitment plans to arbitrary calendar windows.
 *
 * `plannedAmountForPeriod` scales recurring commitments into a fractional “month” budget
 * for report periods that aren’t aligned to pay cycles.
 *
 * @module lib/spend/actual-vs-planned
 */

import { annualizeAmount } from "@/lib/engine/keel";
import type { CommitmentFrequency } from "@/lib/types";

/** Average days per month (365.25 / 12) for scaling monthly budgets to arbitrary ranges. */
const DAYS_PER_MONTH = 30.437;

export function inclusivePeriodDays(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86400000) + 1;
}

export function plannedAmountForPeriod(
  commitmentAmount: number,
  frequency: CommitmentFrequency,
  periodDays: number,
) {
  const monthly = annualizeAmount(commitmentAmount, frequency) / 12;
  return monthly * (periodDays / DAYS_PER_MONTH);
}
