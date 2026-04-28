"use server";

/**
 * AI Capture Server Actions: validate LLM output, map categories, create domain rows.
 *
 * Gated by `KEEL_AI_ENABLED` and per-user `assertWithinAiRateLimit`. Uses Supabase
 * directly for auth (not `getBudgetContext`) to keep error messages aligned with the
 * capture UI, then calls persistence creators.
 *
 * @module app/actions/capture
 */

import { revalidatePath } from "next/cache";

import { invalidateLayerACache } from "@/lib/ai/context/generators/build-layer-a";
import { commitmentCaptureSchema, incomeCaptureSchema, assetCaptureSchema } from "@/lib/ai/parse-capture";
import { assertWithinAiRateLimit } from "@/lib/ai/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCommitment, createIncome, createWealthHolding, getCategoryOptions } from "@/lib/persistence/keel-store";
import { getBudgetContext } from "@/lib/persistence/auth";
import { getPrismaClient } from "@/lib/prisma";

async function requireAuthedUserId() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw new Error(error.message);
  }
  if (!data.user) {
    throw new Error("Not authenticated.");
  }
  return data.user.id;
}

function assertAiEnabledOrThrow() {
  if (process.env.KEEL_AI_ENABLED !== "true") {
    throw new Error("AI_CAPTURE_DISABLED");
  }
}

function defaultIsoDate(daysFromToday: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

async function resolveCategoryId(categoryName: string) {
  const trimmed = categoryName.trim() || "Other";
  const options = await getCategoryOptions();

  const existing =
    options.find((c) => c.name.toLowerCase() === trimmed.toLowerCase()) ??
    options.find((c) => c.name.toLowerCase() === "other") ??
    options[0];

  if (existing) return existing.id;

  // AI suggested a category the budget doesn't have yet — create it on the fly.
  const { budget } = await getBudgetContext();
  const prisma = getPrismaClient();
  const row = await prisma.category.create({
    data: { budgetId: budget.id, name: trimmed, sortOrder: 0 },
    select: { id: true },
  });
  return row.id;
}

export async function createCommitmentFromCapture(input: unknown) {
  assertAiEnabledOrThrow();
  const userId = await requireAuthedUserId();
  await assertWithinAiRateLimit({ userId, limit: 20, windowMs: 60 * 60 * 1000 });

  const payload = commitmentCaptureSchema.parse(input);
  const categoryId = await resolveCategoryId(payload.category);
  const nextDueDate = payload.nextDueDate ?? defaultIsoDate(14);

  await createCommitment({
    name: payload.name,
    amount: payload.amount,
    frequency: payload.frequency,
    nextDueDate,
    categoryId,
  });

  revalidatePath("/cashflow");
  revalidatePath("/");
  revalidatePath("/commitments");
  invalidateLayerACache(userId);
}

export async function createIncomeFromCapture(input: unknown) {
  assertAiEnabledOrThrow();
  const userId = await requireAuthedUserId();
  await assertWithinAiRateLimit({ userId, limit: 20, windowMs: 60 * 60 * 1000 });

  const payload = incomeCaptureSchema.parse(input);
  const nextPayDate = payload.nextPayDate ?? defaultIsoDate(14);

  await createIncome({
    name: payload.name,
    amount: payload.amount,
    frequency: payload.frequency,
    nextPayDate,
    isPrimary: payload.isPrimary,
  });

  revalidatePath("/cashflow");
  revalidatePath("/");
  revalidatePath("/incomes");
  invalidateLayerACache(userId);
}

export async function createAssetFromCapture(input: unknown) {
  assertAiEnabledOrThrow();
  const userId = await requireAuthedUserId();
  await assertWithinAiRateLimit({ userId, limit: 20, windowMs: 60 * 60 * 1000 });

  const payload = assetCaptureSchema.parse(input);

  await createWealthHolding({
    assetType: payload.assetType,
    symbol: payload.symbol ?? undefined,
    name: payload.name,
    quantity: payload.quantity,
    unitPrice: payload.unitPrice ?? undefined,
    valueOverride: payload.valueOverride ?? undefined,
    asOf: payload.asOf ?? undefined,
  });

  revalidatePath("/cashflow");
  revalidatePath("/");
  revalidatePath("/wealth");
  invalidateLayerACache(userId);
}
