export type PayFrequency = "weekly" | "fortnightly" | "monthly";

export type CommitmentFrequency =
  | "weekly"
  | "fortnightly"
  | "monthly"
  | "quarterly"
  | "annual";

// Categories are budget-scoped and stored in the database.
export type CommitmentCategory = string;

export type ProjectionEventType = "income" | "bill";

export interface IncomeView {
  id: string;
  name: string;
  amount: number;
  frequency: PayFrequency;
  /** Display label (locale formatted) */
  nextPayDate: string;
  /** ISO date (YYYY-MM-DD) */
  nextPayDateIso?: string;
}

export interface CommitmentView {
  id: string;
  name: string;
  amount: number;
  frequency: CommitmentFrequency;
  /** Display label (locale formatted) */
  nextDueDate: string;
  /** ISO date (YYYY-MM-DD) */
  nextDueDateIso?: string;
  category: CommitmentCategory;
  subcategory?: string;
  reserved: number;
  perPay: number;
  percentFunded: number;
  fundedByIncomeId?: string;
  isAttention?: boolean;
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
  /** ISO date (YYYY-MM-DD) for sorting / layout */
  isoDate?: string;
  date: string;
  label: string;
  type: ProjectionEventType;
  amount: number;
  projectedAvailableMoney?: number;
  commitmentId?: string;
  isAttention?: boolean;
  /** Reserved amount toward this bill when `isAttention` is true */
  attentionReserved?: number;
  /** First pay-day income row in the projection window (whole-row safe tint) */
  isNextPayIncome?: boolean;
}

export type ForecastHorizon = {
  horizonDays: number;
  minProjectedAvailableMoney: number;
  endProjectedAvailableMoney: number;
  incomeEvents: number;
  billEvents: number;
  sparkline: number[];
};

export type DashboardSnapshot = {
  userName: string;
  budgetName: string;
  bankBalance: number;
  balanceAsOf: string;
  balanceAsOfIso: string;
  incomes: IncomeView[];
  primaryIncomeId: string;
  commitments: CommitmentView[];
  goals: GoalView[];
  annualIncomeForecast: number;
  annualCommitmentsForecast: number;
  annualSpendActualToDate: number;
  spendByCommitment: Array<{ commitmentId: string; name: string; last365Spend: number }>;
  totalReserved: number;
  totalGoalContributions: number;
  availableMoney: number;
  timeline: ProjectionEventView[];
  forecast: {
    oneMonth: ForecastHorizon;
    threeMonths: ForecastHorizon;
    twelveMonths: ForecastHorizon;
  };
  alert: string;
};
