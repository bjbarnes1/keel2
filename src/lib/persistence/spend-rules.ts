/**
 * Budget-scoped merchant / memo categorisation rules applied during Up ingest and optionally from triage.
 *
 * @module lib/persistence/spend-rules
 */

import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";

export type SpendRuleView = {
  id: string;
  matchKind: string;
  pattern: string;
  categoryId: string;
  categoryName: string;
  subcategoryId?: string;
  priority: number;
};

export async function listSpendCategorisationRules(): Promise<SpendRuleView[]> {
  noStore();
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) return [];

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const rows = await prisma.spendCategorisationRule.findMany({
    where: { budgetId: budget.id },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    include: { categoryRef: true, subcategoryRef: true },
  });

  return rows.map((r) => ({
    id: r.id,
    matchKind: r.matchKind,
    pattern: r.pattern,
    categoryId: r.categoryId,
    categoryName: r.categoryRef.name,
    subcategoryId: r.subcategoryId ?? undefined,
    priority: r.priority,
  }));
}

export async function createSpendCategorisationRule(input: {
  pattern: string;
  categoryId: string;
  subcategoryId?: string | null;
  matchKind?: string;
  priority?: number;
}) {
  if (!hasConfiguredDatabase()) throw new Error("Rules require a database.");

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const cat = await prisma.category.findFirst({
    where: { id: input.categoryId, budgetId: budget.id },
  });
  if (!cat) throw new Error("Category not found.");

  if (input.subcategoryId) {
    const sub = await prisma.subcategory.findFirst({
      where: { id: input.subcategoryId, categoryId: cat.id },
    });
    if (!sub) throw new Error("Subcategory does not match category.");
  }

  await prisma.spendCategorisationRule.create({
    data: {
      budgetId: budget.id,
      pattern: input.pattern.trim(),
      categoryId: input.categoryId,
      subcategoryId: input.subcategoryId ?? null,
      matchKind: input.matchKind ?? "MEMO_CONTAINS",
      priority: input.priority ?? 0,
    },
  });
}

export async function deleteSpendCategorisationRule(id: string) {
  if (!hasConfiguredDatabase()) throw new Error("Rules require a database.");
  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();
  const row = await prisma.spendCategorisationRule.findFirst({
    where: { id, budgetId: budget.id },
  });
  if (!row) throw new Error("Rule not found.");
  await prisma.spendCategorisationRule.delete({ where: { id } });
}

/** First matching rule wins (highest priority first). */
export async function resolveCategoryFromRules(input: {
  budgetId: string;
  memo: string;
}): Promise<{ categoryId: string; subcategoryId: string | null } | null> {
  const prisma = getPrismaClient();
  const memo = input.memo.toLowerCase();

  const rules = await prisma.spendCategorisationRule.findMany({
    where: { budgetId: input.budgetId },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  for (const r of rules) {
    const p = r.pattern.toLowerCase();
    if (r.matchKind === "MEMO_CONTAINS" || !r.matchKind) {
      if (memo.includes(p)) {
        return { categoryId: r.categoryId, subcategoryId: r.subcategoryId };
      }
    }
  }
  return null;
}
