/**
 * Skip strategies for bills and goals: transforms scheduled cashflow *before* balances run.
 *
 * Commitment strategies (`MAKE_UP_NEXT`, `SPREAD`, `MOVE_ON`) can change the amount tied
 * to a specific bill occurrence, remove it, or push value to future events. Goal skips
 * adjust contribution timing / targets for preview flows.
 *
 * Also hosts helpers for parsing bill event ids (`commitmentId` + ISO date) shared by UI
 * deep links and engine reconciliation.
 *
 * @module lib/engine/skips
 */

import type { EngineGoal } from "@/lib/engine/keel";
import type {
  CommitmentSkipInput,
  CommitmentSkipStrategy,
  GoalSkipInput,
  PayFrequency,
  SkipInput,
  SkipPreview,
} from "@/lib/types";

export type ScheduledCashflowEvent = {
  id: string;
  date: string;
  label: string;
  amount: number;
  type: "income" | "bill";
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Bill ids are `${commitmentId}-${yyyy-mm-dd}`. Commitment ids may be hyphenated (UUID) or a single segment (cuid / slug).
 */
export function parseBillEventCommitmentId(eventId: string): string | null {
  const parts = eventId.split("-");
  if (parts.length < 4) {
    return null;
  }
  const date = parts.slice(-3).join("-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  if (parts.length === 4) {
    return parts[0] ?? null;
  }
  return parts.slice(0, -3).join("-");
}

export function billEventId(commitmentId: string, isoDate: string) {
  return `${commitmentId}-${isoDate}`;
}

/**
 * Scheduled income event ids follow `income-{incomeId}-{yyyy-mm-dd}` (see {@link collectScheduledProjectionEvents}).
 */
export function parseIncomeEventId(eventId: string): { incomeId: string; iso: string } | null {
  const m = /^income-(.+)-(\d{4}-\d{2}-\d{2})$/.exec(eventId);
  if (!m) {
    return null;
  }
  return { incomeId: m[1]!, iso: m[2]! };
}

function sortScheduled(events: ScheduledCashflowEvent[]) {
  return [...events].sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder !== 0) {
      return dateOrder;
    }
    if (left.type !== right.type) {
      return left.type === "income" ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function commitmentBillEvents(events: ScheduledCashflowEvent[], commitmentId: string) {
  return events
    .filter((event) => event.type === "bill" && parseBillEventCommitmentId(event.id) === commitmentId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function distributeAmount(total: number, parts: number): number[] {
  if (parts <= 0) {
    return [];
  }
  const base = Math.floor((total * 100) / parts) / 100;
  const out: number[] = [];
  let allocated = 0;
  for (let i = 0; i < parts; i += 1) {
    const isLast = i === parts - 1;
    const share = isLast ? roundCurrency(total - allocated) : base;
    out.push(share);
    allocated = roundCurrency(allocated + share);
  }
  return out;
}

/**
 * Applies commitment cashflow skips to a **cloned** schedule (incomes unchanged).
 * MAKE_UP_NEXT / SPREAD remove the skipped occurrence and add to future bill rows.
 * MOVE_ON removes the bill row entirely (goal redirect is handled in persistence).
 */
export function applySkipsToEvents(
  events: ScheduledCashflowEvent[],
  skips: SkipInput[],
): ScheduledCashflowEvent[] {
  const working = structuredClone(events);
  const commitmentSkips = skips.filter((skip): skip is CommitmentSkipInput => skip.kind === "commitment");
  const ordered = [...commitmentSkips].sort((a, b) => a.originalDateIso.localeCompare(b.originalDateIso));

  for (const skip of ordered) {
    const targetId = billEventId(skip.commitmentId, skip.originalDateIso);
    const index = working.findIndex((event) => event.id === targetId && event.type === "bill");
    if (index === -1) {
      continue;
    }

    const skippedEvent = working[index]!;
    const skippedAmount = skippedEvent.amount;

    if (skip.strategy === "STANDALONE") {
      working.splice(index, 1);
      continue;
    }

    if (skip.strategy === "MOVE_ON") {
      working.splice(index, 1);
      continue;
    }

    const futureBills = commitmentBillEvents(working, skip.commitmentId)
      .filter((event) => event.date > skip.originalDateIso)
      .sort((a, b) => a.date.localeCompare(b.date));

    working.splice(index, 1);

    if (skip.strategy === "MAKE_UP_NEXT") {
      const next = futureBills[0];
      if (next) {
        const nextIndex = working.findIndex((event) => event.id === next.id);
        if (nextIndex !== -1) {
          working[nextIndex] = {
            ...working[nextIndex]!,
            amount: roundCurrency(working[nextIndex]!.amount + skippedAmount),
          };
        }
      }
      continue;
    }

    if (skip.strategy === "SPREAD") {
      const n = Math.max(1, skip.spreadOverN ?? 2);
      const recipients = futureBills.slice(0, n);
      if (recipients.length < n && process.env.NODE_ENV !== "production") {
        console.warn(
          `[keel] SPREAD skip has fewer than ${n} future bill occurrences for commitment ${skip.commitmentId}; spreading over ${recipients.length}.`,
        );
      }
      if (recipients.length === 0) {
        continue;
      }
      const shares = distributeAmount(skippedAmount, recipients.length);
      for (let i = 0; i < recipients.length; i += 1) {
        const row = recipients[i]!;
        const rowIndex = working.findIndex((event) => event.id === row.id);
        if (rowIndex !== -1) {
          working[rowIndex] = {
            ...working[rowIndex]!,
            amount: roundCurrency(working[rowIndex]!.amount + (shares[i] ?? 0)),
          };
        }
      }
    }
  }

  return sortScheduled(working);
}

function runningEndBalance(
  baselineOrdered: ScheduledCashflowEvent[],
  cashflowOrdered: ScheduledCashflowEvent[],
  startingAvailableMoney: number,
) {
  const billAmountById = new Map(
    cashflowOrdered.filter((event) => event.type === "bill").map((event) => [event.id, event.amount]),
  );

  let running = startingAvailableMoney;
  for (const event of baselineOrdered) {
    if (event.type === "income") {
      running = roundCurrency(running + event.amount);
    } else {
      running = roundCurrency(running - (billAmountById.get(event.id) ?? 0));
    }
  }
  return running;
}

export function previewSkipImpact(input: {
  baselineOrdered: ScheduledCashflowEvent[];
  startingAvailableMoney: number;
  skip: CommitmentSkipInput;
  /** Active skips already persisted; preview stacks the hypothetical `skip` on top. */
  existingCommitmentSkips?: CommitmentSkipInput[];
}): SkipPreview {
  const existing = input.existingCommitmentSkips ?? [];
  const baselineCashflowSorted = sortScheduled(applySkipsToEvents(input.baselineOrdered, existing));
  const baselineEnd = runningEndBalance(
    input.baselineOrdered,
    baselineCashflowSorted,
    input.startingAvailableMoney,
  );
  const cashflowSorted = sortScheduled(
    applySkipsToEvents(input.baselineOrdered, [...existing, input.skip]),
  );
  const endWithSkip = runningEndBalance(input.baselineOrdered, cashflowSorted, input.startingAvailableMoney);

  const billAmountByEventId: Record<string, number> = {};
  for (const event of cashflowSorted) {
    if (event.type === "bill") {
      billAmountByEventId[event.id] = event.amount;
    }
  }

  return {
    billAmountByEventId,
    endProjectedAvailableMoney: endWithSkip,
    endAvailableMoneyDelta: roundCurrency(endWithSkip - baselineEnd),
  };
}

function addPayPeriod(iso: string, frequency: PayFrequency) {
  const date = new Date(`${iso}T00:00:00Z`);
  switch (frequency) {
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case "fortnightly":
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case "monthly":
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    default:
      date.setUTCDate(date.getUTCDate() + 14);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Honest, lightweight adjustment of goal pressure for dashboard math.
 * Does not model irregular deposits or changing income — see product docs.
 */
export function applyGoalSkipsToGoal(
  goal: EngineGoal,
  skips: GoalSkipInput[],
  options?: { payFrequency?: PayFrequency },
): EngineGoal {
  const mine = skips.filter((skip) => skip.goalId === goal.id);
  if (mine.length === 0) {
    return { ...goal };
  }

  const extendCount = mine.filter((skip) => skip.strategy === "EXTEND_DATE").length;
  const rebalanceCount = mine.filter((skip) => skip.strategy === "REBALANCE").length;

  let contributionPerPay = goal.contributionPerPay;
  if (rebalanceCount > 0) {
    contributionPerPay = roundCurrency(contributionPerPay * (1 + 0.06 * rebalanceCount));
  }
  if (extendCount > 0) {
    contributionPerPay = roundCurrency(contributionPerPay * Math.max(0.88, 1 - 0.04 * extendCount));
  }

  const payFrequency = options?.payFrequency ?? "fortnightly";
  let projectedCompletionIso: string | undefined;
  if (goal.targetDate && extendCount > 0) {
    let cursor = goal.targetDate;
    for (let i = 0; i < extendCount; i += 1) {
      cursor = addPayPeriod(cursor, payFrequency);
    }
    projectedCompletionIso = cursor;
  }

  return {
    ...goal,
    contributionPerPay,
    projectedCompletionIso,
  };
}

export type CommitmentSkipDisplayRow = {
  skipId?: string;
  strategy: CommitmentSkipStrategy;
  isSkipped: boolean;
  isSpreadTarget?: boolean;
};

/** Keys are baseline bill `event.id` values. */
export function commitmentSkipDisplayIndex(
  baseline: ScheduledCashflowEvent[],
  skips: Array<{
    skipId?: string;
    commitmentId: string;
    originalDateIso: string;
    strategy: CommitmentSkipStrategy;
    spreadOverN?: number | null;
  }>,
): Map<string, CommitmentSkipDisplayRow> {
  const map = new Map<string, CommitmentSkipDisplayRow>();
  const bills = baseline.filter((event) => event.type === "bill");

  for (const skip of skips) {
    const skipKey = billEventId(skip.commitmentId, skip.originalDateIso);
    const existing = map.get(skipKey);
    map.set(skipKey, {
      ...existing,
      skipId: skip.skipId ?? existing?.skipId,
      strategy: skip.strategy,
      isSkipped: true,
    });

    const future = bills
      .filter(
        (event) =>
          parseBillEventCommitmentId(event.id) === skip.commitmentId && event.date > skip.originalDateIso,
      )
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));

    if (skip.strategy === "MAKE_UP_NEXT") {
      const target = future[0];
      if (target) {
        const prev = map.get(target.id);
        map.set(target.id, {
          ...prev,
          skipId: prev?.skipId,
          strategy: prev?.strategy ?? skip.strategy,
          isSkipped: prev?.isSkipped ?? false,
          isSpreadTarget: true,
        });
      }
    }

    if (skip.strategy === "SPREAD") {
      const n = Math.max(1, skip.spreadOverN ?? 2);
      for (const target of future.slice(0, n)) {
        const prev = map.get(target.id);
        map.set(target.id, {
          ...prev,
          skipId: prev?.skipId,
          strategy: prev?.strategy ?? skip.strategy,
          isSkipped: prev?.isSkipped ?? false,
          isSpreadTarget: true,
        });
      }
    }
  }

  return map;
}
