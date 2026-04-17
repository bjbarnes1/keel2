"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createWealthHolding } from "@/lib/persistence/keel-store";

function parseAmount(value: FormDataEntryValue | null) {
  return Number.parseFloat(String(value ?? "0"));
}

function parseOptionalAmount(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalIsoDate(value: FormDataEntryValue | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("As of must be a valid date (YYYY-MM-DD).");
  }
  return trimmed;
}

export async function createWealthHoldingAction(formData: FormData) {
  await createWealthHolding({
    assetType: String(formData.get("assetType") ?? "OTHER"),
    symbol: String(formData.get("symbol") ?? "").trim() || undefined,
    name: String(formData.get("name") ?? "").trim(),
    quantity: parseAmount(formData.get("quantity")),
    unitPrice: parseOptionalAmount(formData.get("unitPrice")),
    valueOverride: parseOptionalAmount(formData.get("valueOverride")),
    asOf: parseOptionalIsoDate(formData.get("asOf")),
  });

  revalidatePath("/wealth");
  redirect("/wealth");
}

