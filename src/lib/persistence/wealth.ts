import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";
import { toIsoDate } from "@/lib/utils";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase } from "./config";

type WealthHoldingView = {
  id: string;
  name: string;
  symbol?: string;
  quantity: string;
  value: number;
  asOf?: string;
};

// Fix #11: single formula used by getWealthSnapshot and getWealthTotalValueForBudget.
function holdingValue(h: {
  quantity: unknown;
  unitPrice: unknown;
  valueOverride: unknown;
}): number {
  const qty = Number(h.quantity);
  const unit = h.unitPrice ? Number(h.unitPrice) : undefined;
  const override = h.valueOverride ? Number(h.valueOverride) : undefined;
  return override ?? (unit != null ? qty * unit : 0);
}

export async function getWealthSnapshot() {
  noStore();

  if (!hasConfiguredDatabase()) {
    return { totalValue: 0, holdings: [] as WealthHoldingView[] };
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const holdings = await prisma.wealthHolding.findMany({
    where: { budgetId: budget.id },
    orderBy: { updatedAt: "desc" },
  });

  const mapped: WealthHoldingView[] = holdings.map((holding) => ({
    id: holding.id,
    name: holding.name,
    symbol: holding.symbol ?? undefined,
    quantity: String(Number(holding.quantity)),
    value: holdingValue(holding),
    asOf: holding.asOf ? holding.asOf.toISOString().slice(0, 10) : undefined,
  }));

  return {
    totalValue: mapped.reduce((sum, h) => sum + h.value, 0),
    holdings: mapped,
  };
}

async function getWealthTotalValueForBudget(budgetId: string) {
  const prisma = getPrismaClient();
  const holdings = await prisma.wealthHolding.findMany({
    where: { budgetId },
    select: { quantity: true, unitPrice: true, valueOverride: true },
  });
  return holdings.reduce((sum, h) => sum + holdingValue(h), 0);
}

export async function getWealthHistory(input?: { years?: number }) {
  noStore();

  const years = input?.years ?? 3;

  if (!hasConfiguredDatabase()) {
    return { values: [] as number[] };
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - years);
  start.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.wealthSnapshot.findMany({
    where: { budgetId: budget.id, recordedAt: { gte: start } },
    orderBy: { recordedAt: "asc" },
    select: { recordedAt: true, totalValue: true },
  });

  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const key = row.recordedAt.toISOString().slice(0, 7);
    byMonth.set(key, Number(row.totalValue));
  }

  const values = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  return { values };
}

async function recordWealthSnapshot(budgetId: string, totalValue: number) {
  const prisma = getPrismaClient();
  const recordedAtIso = toIsoDate(new Date());
  const recordedAt = new Date(`${recordedAtIso}T00:00:00Z`);
  await prisma.wealthSnapshot.create({
    data: { budgetId, recordedAt, totalValue },
  });
}

export async function createWealthHolding(input: {
  assetType: string;
  symbol?: string;
  name: string;
  quantity: number;
  unitPrice?: number;
  valueOverride?: number;
  asOf?: string;
}) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Wealth tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  // Fix #20: upsert is safe under concurrent requests thanks to the unique index on (budgetId, name).
  const account = await prisma.wealthAccount.upsert({
    where: { budgetId_name: { budgetId: budget.id, name: "Holdings" } },
    create: { budgetId: budget.id, name: "Holdings", type: "OTHER", currency: "AUD" },
    update: {},
  });

  await prisma.wealthHolding.create({
    data: {
      budgetId: budget.id,
      accountId: account.id,
      assetType: input.assetType,
      symbol: input.symbol ?? null,
      name: input.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? null,
      valueOverride: input.valueOverride ?? null,
      asOf: input.asOf ? new Date(`${input.asOf}T00:00:00Z`) : null,
    },
  });

  const totalValue = await getWealthTotalValueForBudget(budget.id);
  await recordWealthSnapshot(budget.id, totalValue);
}

export async function updateWealthHolding(
  id: string,
  input: {
    assetType: string;
    symbol?: string;
    name: string;
    quantity: number;
    unitPrice?: number;
    valueOverride?: number;
    asOf?: string;
  },
) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Wealth tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const existing = await prisma.wealthHolding.findFirst({
    where: { id, budgetId: budget.id },
  });
  if (!existing) throw new Error("Holding not found.");

  await prisma.wealthHolding.update({
    where: { id },
    data: {
      assetType: input.assetType,
      symbol: input.symbol ?? null,
      name: input.name,
      quantity: input.quantity,
      unitPrice: input.unitPrice ?? null,
      valueOverride: input.valueOverride ?? null,
      asOf: input.asOf ? new Date(`${input.asOf}T00:00:00Z`) : null,
    },
  });

  const totalValue = await getWealthTotalValueForBudget(budget.id);
  await recordWealthSnapshot(budget.id, totalValue);
}

export async function deleteWealthHolding(id: string) {
  if (!hasConfiguredDatabase()) {
    throw new Error("Wealth tracking requires a database.");
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const existing = await prisma.wealthHolding.findFirst({
    where: { id, budgetId: budget.id },
  });
  if (!existing) throw new Error("Holding not found.");

  await prisma.wealthHolding.delete({ where: { id } });

  const totalValue = await getWealthTotalValueForBudget(budget.id);
  await recordWealthSnapshot(budget.id, totalValue);
}
