/**
 * Core cashflow engine: scheduling, reserves, available money, and projection timelines.
 *
 * **Pure domain layer** — no I/O, no React. Persistence maps DB rows into the small
 * `EngineIncome` / `EngineCommitment` / `EngineGoal` shapes consumed here.
 *
 * Major concepts:
 * - *Available money* — bank balance minus goal envelopes and per-commitment reserves
 *   computed against the primary pay cycle (`calculateAvailableMoney`).
 * - *Projection timeline* — deterministic forward simulation of pay + bill events with
 *   running balances; commitment skips mutate bill *cashflow* amounts via `skips.ts`
 *   before the walk (`buildProjectionTimeline`).
 * - *Chunked windows* — optional `startDate` + `horizonDays` let the Timeline load later
 *   weeks without resetting balances to zero (warm-up walk from `asOf`).
 *
 * All calendar math uses UTC midnight (`T00:00:00Z`) to avoid TZ drift across clients.
 *
 * @module lib/engine/keel
 */

import type {
  CommitmentFrequency,
  CommitmentSkipInput,
  IncomeSkipInput,
  PayFrequency,
  SkipInput,
} from "@/lib/types";

import {
  applyGoalSkipsToGoal,
  applySkipsToEvents,
  parseIncomeEventId,
  type ScheduledCashflowEvent,
} from "@/lib/engine/skips";

export type { ScheduledCashflowEvent } from "@/lib/engine/skips";

export interface EngineIncome {
  id: string;
  name: string;
  amount: number;
  frequency: PayFrequency;
  nextPayDate: string;
}

export interface EngineCommitment {
  id: string;
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  nextDueDate: string;
  fundedByIncomeId?: string;
  category?: string;
}

export interface EngineGoal {
  id: string;
  name: string;
  contributionPerPay: number;
  fundedByIncomeId?: string;
  currentBalance?: number;
  targetAmount?: number;
  targetDate?: string;
  /** Optional display hint after goal skips (simple simulation, not a promise date). */
  projectedCompletionIso?: string;
}

export interface CommitmentReserve {
  id: string;
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  nextDueDate: string;
  reserved: number;
  perPay: number;
  percentFunded: number;
  fundedByIncomeId?: string;
  category?: string;
}

export interface AvailableMoneyResult {
  bankBalance: number;
  totalReserved: number;
  totalGoalContributions: number;
  availableMoney: number;
  commitmentReserves: CommitmentReserve[];
}

/**
 * A single dated cashflow event in the projection timeline.
 *
 * **Vocabulary note:** the `type` discriminant uses `"bill"` as the internal identifier
 * for an outgoing commitment event — this reflects the cashflow direction (money out) and
 * is shared with {@link ScheduledCashflowEvent} from `skips.ts`. User-facing strings across
 * the product use "commitment" (Plan 4 vocabulary audit). Do not rename the discriminant
 * without updating every call site, test fixture, and persisted snapshot payload.
 */
export interface ProjectionEvent {
  id: string;
  date: string;
  label: string;
  amount: number;
  type: "income" | "bill";
  projectedAvailableMoney: number;
  /** When set, this income pay was skipped (no credit applied to running balance). */
  isSkipped?: boolean;
  skipId?: string;
}

export interface PayPeriodWindow {
  start: Date;
  end: Date;
  dayIndex: number;
  totalDays: number;
}

export function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addCycle(date: Date, frequency: CommitmentFrequency | PayFrequency) {
  const next = new Date(date);

  switch (frequency) {
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    case "fortnightly":
      next.setUTCDate(next.getUTCDate() + 14);
      return next;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case "quarterly":
      next.setUTCMonth(next.getUTCMonth() + 3);
      return next;
    case "annual":
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return next;
    default:
      return next;
  }
}

function subtractCycle(date: Date, frequency: CommitmentFrequency | PayFrequency) {
  const previous = new Date(date);

  switch (frequency) {
    case "weekly":
      previous.setUTCDate(previous.getUTCDate() - 7);
      return previous;
    case "fortnightly":
      previous.setUTCDate(previous.getUTCDate() - 14);
      return previous;
    case "monthly":
      previous.setUTCMonth(previous.getUTCMonth() - 1);
      return previous;
    case "quarterly":
      previous.setUTCMonth(previous.getUTCMonth() - 3);
      return previous;
    case "annual":
      previous.setUTCFullYear(previous.getUTCFullYear() - 1);
      return previous;
    default:
      return previous;
  }
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function compareUtcDate(left: Date, right: Date) {
  const a = startOfUtcDay(left).getTime();
  const b = startOfUtcDay(right).getTime();
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// --- Pay cycle window --------------------------------------------------------

/**
 * Locates the current pay period around the user’s primary income schedule.
 *
 * Used by dashboard copy and some horizon labels; not authoritative for engine dates
 * (those come from `nextPayDate` on each income row).
 */
export function getCurrentPayPeriod(
  primaryIncome: EngineIncome | null,
  asOf: Date,
): PayPeriodWindow {
  const asOfDay = startOfUtcDay(asOf);

  if (primaryIncome) {
    let nextPay = parseDate(primaryIncome.nextPayDate);
    while (compareUtcDate(nextPay, asOfDay) <= 0) {
      nextPay = addCycle(nextPay, primaryIncome.frequency);
    }

    const periodStart = subtractCycle(nextPay, primaryIncome.frequency);
    const periodEnd = new Date(nextPay);
    // Inclusive end date for the current pay cycle (day before next pay day).
    periodEnd.setUTCDate(periodEnd.getUTCDate() - 1);

    const totalDays = Math.max(1, daysBetween(periodStart, periodEnd) + 1);
    const dayIndex = Math.min(totalDays, daysBetween(periodStart, asOfDay) + 1);

    return { start: periodStart, end: periodEnd, dayIndex, totalDays };
  }

  // Calendar fortnight fallback anchored to asOf (UTC).
  const epoch = Date.UTC(1970, 0, 5); // Monday
  const ms = asOfDay.getTime() - epoch;
  const fortnightIndex = Math.floor(ms / (14 * 86400000));
  const start = new Date(epoch + fortnightIndex * 14 * 86400000);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 14);

  const totalDays = 14;
  const dayIndex = Math.min(totalDays, daysBetween(start, asOfDay) + 1);

  return { start, end, dayIndex, totalDays };
}

export function isCommitmentInAttention(input: {
  commitment: CommitmentReserve;
  payPeriod: PayPeriodWindow;
  asOf: Date;
}): boolean {
  const { commitment, payPeriod, asOf } = input;

  if (commitment.percentFunded >= 100) {
    return false;
  }

  const due = parseDate(commitment.nextDueDate);
  if (compareUtcDate(due, payPeriod.start) < 0 || compareUtcDate(due, payPeriod.end) > 0) {
    return false;
  }

  const gap = roundCurrency(commitment.amount - commitment.reserved);
  if (gap <= 0) {
    return false;
  }

  const payLengthDays = Math.max(1, daysBetween(payPeriod.start, payPeriod.end) + 1);
  const perDay = roundCurrency(commitment.perPay / payLengthDays);

  const attentionEnd =
    compareUtcDate(due, payPeriod.end) < 0 ? due : payPeriod.end;
  const remainingDays = Math.max(0, daysBetween(startOfUtcDay(asOf), attentionEnd));
  const projectedReserve = roundCurrency(commitment.reserved + perDay * remainingDays);

  return roundCurrency(commitment.amount - projectedReserve) > 0;
}

export function annualizeAmount(
  amount: number,
  frequency: CommitmentFrequency | PayFrequency,
) {
  switch (frequency) {
    case "weekly":
      return amount * 52;
    case "fortnightly":
      return amount * 26;
    case "monthly":
      return amount * 12;
    case "quarterly":
      return amount * 4;
    case "annual":
      return amount;
    default:
      return amount;
  }
}

export function payPeriodsPerYear(frequency: PayFrequency) {
  switch (frequency) {
    case "weekly":
      return 52;
    case "fortnightly":
      return 26;
    case "monthly":
      return 12;
    default:
      return 26;
  }
}

export function calculatePerPayAmount(
  amount: number,
  billFrequency: CommitmentFrequency,
  payFrequency: PayFrequency,
) {
  return roundCurrency(annualizeAmount(amount, billFrequency) / payPeriodsPerYear(payFrequency));
}

function resolveIncome(
  incomes: EngineIncome[],
  fundedByIncomeId: string | undefined,
  primaryIncomeId: string | undefined,
) {
  const primary =
    (primaryIncomeId
      ? incomes.find((income) => income.id === primaryIncomeId)
      : undefined) ?? incomes[0];

  if (!primary) {
    throw new Error("At least one income is required.");
  }

  if (!fundedByIncomeId) {
    return primary;
  }

  return incomes.find((income) => income.id === fundedByIncomeId) ?? primary;
}

export function calculateCommitmentReserve(
  commitment: EngineCommitment,
  incomes: EngineIncome[],
  primaryIncomeId: string | undefined,
  asOf: Date,
): CommitmentReserve {
  const income = resolveIncome(incomes, commitment.fundedByIncomeId, primaryIncomeId);
  const dueDate = parseDate(commitment.nextDueDate);
  const lastDueDate = subtractCycle(dueDate, commitment.frequency);
  const cycleLength = Math.max(1, daysBetween(lastDueDate, dueDate));
  const progress = Math.min(daysBetween(lastDueDate, asOf) / cycleLength, 1);
  const reserved = roundCurrency(commitment.amount * progress);
  const perPay = calculatePerPayAmount(
    commitment.amount,
    commitment.frequency,
    income.frequency,
  );

  return {
    id: commitment.id,
    name: commitment.name,
    amount: commitment.amount,
    frequency: commitment.frequency,
    nextDueDate: commitment.nextDueDate,
    reserved,
    perPay,
    percentFunded: Math.min(
      100,
      Math.round((reserved / commitment.amount) * 100),
    ),
    fundedByIncomeId: commitment.fundedByIncomeId ?? income.id,
    category: commitment.category,
  };
}

// --- Available money (reserves + goals) ------------------------------------

/**
 * Computes discretionary cash after setting aside money for upcoming bills and goals.
 *
 * Each commitment gets a `CommitmentReserve` (reserved amount + % funded) based on
 * how many pay days remain before the next due date. Goals subtract `contributionPerPay`
 * for each pay event until the target is met (simplified model — see implementation).
 */
export function calculateAvailableMoney(input: {
  bankBalance: number;
  incomes: EngineIncome[];
  primaryIncomeId?: string;
  commitments: EngineCommitment[];
  goals: EngineGoal[];
  asOf: Date;
}): AvailableMoneyResult {
  const commitmentReserves = input.commitments.map((commitment) =>
    calculateCommitmentReserve(
      commitment,
      input.incomes,
      input.primaryIncomeId,
      input.asOf,
    ),
  );

  const totalReserved = roundCurrency(
    commitmentReserves.reduce((sum, commitment) => sum + commitment.reserved, 0),
  );
  const totalGoalContributions = roundCurrency(
    input.goals.reduce((sum, goal) => {
      const income = resolveIncome(
        input.incomes,
        goal.fundedByIncomeId,
        input.primaryIncomeId,
      );

      // Normalize to a weekly cashflow-equivalent so mixed pay cadences can be combined.
      const weeklyEquivalent =
        (goal.contributionPerPay * payPeriodsPerYear(income.frequency)) / 52;

      return sum + weeklyEquivalent;
    }, 0),
  );

  return {
    bankBalance: input.bankBalance,
    totalReserved,
    totalGoalContributions,
    availableMoney: roundCurrency(
      input.bankBalance - totalReserved - totalGoalContributions,
    ),
    commitmentReserves,
  };
}

// --- Scheduled events (income + bills) ---------------------------------------

/**
 * Expands recurring incomes/commitments into discrete dated cashflow events up to
 * `asOf + horizonDays`.
 *
 * This is the *unskipped* baseline; `buildProjectionTimeline` layers skip adjustments
 * on top before computing balances.
 */
export function collectScheduledProjectionEvents(input: {
  asOf: Date;
  horizonDays: number;
  incomes: EngineIncome[];
  commitments: EngineCommitment[];
}): ScheduledCashflowEvent[] {
  const horizonEnd = new Date(input.asOf);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + input.horizonDays);

  const scheduledEvents: ScheduledCashflowEvent[] = [];

  for (const income of input.incomes) {
    let incomeDate = parseDate(income.nextPayDate);
    while (incomeDate <= horizonEnd) {
      if (incomeDate >= input.asOf) {
        scheduledEvents.push({
          id: `income-${income.id}-${toIsoDate(incomeDate)}`,
          date: toIsoDate(incomeDate),
          label: income.name,
          amount: income.amount,
          type: "income",
        });
      }
      incomeDate = addCycle(incomeDate, income.frequency);
    }
  }

  for (const commitment of input.commitments) {
    let dueDate = parseDate(commitment.nextDueDate);

    while (dueDate <= horizonEnd) {
      if (dueDate >= input.asOf) {
        scheduledEvents.push({
          id: `${commitment.id}-${toIsoDate(dueDate)}`,
          date: toIsoDate(dueDate),
          label: commitment.name,
          amount: commitment.amount,
          type: "bill",
        });
      }

      dueDate = addCycle(dueDate, commitment.frequency);
    }
  }

  scheduledEvents.sort((left, right) => {
    const dateOrder = left.date.localeCompare(right.date);
    if (dateOrder !== 0) {
      return dateOrder;
    }

    if (left.type !== right.type) {
      return left.type === "income" ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });

  return scheduledEvents;
}

/** Bill-only occurrences for one commitment (no incomes required). */
export function listCommitmentBillOccurrences(input: {
  commitment: EngineCommitment;
  asOf: Date;
  horizonDays: number;
}) {
  return collectScheduledProjectionEvents({
    asOf: input.asOf,
    horizonDays: input.horizonDays,
    incomes: [],
    commitments: [input.commitment],
  }).filter((event) => event.type === "bill");
}

/**
 * Builds the projected-cashflow timeline.
 *
 * `asOf` is the anchor for "now" — the starting available-money floor. `startDate`
 * (optional, defaults to `asOf`) is the lower bound of returned events. When
 * `startDate > asOf` the running balance is walked from `availableMoney` through
 * every event between `asOf` and `startDate` so the first returned event reflects
 * the correct balance (required for chunked loading of week 4+ windows).
 */
export function buildProjectionTimeline(input: {
  availableMoney: number;
  asOf: Date;
  /** Lower bound for returned events. Defaults to `asOf`. */
  startDate?: Date;
  /** Size of the returned window in days, measured from `startDate`. Defaults to 42. */
  horizonDays?: number;
  incomes: EngineIncome[];
  commitments: EngineCommitment[];
  skips?: SkipInput[];
}) {
  const horizonDays = input.horizonDays ?? 42;
  const startDate = input.startDate ?? input.asOf;

  // Window end (inclusive) = startDate + horizonDays. Generation horizon must cover
  // the window end even when startDate > asOf.
  const rangeEndMs = startDate.getTime() + horizonDays * 86_400_000;
  const asOfEndMs = input.asOf.getTime() + horizonDays * 86_400_000;
  const generationEndMs = Math.max(asOfEndMs, rangeEndMs);
  const generationHorizonDays = Math.max(
    0,
    Math.ceil((generationEndMs - input.asOf.getTime()) / 86_400_000),
  );

  const baseline = collectScheduledProjectionEvents({
    asOf: input.asOf,
    horizonDays: generationHorizonDays,
    incomes: input.incomes,
    commitments: input.commitments,
  });

  /** Commitment skips reshape bill amounts before the running balance walk; order matches `skips.ts` + `keel-store` timeline. */
  const commitmentSkips =
    input.skips?.filter((skip): skip is CommitmentSkipInput => skip.kind === "commitment") ?? [];
  const incomeSkips =
    input.skips?.filter((skip): skip is IncomeSkipInput => skip.kind === "income") ?? [];
  const incomeSkipByKey = new Map<string, IncomeSkipInput>();
  for (const skip of incomeSkips) {
    incomeSkipByKey.set(`${skip.incomeId}:${skip.originalDateIso}`, skip);
  }

  const cashflow = applySkipsToEvents(baseline, commitmentSkips);

  const cashflowBillAmountById = new Map(
    cashflow.filter((event) => event.type === "bill").map((event) => [event.id, event.amount]),
  );

  const startIso = toIsoDate(startOfUtcDay(startDate));
  const endIso = toIsoDate(startOfUtcDay(new Date(rangeEndMs)));

  let runningAvailableMoney = input.availableMoney;
  const out: ProjectionEvent[] = [];

  for (const event of baseline) {
    const incomeParts = event.type === "income" ? parseIncomeEventId(event.id) : null;
    const incomeSkip =
      incomeParts && incomeSkipByKey.has(`${incomeParts.incomeId}:${incomeParts.iso}`)
        ? incomeSkipByKey.get(`${incomeParts.incomeId}:${incomeParts.iso}`)!
        : undefined;
    const incomeCredit =
      event.type === "income" ? (incomeSkip ? 0 : roundCurrency(event.amount)) : 0;
    const billDebit =
      event.type === "bill" ? roundCurrency(cashflowBillAmountById.get(event.id) ?? 0) : 0;

    runningAvailableMoney =
      event.type === "income"
        ? roundCurrency(runningAvailableMoney + incomeCredit)
        : roundCurrency(runningAvailableMoney - billDebit);

    if (event.date >= startIso && event.date <= endIso) {
      out.push({
        ...event,
        projectedAvailableMoney: roundCurrency(runningAvailableMoney),
        ...(incomeSkip
          ? { isSkipped: true as const, skipId: incomeSkip.skipId }
          : {}),
      });
    }
  }

  return out;
}

/**
 * Returns the projected available money as of `target`.
 *
 * `events` must be sorted ascending by `date` (this is the shape emitted by
 * `buildProjectionTimeline`). The function walks until it passes `target`, then
 * returns the last event's `projectedAvailableMoney` (step function, inclusive
 * of `target`). Designed for gesture-frame lookups — O(n) worst case with an
 * early break as soon as we cross `target`.
 */
export function availableMoneyAt(
  target: Date | string,
  events: ProjectionEvent[],
  startingAvailableMoney: number,
): number {
  const targetIso =
    typeof target === "string" ? target : toIsoDate(startOfUtcDay(target));

  let last: ProjectionEvent | null = null;
  for (const event of events) {
    if (event.date <= targetIso) {
      last = event;
    } else {
      break;
    }
  }

  return last?.projectedAvailableMoney ?? startingAvailableMoney;
}

/** Pure integration-style helper for tests (no Prisma). */
export function buildTimelineForTest(input: {
  asOfIso: string;
  bankBalance: number;
  incomes: EngineIncome[];
  primaryIncomeId?: string;
  commitments: EngineCommitment[];
  goals: EngineGoal[];
  skips?: SkipInput[];
  horizonDays?: number;
}) {
  const asOf = new Date(`${input.asOfIso}T00:00:00Z`);
  const goalSkips = input.skips?.filter((s) => s.kind === "goal") ?? [];
  const goalsAdjusted = input.goals.map((goal) =>
    applyGoalSkipsToGoal(
      goal,
      goalSkips.filter((s) => s.kind === "goal" && s.goalId === goal.id),
      {
        payFrequency: input.incomes.find((i) => i.id === input.primaryIncomeId)?.frequency,
      },
    ),
  );

  const availableMoneyResult = calculateAvailableMoney({
    bankBalance: input.bankBalance,
    incomes: input.incomes,
    primaryIncomeId: input.primaryIncomeId,
    commitments: input.commitments,
    goals: goalsAdjusted,
    asOf,
  });

  const horizonDays = input.horizonDays ?? 42;

  return buildProjectionTimeline({
    availableMoney: availableMoneyResult.availableMoney,
    asOf,
    horizonDays,
    incomes: input.incomes,
    commitments: input.commitments,
    skips: input.skips,
  });
}

export function detectProjectedShortfall(events: ProjectionEvent[]) {
  return events.find((event) => event.projectedAvailableMoney < 0) ?? null;
}
