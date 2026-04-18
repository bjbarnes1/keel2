import type { CommitmentFrequency, PayFrequency } from "@/lib/types";

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

export interface ProjectionEvent {
  id: string;
  date: string;
  label: string;
  amount: number;
  type: "income" | "bill";
  projectedAvailableMoney: number;
}

export interface PayPeriodWindow {
  start: Date;
  end: Date;
  dayIndex: number;
  totalDays: number;
}

function roundCurrency(value: number) {
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

export function buildProjectionTimeline(input: {
  availableMoney: number;
  asOf: Date;
  horizonDays: number;
  incomes: EngineIncome[];
  commitments: EngineCommitment[];
}) {
  const horizonEnd = new Date(input.asOf);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + input.horizonDays);

  const scheduledEvents: Array<{
    id: string;
    date: string;
    label: string;
    amount: number;
    type: "income" | "bill";
  }> = [];

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

  let runningAvailableMoney = input.availableMoney;

  return scheduledEvents.map((event) => {
    runningAvailableMoney =
      event.type === "income"
        ? runningAvailableMoney + event.amount
        : runningAvailableMoney - event.amount;

    return {
      ...event,
      projectedAvailableMoney: roundCurrency(runningAvailableMoney),
    } satisfies ProjectionEvent;
  });
}

export function detectProjectedShortfall(events: ProjectionEvent[]) {
  return events.find((event) => event.projectedAvailableMoney < 0) ?? null;
}
