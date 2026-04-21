/**
 * Facade re-export barrel for the persistence layer.
 *
 * Historically a single large module; split into `auth`, `budget`, `commitments`, etc.
 * Import from here in application code to keep call sites stable (`@/lib/persistence/keel-store`).
 *
 * **Guidance:** add new exports when a function is part of the “public persistence API”
 * consumed by Server Actions or route handlers; keep test-only helpers file-local.
 *
 * @module lib/persistence/keel-store
 */

export { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
export { getBudgetContext } from "./auth";
export {
  getActiveSkipsForBudget,
  getSkipHistoryForCommitment,
  getSkipHistoryForGoal,
  type ActiveSkipsBundle,
} from "./skips";
export {
  getCategoryOptions,
  createCategory,
  createSubcategory,
  deleteCategory,
  deleteSubcategory,
} from "./categories";
export {
  getIncomeSnapshot,
  createIncome,
  getIncomeForEdit,
  updateIncomeFuture,
  setPrimaryIncome,
  archiveIncome,
} from "./income";
export {
  getCommitmentForEdit,
  createCommitment,
  updateCommitment,
  updateCommitmentFuture,
  deleteCommitment,
} from "./commitments";
export { getGoalForEdit, createGoal } from "./goals";
export {
  getWealthSnapshot,
  getWealthHistory,
  createWealthHolding,
  updateWealthHolding,
  deleteWealthHolding,
} from "./wealth";
export {
  updateBankBalance,
  getBudgetMembers,
  createBudgetInvite,
  acceptBudgetInvite,
} from "./budget";
export {
  getRecentSpendForCommitment,
  getSpendOverview,
  createSpendAccount,
  commitSpendCsvImport,
  getBudgetCommitmentsForTagging,
  getSpendReconciliationQueue,
  updateSpendTransactionClassification,
  type SpendAccountView,
  type SpendTransactionListItem,
} from "./spend";
export {
  getActualVsPlannedReport,
  type ActualVsPlannedRow,
  type ActualVsPlannedReport,
} from "./reports";
export {
  getDashboardSnapshot,
  getCommitmentSkipPreviewBundle,
  getProjectionEngineInput,
  buildProjectionChunkFromState,
} from "./dashboard";
