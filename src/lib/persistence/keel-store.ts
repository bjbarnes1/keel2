// Barrel re-exports for domain modules.
// The original ~2,500-line file was split into focused persistence modules;
// this file preserves the public API so callers don't need to change imports.

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
  deleteIncome,
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
} from "./dashboard";
