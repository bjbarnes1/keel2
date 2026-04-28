/**
 * Domain and view-model types shared across the app.
 *
 * These are intentionally **not** Prisma-generated types: they describe the shapes
 * the UI and pure engine code consume after persistence mapping. Financial fields
 * are plain `number` (AUD, same currency throughout). Dates in views are split into:
 * - human `string` labels (`nextPayDate`) for display
 * - optional ISO `YYYY-MM-DD` fields (`nextPayDateIso`) for sorting / scheduling
 *
 * Projection rows (`ProjectionEventView`) carry both presentation flags (skip tinting,
 * attention state) and engine-aligned amounts; see `src/lib/engine/keel.ts` for how
 * balances are computed.
 *
 * @module lib/types
 */

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
  /** After active goal skips (simple projection). */
  projectedCompletionIso?: string;
}

export type CommitmentSkipStrategy = "MAKE_UP_NEXT" | "SPREAD" | "MOVE_ON" | "STANDALONE";
export type GoalSkipStrategy = "EXTEND_DATE" | "REBALANCE";

/** JSON-serializable; optional `skipId` when sourced from persisted rows. */
export type CommitmentSkipInput = {
  kind: "commitment";
  skipId?: string;
  commitmentId: string;
  originalDateIso: string;
  strategy: CommitmentSkipStrategy;
  spreadOverN?: number;
  /** MOVE_ON redirect, e.g. `goal:{goalId}` */
  redirectTo?: string;
};

export type GoalSkipInput = {
  kind: "goal";
  skipId?: string;
  goalId: string;
  originalDateIso: string;
  strategy: GoalSkipStrategy;
};

export type IncomeSkipStrategy = "STANDALONE";

/** Mirrors {@link CommitmentSkipInput} for pay events that do not occur (unpaid leave, etc.). */
export type IncomeSkipInput = {
  kind: "income";
  skipId?: string;
  incomeId: string;
  originalDateIso: string;
  strategy: IncomeSkipStrategy;
};

export type SkipInput = CommitmentSkipInput | GoalSkipInput | IncomeSkipInput;

export type OccurrenceOverrideKind = "income" | "commitment";

/**
 * Per-occurrence date override that preserves recurrence linkage.
 * The occurrence identity is `(kind, sourceId, originalDateIso)`;
 * only `scheduledDateIso` moves.
 */
export type OccurrenceDateOverrideInput = {
  overrideId?: string;
  kind: OccurrenceOverrideKind;
  sourceId: string;
  originalDateIso: string;
  scheduledDateIso: string;
  scenarioBatchId?: string;
};

/** Pure preview / Ask payload: deltas vs baseline projection. */
export type SkipPreview = {
  /** Bill event ids whose cashflow amount differs from baseline (includes removed as omitted from map) */
  billAmountByEventId: Record<string, number>;
  /** End-of-horizon projected available money under the hypothetical skip */
  endProjectedAvailableMoney: number;
  /** Delta vs baseline end balance */
  endAvailableMoneyDelta: number;
};

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
  /** Display-only: user skipped this occurrence; amount may still show for MOVE_ON */
  isSkipped?: boolean;
  skipId?: string;
  skipStrategy?: CommitmentSkipStrategy;
  /** Bill rows that received extra from MAKE_UP_NEXT / SPREAD */
  isSkipSpreadTarget?: boolean;
  /** When set, row amount shown in UI (baseline); balances use cashflow */
  displayAmount?: number;
  /** Stable identity for recurrence-linked edits (always original occurrence date). */
  sourceKind?: OccurrenceOverrideKind;
  sourceId?: string;
  originalDateIso?: string;
  /** Present when this occurrence is currently date-overridden. */
  scheduledDateIso?: string;
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
  /** Active commitment skips (for waterline / deep links). */
  commitmentSkipsActive: Array<{ commitmentId: string; originalDateIso: string }>;
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
