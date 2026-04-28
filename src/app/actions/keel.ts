"use server";

/**
 * Server Actions for household money operations (commitments, incomes, goals,
 * categories, bank balance) plus read-only projection chunk loading.
 *
 * **Auth & tenancy:** every mutator ultimately calls into `src/lib/persistence/*`,
 * which uses `getBudgetContext()` to ensure the Supabase user owns (or is a member of)
 * the active budget. Errors surface as thrown `Error` strings consumed by forms.
 *
 * **Cache:** mutating actions call `revalidatePath` for affected routes; some
 * actions end in `redirect()` for PRG-style navigation after POST.
 *
 * **Next.js constraint:** this file must only export async functions — shared Zod
 * schemas for chunk loading live in `src/lib/engine/projection-chunk-schema.ts`.
 *
 * @module app/actions/keel
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ProjectionEvent } from "@/lib/engine/keel";
import {
  loadProjectionChunkInputSchema,
  type LoadProjectionChunkInput,
} from "@/lib/engine/projection-chunk-schema";
import type { CommitmentEditValues, IncomeEditValues } from "@/lib/schemas/record-edit-schemas";
import {
  buildProjectionChunkFromState,
  createCommitment,
  createIncome,
  createBudgetInvite,
  createCategory,
  createSubcategory,
  createGoal,
  deleteCommitment,
  deleteCategory,
  archiveIncome,
  deleteSubcategory,
  acceptBudgetInvite,
  getProjectionEngineInput,
  setPrimaryIncome,
  updateBankBalance,
  updateCommitmentFuture,
  updateIncomeFuture,
  restoreCommitment,
} from "@/lib/persistence/keel-store";

/** Parses numeric FormData fields; missing values become 0 (caller validates range). */
function parseAmount(value: FormDataEntryValue | null) {
  return Number.parseFloat(String(value ?? "0"));
}

function parseId(value: FormDataEntryValue | null, label: string) {
  const parsed = String(value ?? "").trim();
  if (!parsed) {
    throw new Error(`${label} is required.`);
  }
  return parsed;
}

function parseOptionalId(value: FormDataEntryValue | null) {
  const parsed = String(value ?? "").trim();
  return parsed || undefined;
}

function parseIsoDate(value: FormDataEntryValue | null, label: string) {
  const parsed = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    throw new Error(`${label} must be a valid date (YYYY-MM-DD).`);
  }
  return parsed;
}

export async function updateBankBalanceAction(formData: FormData) {
  const amount = parseAmount(formData.get("amount"));
  await updateBankBalance(amount);
  revalidatePath("/");
  revalidatePath("/cashflow");
  redirect("/");
}

export async function createCommitmentAction(formData: FormData) {
  await createCommitment({
    name: String(formData.get("name") ?? ""),
    amount: parseAmount(formData.get("amount")),
    frequency: String(formData.get("frequency") ?? "monthly") as
      | "weekly"
      | "fortnightly"
      | "monthly"
      | "quarterly"
      | "annual",
    nextDueDate: parseIsoDate(formData.get("nextDueDate"), "Next due date"),
    categoryId: parseId(formData.get("categoryId"), "Category"),
    subcategoryId: parseOptionalId(formData.get("subcategoryId")),
    fundedByIncomeId: String(formData.get("fundedByIncomeId") ?? "").trim() || undefined,
  });

  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/cashflow");
  redirect("/commitments");
}

export async function updateCommitmentAction(id: string, formData: FormData) {
  const effectiveFromRaw = String(formData.get("effectiveFrom") ?? "").trim();
  const effectiveFrom = effectiveFromRaw || new Date().toISOString().slice(0, 10);

  await updateCommitmentFuture(id, {
    effectiveFrom: parseIsoDate(effectiveFrom, "Effective from"),
    name: String(formData.get("name") ?? ""),
    amount: parseAmount(formData.get("amount")),
    frequency: String(formData.get("frequency") ?? "monthly") as
      | "weekly"
      | "fortnightly"
      | "monthly"
      | "quarterly"
      | "annual",
    nextDueDate: parseIsoDate(formData.get("nextDueDate"), "Next due date"),
    categoryId: parseId(formData.get("categoryId"), "Category"),
    subcategoryId: parseOptionalId(formData.get("subcategoryId")),
    fundedByIncomeId: String(formData.get("fundedByIncomeId") ?? "").trim() || undefined,
  });

  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/cashflow");
}

export async function archiveCommitmentAction(id: string) {
  await deleteCommitment(id);
  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/cashflow");
}

export async function restoreCommitmentAction(id: string) {
  await restoreCommitment(id);
  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/cashflow");
}

/** Sheet-friendly income save: persists a versioned row and revalidates without redirecting. */
export async function saveIncomeEditFromSheet(input: {
  incomeId: string;
  data: IncomeEditValues;
  appliesFromIso: string;
}) {
  await updateIncomeFuture({
    incomeId: input.incomeId,
    name: input.data.name,
    amount: input.data.amount,
    frequency: input.data.frequency,
    nextPayDate: input.data.nextPayDate,
    effectiveFrom: input.appliesFromIso,
  });
  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/goals");
  revalidatePath("/cashflow");
  revalidatePath("/incomes");
}

/** Sheet-friendly commitment save: persists a versioned row and revalidates without redirecting. */
export async function saveCommitmentEditFromSheet(input: {
  commitmentId: string;
  data: CommitmentEditValues;
  appliesFromIso: string;
}) {
  await updateCommitmentFuture(input.commitmentId, {
    effectiveFrom: input.appliesFromIso,
    name: input.data.name,
    amount: input.data.amount,
    frequency: input.data.frequency,
    nextDueDate: input.data.nextDueDate,
    categoryId: input.data.categoryId,
    subcategoryId: input.data.subcategoryId,
    fundedByIncomeId: input.data.fundedByIncomeId,
  });
  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/cashflow");
}

export async function deleteCommitmentAction(id: string) {
  await archiveCommitmentAction(id);
  redirect("/commitments");
}

export async function createGoalAction(formData: FormData) {
  const targetAmount = String(formData.get("targetAmount") ?? "").trim();
  const targetDate = String(formData.get("targetDate") ?? "").trim();

  await createGoal({
    name: String(formData.get("name") ?? ""),
    contributionPerPay: parseAmount(formData.get("contributionPerPay")),
    currentBalance: 0,
    targetAmount: targetAmount ? Number.parseFloat(targetAmount) : undefined,
    targetDate: targetDate || undefined,
    fundedByIncomeId: String(formData.get("fundedByIncomeId") ?? "").trim() || undefined,
  });

  revalidatePath("/");
  revalidatePath("/goals");
  redirect("/goals");
}

export async function createIncomeAction(formData: FormData) {
  await createIncome({
    name: String(formData.get("name") ?? ""),
    amount: parseAmount(formData.get("amount")),
    frequency: String(formData.get("frequency") ?? "fortnightly") as
      | "weekly"
      | "fortnightly"
      | "monthly",
    nextPayDate: parseIsoDate(formData.get("nextPayDate"), "Next pay date"),
    isPrimary: String(formData.get("isPrimary") ?? "") === "on",
  });

  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/goals");
  revalidatePath("/cashflow");
  revalidatePath("/incomes");
  redirect("/incomes");
}

export async function updateIncomeFutureAction(formData: FormData) {
  const incomeId = parseId(formData.get("incomeId"), "Income");
  await updateIncomeFuture({
    incomeId,
    name: String(formData.get("name") ?? ""),
    amount: parseAmount(formData.get("amount")),
    frequency: String(formData.get("frequency") ?? "fortnightly") as
      | "weekly"
      | "fortnightly"
      | "monthly",
    nextPayDate: parseIsoDate(formData.get("nextPayDate"), "Next pay date"),
    effectiveFrom: parseIsoDate(formData.get("effectiveFrom"), "Effective from"),
  });

  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/goals");
  revalidatePath("/cashflow");
  revalidatePath("/incomes");
  redirect("/incomes");
}

export async function setPrimaryIncomeAction(formData: FormData) {
  const incomeId = String(formData.get("incomeId") ?? "").trim();
  if (!incomeId) {
    throw new Error("Income id is required.");
  }

  await setPrimaryIncome(incomeId);
  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/goals");
  revalidatePath("/cashflow");
  revalidatePath("/incomes");
  redirect("/incomes");
}

export async function archiveIncomeAction(formData: FormData) {
  const incomeId = String(formData.get("incomeId") ?? "").trim();
  if (!incomeId) {
    throw new Error("Income id is required.");
  }

  await archiveIncome(incomeId);
  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/goals");
  revalidatePath("/cashflow");
  revalidatePath("/incomes");
  redirect("/incomes");
}

export async function createBudgetInviteAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const token = await createBudgetInvite(email);
  revalidatePath("/settings/household");
  redirect(`/settings/household?invite=${encodeURIComponent(token)}`);
}

export async function acceptBudgetInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    throw new Error("Invite token is required.");
  }

  await acceptBudgetInvite(token);
  revalidatePath("/");
  revalidatePath("/settings/household");
  redirect("/");
}

export async function createCategoryAction(formData: FormData) {
  await createCategory({
    name: String(formData.get("name") ?? ""),
  });
  revalidatePath("/settings/categories");
  revalidatePath("/commitments");
  revalidatePath("/spend/reconcile");
  redirect("/settings/categories");
}

export async function createSubcategoryAction(formData: FormData) {
  await createSubcategory({
    categoryId: parseId(formData.get("categoryId"), "Category"),
    name: String(formData.get("name") ?? ""),
  });
  revalidatePath("/settings/categories");
  revalidatePath("/commitments");
  revalidatePath("/spend/reconcile");
  redirect("/settings/categories");
}

export async function deleteCategoryAction(formData: FormData) {
  const categoryId = parseId(formData.get("categoryId"), "Category");
  await deleteCategory(categoryId);
  revalidatePath("/settings/categories");
  redirect("/settings/categories");
}

export async function deleteSubcategoryAction(formData: FormData) {
  const subcategoryId = parseId(formData.get("subcategoryId"), "Subcategory");
  await deleteSubcategory(subcategoryId);
  revalidatePath("/settings/categories");
  redirect("/settings/categories");
}

// --- Projection chunk loader -------------------------------------------------

/**
 * Loads a window of projection events for on-demand timeline chunks.
 *
 * Reads the current budget's engine inputs (incomes, commitments, goals, active skips),
 * computes the available-money floor at `asOf`, then builds a projection for
 * [startDateIso, startDateIso + horizonDays]. Running balances on the returned events
 * already reflect every event between `asOf` and `startDateIso`.
 *
 * Authentication: inherits from `getProjectionEngineInput` -> `readState`, which throws if
 * no authed user (DB mode) or falls back to the demo store (non-DB mode). Never
 * silently returns empty arrays on failure.
 */
export async function loadProjectionChunk(
  input: LoadProjectionChunkInput,
): Promise<ProjectionEvent[]> {
  const payload = loadProjectionChunkInputSchema.parse(input);
  const { state, activeSkips, occurrenceOverrides } = await getProjectionEngineInput();

  return buildProjectionChunkFromState({
    state,
    activeSkips,
    occurrenceOverrides,
    startDateIso: payload.startDateIso,
    horizonDays: payload.horizonDays,
  });
}
