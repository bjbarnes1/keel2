/**
 * Deterministic daily alert checks for cron + in-app surfacing (no email dependency).
 *
 * @module lib/alerts/daily-alerts
 */

import type { DashboardSnapshot } from "@/lib/types";

import type { HouseholdConfigShape } from "@/lib/persistence/household-config";
import type { RebateQueueRow } from "@/lib/persistence/medical";

export type DailyAlert = { level: "info" | "warn" | "danger"; code: string; message: string };

export function runDailyAlertChecks(input: {
  snapshot: DashboardSnapshot;
  household: HouseholdConfigShape;
  outstandingRebates: RebateQueueRow[];
  /** Days since expense for large unmatched rebates */
  now: Date;
}): DailyAlert[] {
  const alerts: DailyAlert[] = [];
  const floatTarget = input.household.ubankFloatThreshold ?? 3000;

  if (input.snapshot.availableMoney < floatTarget) {
    alerts.push({
      level: "warn",
      code: "FLOAT_LOW",
      message: `Available money ${input.snapshot.availableMoney.toFixed(0)} is below your float target (${floatTarget}).`,
    });
  }

  const min12 = input.snapshot.forecast.twelveMonths.minProjectedAvailableMoney;
  if (min12 < 0) {
    alerts.push({
      level: "danger",
      code: "PROJECTED_NEGATIVE",
      message: "Projected available money goes negative within 12 months — review timeline and commitments.",
    });
  }

  const msDay = 86400000;
  for (const r of input.outstandingRebates) {
    const expected = r.expected - r.matched;
    if (expected < 500) continue;
    const posted = new Date(`${r.postedOn}T00:00:00Z`);
    const ageDays = (input.now.getTime() - posted.getTime()) / msDay;
    if (ageDays >= 60) {
      alerts.push({
        level: "warn",
        code: "REBATE_STALE",
        message: `Rebate over $500 unmatched for 60+ days: ${r.memo.slice(0, 80)}`,
      });
      break;
    }
  }

  return alerts;
}
