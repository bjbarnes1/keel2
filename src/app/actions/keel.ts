"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createCommitment,
  createIncome,
  createBudgetInvite,
  createGoal,
  deleteCommitment,
  deleteIncome,
  acceptBudgetInvite,
  setPrimaryIncome,
  updateBankBalance,
  updateCommitment,
  updateIncomeFuture,
} from "@/lib/persistence/keel-store";
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
  revalidatePath("/timeline");
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
  revalidatePath("/bills");
  revalidatePath("/timeline");
  redirect("/bills");
}

export async function updateCommitmentAction(id: string, formData: FormData) {
  await updateCommitment(id, {
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
  revalidatePath("/bills");
  revalidatePath("/timeline");
  redirect("/bills");
}

export async function deleteCommitmentAction(id: string) {
  await deleteCommitment(id);
  revalidatePath("/");
  revalidatePath("/bills");
  revalidatePath("/timeline");
  redirect("/bills");
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
  revalidatePath("/bills");
  revalidatePath("/goals");
  revalidatePath("/timeline");
  revalidatePath("/settings/incomes");
  redirect("/settings/incomes");
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
  revalidatePath("/bills");
  revalidatePath("/goals");
  revalidatePath("/timeline");
  revalidatePath("/settings/incomes");
  redirect("/settings/incomes");
}

export async function setPrimaryIncomeAction(formData: FormData) {
  const incomeId = String(formData.get("incomeId") ?? "").trim();
  if (!incomeId) {
    throw new Error("Income id is required.");
  }

  await setPrimaryIncome(incomeId);
  revalidatePath("/");
  revalidatePath("/bills");
  revalidatePath("/goals");
  revalidatePath("/timeline");
  revalidatePath("/settings/incomes");
  redirect("/settings/incomes");
}

export async function deleteIncomeAction(formData: FormData) {
  const incomeId = String(formData.get("incomeId") ?? "").trim();
  if (!incomeId) {
    throw new Error("Income id is required.");
  }

  await deleteIncome(incomeId);
  revalidatePath("/");
  revalidatePath("/bills");
  revalidatePath("/goals");
  revalidatePath("/timeline");
  revalidatePath("/settings/incomes");
  redirect("/settings/incomes");
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
