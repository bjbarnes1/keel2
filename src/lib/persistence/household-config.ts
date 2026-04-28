/**
 * Typed accessors for `Budget.householdConfig` JSON (float targets, linked account hints).
 *
 * @module lib/persistence/household-config
 */

import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase } from "./config";

export type HouseholdConfigShape = {
  ubankFloatThreshold?: number;
  primaryUpSpendAccountId?: string;
};

export async function getHouseholdConfig(): Promise<HouseholdConfigShape> {
  noStore();
  if (!hasConfiguredDatabase()) return {};

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();
  const row = await prisma.budget.findUnique({
    where: { id: budget.id },
    select: { householdConfig: true },
  });
  const raw = row?.householdConfig;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as HouseholdConfigShape;
}

export async function updateHouseholdConfigPatch(patch: Partial<HouseholdConfigShape>) {
  if (!hasConfiguredDatabase()) throw new Error("Household config requires a database.");
  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const row = await prisma.budget.findUnique({
    where: { id: budget.id },
    select: { householdConfig: true },
  });
  const prev =
    row?.householdConfig && typeof row.householdConfig === "object" && !Array.isArray(row.householdConfig)
      ? (row.householdConfig as Record<string, unknown>)
      : {};

  const next = { ...prev, ...patch };
  await prisma.budget.update({
    where: { id: budget.id },
    data: { householdConfig: next },
  });
}
