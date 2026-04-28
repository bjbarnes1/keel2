"use server";

/**
 * Server Actions for merchant memo categorisation rules.
 *
 * @module app/actions/spend-rules
 */

import { revalidatePath } from "next/cache";

import {
  createSpendCategorisationRule,
  deleteSpendCategorisationRule,
} from "@/lib/persistence/keel-store";

export async function createSpendRuleAction(formData: FormData) {
  const pattern = String(formData.get("pattern") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const priority = Number.parseInt(String(formData.get("priority") ?? "0"), 10);
  if (!pattern.trim()) throw new Error("Pattern is required.");
  if (!categoryId) throw new Error("Category is required.");
  await createSpendCategorisationRule({
    pattern,
    categoryId,
    priority: Number.isFinite(priority) ? priority : 0,
  });
  revalidatePath("/spend/rules");
  revalidatePath("/spend");
}

export async function deleteSpendRuleAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Rule id required.");
  await deleteSpendCategorisationRule(id);
  revalidatePath("/spend/rules");
  revalidatePath("/spend");
}
