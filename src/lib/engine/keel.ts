import type { CommitmentFrequency, PayFrequency } from "@/lib/types";

export interface EngineIncome {
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
  category?: string;
}

export interface EngineGoal {
  id: string;
  name: string;
  contributionPerPay: number;
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

function subtractCycle(date: Date, frequency: CommitmentFrequency) {
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

export function calculateCommitmentReserve(
  commitment: EngineCommitment,
  income: EngineIncome,
  asOf: Date,
): CommitmentReserve {
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
    category: commitment.category,
  };
}

export function calculateAvailableMoney(input: {
  bankBalance: number;
  income: EngineIncome;
  commitments: EngineCommitment[];
  goals: EngineGoal[];
  asOf: Date;
}): AvailableMoneyResult {
  const commitmentReserves = input.commitments.map((commitment) =>
    calculateCommitmentReserve(commitment, input.income, input.asOf),
  );

  const totalReserved = roundCurrency(
    commitmentReserves.reduce((sum, commitment) => sum + commitment.reserved, 0),
  );
  const totalGoalContributions = roundCurrency(
    input.goals.reduce((sum, goal) => sum + goal.contributionPerPay, 0),
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
  income: EngineIncome;
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

  let incomeDate = parseDate(input.income.nextPayDate);
  while (incomeDate <= horizonEnd) {
    if (incomeDate >= input.asOf) {
      scheduledEvents.push({
        id: `income-${toIsoDate(incomeDate)}`,
        date: toIsoDate(incomeDate),
        label: input.income.name,
        amount: input.income.amount,
        type: "income",
      });
    }
    incomeDate = addCycle(incomeDate, input.income.frequency);
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

  scheduledEvents.sort((left, right) => left.date.localeCompare(right.date));

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
