import {
  buildProjectionTimeline,
  calculateAvailableMoney,
  detectProjectedShortfall,
} from "@/lib/engine/keel";
import type { CommitmentView, GoalView, IncomeView } from "@/lib/types";

const asOf = new Date("2026-04-18T00:00:00Z");

const rawIncome = {
  id: "income-salary",
  name: "Salary",
  amount: 4200,
  frequency: "fortnightly" as const,
  nextPayDate: "2026-04-24",
};
const rawIncomes = [rawIncome];

const rawCommitments = [
  {
    id: "mortgage",
    name: "Mortgage",
    amount: 2400,
    frequency: "monthly" as const,
    nextDueDate: "2026-05-01",
    category: "Housing",
  },
  {
    id: "car-insurance",
    name: "Car Insurance",
    amount: 480,
    frequency: "quarterly" as const,
    nextDueDate: "2026-06-15",
    category: "Insurance",
  },
  {
    id: "electricity",
    name: "Electricity",
    amount: 320,
    frequency: "quarterly" as const,
    nextDueDate: "2026-05-20",
    category: "Utilities",
  },
  {
    id: "internet",
    name: "Internet",
    amount: 89,
    frequency: "monthly" as const,
    nextDueDate: "2026-04-28",
    category: "Utilities",
  },
  {
    id: "netflix",
    name: "Netflix",
    amount: 22.99,
    frequency: "monthly" as const,
    nextDueDate: "2026-04-19",
    category: "Subscriptions",
  },
  {
    id: "school-fees",
    name: "School Fees",
    amount: 4500,
    frequency: "quarterly" as const,
    nextDueDate: "2026-07-01",
    category: "Education",
  },
];

const rawGoals = [
  {
    id: "emergency-fund",
    name: "Emergency Fund",
    contributionPerPay: 200,
    currentBalance: 6400,
    targetAmount: 10000,
  },
  {
    id: "holiday",
    name: "Holiday",
    contributionPerPay: 150,
    currentBalance: 1200,
    targetAmount: 3000,
    targetDate: "Dec 2026",
  },
  {
    id: "car-service",
    name: "Car Service",
    contributionPerPay: 50,
    currentBalance: 350,
    targetAmount: 800,
  },
];

export const mockBankBalance = 8696;
export const mockBalanceAsOf = "Apr 7, 2026";

function formatShortDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

const availableMoneyResult = calculateAvailableMoney({
  bankBalance: mockBankBalance,
  incomes: rawIncomes,
  primaryIncomeId: rawIncome.id,
  commitments: rawCommitments,
  goals: rawGoals,
  asOf,
});

export const mockIncome: IncomeView = {
  ...rawIncome,
  nextPayDate: formatShortDate(rawIncome.nextPayDate),
};

export const mockCommitments: CommitmentView[] = availableMoneyResult.commitmentReserves.map(
  (commitment) => ({
    ...commitment,
    nextDueDate: formatShortDate(commitment.nextDueDate),
    category: (commitment.category ?? "Other") as CommitmentView["category"],
  }),
);

export const mockGoals: GoalView[] = rawGoals;

export const totalReserved = availableMoneyResult.totalReserved;
export const totalGoalContributions = availableMoneyResult.totalGoalContributions;
export const mockAvailableMoney = availableMoneyResult.availableMoney;

export const mockTimeline = buildProjectionTimeline({
  availableMoney: mockAvailableMoney,
  asOf,
  horizonDays: 60,
  incomes: rawIncomes,
  commitments: rawCommitments,
}).map((event) => ({
  ...event,
  date: formatShortDate(event.date),
}));

const shortfall = detectProjectedShortfall(
  buildProjectionTimeline({
    availableMoney: mockAvailableMoney,
    asOf,
    horizonDays: 60,
    incomes: rawIncomes,
    commitments: rawCommitments,
  }),
);

export const mockAlert = shortfall
  ? `Your available money is projected to go negative around ${formatShortDate(
      shortfall.date,
    )} when ${shortfall.label} hits.`
  : "Your available money stays positive across the next 60 days.";

export function getCommitmentById(id: string) {
  return mockCommitments.find((commitment) => commitment.id === id);
}
