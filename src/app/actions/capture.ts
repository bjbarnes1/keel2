"use server";

import { revalidatePath } from "next/cache";

import { commitmentCaptureSchema, incomeCaptureSchema, assetCaptureSchema } from "@/lib/ai/parse-capture";
import { assertWithinAiRateLimit } from "@/lib/ai/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createCommitment, createIncome, createWealthHolding, getCategoryOptions } from "@/lib/persistence/keel-store";

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
  const options = await getCategoryOptions();
  const match =
    options.find((c) => c.name.toLowerCase() === categoryName.trim().toLowerCase()) ??
    options.find((c) => c.name.toLowerCase() === "other");

  if (!match) {
    throw new Error("Unable to resolve category.");
  }

  return match.id;
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

  revalidatePath("/timeline");
  revalidatePath("/");
  revalidatePath("/commitments");
  revalidatePath("/bills");
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

  revalidatePath("/timeline");
  revalidatePath("/");
  revalidatePath("/settings/incomes");
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

  revalidatePath("/timeline");
  revalidatePath("/");
  revalidatePath("/settings/wealth");
  revalidatePath("/wealth");
}
