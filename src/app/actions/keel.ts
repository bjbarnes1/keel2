"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createCommitment,
  createIncome,
  createGoal,
  deleteCommitment,
  deleteIncome,
  setPrimaryIncome,
  updateBankBalance,
  updateCommitment,
} from "@/lib/persistence/keel-store";
import type { CommitmentCategory } from "@/lib/types";

function parseAmount(value: FormDataEntryValue | null) {
  return Number.parseFloat(String(value ?? "0"));
}

function parseCategory(value: FormDataEntryValue | null) {
  return (String(value ?? "Other") || "Other") as CommitmentCategory;
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
    nextDueDate: String(formData.get("nextDueDate") ?? ""),
    category: parseCategory(formData.get("category")),
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
    nextDueDate: String(formData.get("nextDueDate") ?? ""),
    category: parseCategory(formData.get("category")),
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
    nextPayDate: String(formData.get("nextPayDate") ?? ""),
    isPrimary: String(formData.get("isPrimary") ?? "") === "on",
  });

  revalidatePath("/");
  revalidatePath("/bills");
  revalidatePath("/goals");
  revalidatePath("/timeline");
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
  revalidatePath("/bills");
  revalidatePath("/goals");
  revalidatePath("/timeline");
  revalidatePath("/incomes");
  redirect("/incomes");
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
  revalidatePath("/incomes");
  redirect("/incomes");
}
