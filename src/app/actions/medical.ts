"use server";

/**
 * Server Actions for medical sub-items and rebate matching.
 *
 * @module app/actions/medical
 */

import { revalidatePath } from "next/cache";

import {
  createMedicalSubItem,
  deleteMedicalSubItem,
  recordRebatePartialMatch,
  setTransactionRebateExpectation,
} from "@/lib/persistence/keel-store";

export async function createMedicalSubItemAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const expectedRaw = String(formData.get("expectedTotal") ?? "").trim();
  const expectedTotal = expectedRaw ? Number.parseFloat(expectedRaw) : null;
  await createMedicalSubItem({
    name,
    expectedTotal: expectedTotal != null && Number.isFinite(expectedTotal) ? expectedTotal : null,
  });
  revalidatePath("/medical");
  revalidatePath("/");
}

export async function deleteMedicalSubItemAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Item id required.");
  await deleteMedicalSubItem(id);
  revalidatePath("/medical");
  revalidatePath("/");
}

export async function setRebateExpectationAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const raw = String(formData.get("expectedAmount") ?? "").trim();
  if (!transactionId) throw new Error("Transaction id required.");
  const expectedAmount = raw ? Number.parseFloat(raw) : null;
  await setTransactionRebateExpectation({
    transactionId,
    expectedAmount: expectedAmount != null && Number.isFinite(expectedAmount) ? expectedAmount : null,
  });
  revalidatePath("/medical");
  revalidatePath("/");
}

export async function recordRebateMatchAction(formData: FormData) {
  const expenseTransactionId = String(formData.get("expenseTransactionId") ?? "").trim();
  const creditTransactionId = String(formData.get("creditTransactionId") ?? "").trim();
  const amount = Number.parseFloat(String(formData.get("amount") ?? "0"));
  const notes = String(formData.get("notes") ?? "").trim();
  if (!expenseTransactionId || !creditTransactionId) throw new Error("Both transactions required.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be a positive number.");
  await recordRebatePartialMatch({
    expenseTransactionId,
    creditTransactionId,
    amount,
    notes: notes || undefined,
  });
  revalidatePath("/medical");
  revalidatePath("/");
}
