"use server";

/**
 * Server Actions for spend CSV import, account creation, and reconciliation updates.
 *
 * Bridges `lib/spend/*` parsers with `lib/persistence/spend` writers. Mapping JSON
 * embedded in forms is trusted only after `prepareSpendCsvPreview` validation on the client.
 *
 * @module app/actions/keel-spend
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  commitSpendCsvImport,
  createSpendAccount,
  updateSpendTransactionClassification,
} from "@/lib/persistence/keel-store";
import type { SpendCsvMapping } from "@/lib/spend/csv";
import { prepareSpendCsvPreview } from "@/lib/spend/import";

function parseMapping(raw: string): SpendCsvMapping {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid column mapping JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid column mapping.");
  }

  return parsed as SpendCsvMapping;
}

function parseOptionalId(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

export async function prepareSpendCsvAction(csvText: string, mappingJson?: string | null) {
  const mapping = mappingJson ? parseMapping(mappingJson) : undefined;
  return prepareSpendCsvPreview(csvText, mapping);
}

export async function commitSpendCsvAction(formData: FormData) {
  const csvText = String(formData.get("csvText") ?? "");
  const accountId = String(formData.get("accountId") ?? "").trim();
  const mapping = parseMapping(String(formData.get("mapping") ?? "{}"));
  const filename = String(formData.get("filename") ?? "").trim() || undefined;

  if (!accountId) {
    throw new Error("Pick an account before importing.");
  }

  const result = await commitSpendCsvImport({
    accountId,
    csvText,
    mapping,
    filename,
  });

  revalidatePath("/spend");
  revalidatePath("/spend/reconcile");

  const params = new URLSearchParams();
  params.set("imported", String(result.inserted));
  params.set("skipped", String(result.skipped));
  if (result.issueCount > 0) {
    params.set("issues", String(result.issueCount));
  }

  redirect(`/spend?${params.toString()}`);
}

export async function createSpendAccountAction(formData: FormData) {
  await createSpendAccount({
    name: String(formData.get("name") ?? ""),
    bankName: String(formData.get("bankName") ?? "").trim() || undefined,
    bsb: String(formData.get("bsb") ?? "").trim() || undefined,
    accountName: String(formData.get("accountName") ?? "").trim() || undefined,
    accountNumber: String(formData.get("accountNumber") ?? "").trim() || undefined,
  });

  revalidatePath("/spend");
  revalidatePath("/spend/import");
  redirect("/spend/import");
}

export async function updateSpendTransactionAction(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "").trim();
  if (!transactionId) {
    throw new Error("Missing transaction.");
  }

  const categoryId = parseOptionalId(formData.get("categoryId"));
  if (!categoryId) {
    throw new Error("Pick a category before saving.");
  }

  await updateSpendTransactionClassification({
    transactionId,
    categoryId,
    subcategoryId: parseOptionalId(formData.get("subcategoryId")),
    commitmentId: parseOptionalId(formData.get("commitmentId")),
  });

  revalidatePath("/spend");
  revalidatePath("/spend/reconcile");
}
