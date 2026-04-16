export type PayFrequency = "weekly" | "fortnightly" | "monthly";

export type CommitmentFrequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "annual";

export type CommitmentCategory =
  | "Housing"
  | "Insurance"
  | "Utilities"
  | "Subscriptions"
  | "Transport"
  | "Education"
  | "Health"
  | "Other";

export type ProjectionEventType = "income" | "bill";

export interface IncomeView {
  id: string;
  name: string;
  amount: number;
  frequency: PayFrequency;
  nextPayDate: string;
}

export interface CommitmentView {
  id: string;
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  nextDueDate: string;
  category: CommitmentCategory;
  reserved: number;
  perPay: number;
  percentFunded: number;
  fundedByIncomeId?: string;
}

export interface GoalView {
  id: string;
  name: string;
  contributionPerPay: number;
  currentBalance: number;
  targetAmount?: number;
  targetDate?: string;
  fundedByIncomeId?: string;
}

export interface ProjectionEventView {
  id: string;
  date: string;
  label: string;
  type: ProjectionEventType;
  amount: number;
  projectedAvailableMoney?: number;
}
