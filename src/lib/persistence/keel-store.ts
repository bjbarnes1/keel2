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
  listActiveIncomeSkipsForIncome,
  type ActiveSkipsBundle,
} from "./skips";
export {
  getActiveOccurrenceOverridesForBudget,
  listActiveOccurrenceOverridesForCurrentBudget,
  upsertOccurrenceOverrideBatch,
  revokeOccurrenceOverridesById,
} from "./occurrence-overrides";
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
  getCommitmentsForEditBatch,
  createCommitment,
  updateCommitment,
  updateCommitmentFuture,
  deleteCommitment,
  listArchivedCommitmentsForBrowse,
  restoreCommitment,
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
export { getMonthlyBudgetTree, type BudgetCategoryNode, type BudgetCommitmentLine } from "./budget-view";
export {
  getRecentSpendForCommitment,
  getSpendOverview,
  createSpendAccount,
  commitSpendCsvImport,
  getBudgetCommitmentsForTagging,
  getSpendReconciliationQueue,
  updateSpendTransactionClassification,
  linkSpendAccountToUp,
  type SpendAccountView,
  type SpendTransactionListItem,
} from "./spend";
export {
  listSpendCategorisationRules,
  createSpendCategorisationRule,
  deleteSpendCategorisationRule,
} from "./spend-rules";
export {
  listMedicalSubItems,
  createMedicalSubItem,
  deleteMedicalSubItem,
  listOutstandingRebates,
  setTransactionRebateExpectation,
  recordRebatePartialMatch,
  type MedicalSubItemView,
  type RebateQueueRow,
} from "./medical";
export { getHouseholdConfig, updateHouseholdConfigPatch, type HouseholdConfigShape } from "./household-config";
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
export { getLatestAiInsight, type StoredAiInsight } from "./ai-insight";
