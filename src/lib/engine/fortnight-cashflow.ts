/**
 * Fortnight-bucketed cashflow table from the projection engine (26 fortnights ≈ 364 days).
 * Also exposes {@link countFortnightlyPaysInMonth} for third-fortnight detection in tests.
 *
 * @module lib/engine/fortnight-cashflow
 */

import { buildProjectionTimeline } from "@/lib/engine/keel";
import type { SkipInput } from "@/lib/types";

import type { StoredKeelState } from "@/lib/persistence/state";
import type { ActiveSkipsBundle } from "@/lib/persistence/skips";

export type FortnightCashflowRow = {
  index: number;
  /** Inclusive start (UTC calendar day as ISO). */
  startIso: string;
  /** Inclusive end (UTC calendar day as ISO). */
  endIso: string;
  /** Projected available money at end of bucket (last day in range). */
  endProjectedAvailableMoney: number;
};

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Counts how many times `nextPayDate` would occur within a calendar month (UTC `monthIso` YYYY-MM)
 * when stepping forward `frequency` from the income’s configured `nextPayDate` anchor.
 */
export function countFortnightlyPaysInMonth(input: {
  monthIso: string;
  /** Anchor pay date (ISO) on or before the month — typically engine `nextPayDate`. */
  anchorPayIso: string;
}): number {
  const [y, m] = input.monthIso.split("-").map(Number) as [number, number];
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));

  const pay = new Date(`${input.anchorPayIso}T00:00:00Z`);
  while (pay.getTime() < monthStart.getTime()) {
    pay.setUTCDate(pay.getUTCDate() + 14);
  }

  let count = 0;
  while (pay.getTime() <= monthEnd.getTime()) {
    count += 1;
    pay.setUTCDate(pay.getUTCDate() + 14);
  }
  return count;
}

/**
 * Builds 26 consecutive fortnight buckets from `asOfIso`, sampling the projection stream.
 */
export function buildFortnightCashflowTable(input: {
  state: StoredKeelState;
  activeSkips: ActiveSkipsBundle;
  asOfIso: string;
  startingAvailableMoney: number;
  fortnights?: number;
}): FortnightCashflowRow[] {
  const n = input.fortnights ?? 26;
  const asOf = new Date(`${input.asOfIso}T00:00:00Z`);
  const horizonDays = n * 14;

  const skipInputs: SkipInput[] = [
    ...input.activeSkips.commitmentSkips,
    ...input.activeSkips.goalSkips,
    ...(input.activeSkips.incomeSkips ?? []),
  ];

  const activeCommitments = input.state.commitments.filter((c) => !c.archivedAt);

  const events = buildProjectionTimeline({
    availableMoney: input.startingAvailableMoney,
    asOf,
    horizonDays,
    incomes: input.state.incomes,
    commitments: activeCommitments,
    skips: skipInputs,
  });

  const byDate = new Map<string, number>();
  for (const e of events) {
    byDate.set(e.date, e.projectedAvailableMoney);
  }

  const rows: FortnightCashflowRow[] = [];
  let startIso = input.asOfIso;

  for (let i = 0; i < n; i += 1) {
    const endIso = addDaysIso(startIso, 13);
    let money = input.startingAvailableMoney;
    for (let d = 0; d <= 13; d += 1) {
      const iso = addDaysIso(startIso, d);
      const hit = byDate.get(iso);
      if (hit != null) money = hit;
    }
    rows.push({ index: i + 1, startIso, endIso, endProjectedAvailableMoney: money });
    startIso = addDaysIso(endIso, 1);
  }

  return rows;
}
