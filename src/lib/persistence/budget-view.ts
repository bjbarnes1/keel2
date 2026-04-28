/**
 * Read-only budget “structure” view: categories/subcategories with monthly totals.
 *
 * Keel’s planning model is commitments + goals. For a “monthly budget” view, we
 * annualize commitments and divide by 12 for a stable month-equivalent number.
 *
 * @module lib/persistence/budget-view
 */

import { unstable_noStore as noStore } from "next/cache";

import { annualizeAmount } from "@/lib/engine/keel";
import { getPrismaClient } from "@/lib/prisma";
import type { CommitmentFrequency } from "@/lib/types";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase, hasSupabaseAuthConfigured } from "./config";
import { readState } from "./state";

export type BudgetCommitmentLine = {
  id: string;
  name: string;
  frequency: string;
  amount: number;
  monthlyEquivalent: number;
  categoryId: string;
  subcategoryId?: string;
};

export type BudgetCategoryNode = {
  id: string;
  name: string;
  monthlyTotal: number;
  subcategories: Array<{
    id: string;
    name: string;
    monthlyTotal: number;
    commitments: BudgetCommitmentLine[];
  }>;
  uncategorisedCommitments: BudgetCommitmentLine[];
};

function monthlyEquivalent(amount: number, frequency: CommitmentFrequency | string) {
  const f = frequency as CommitmentFrequency;
  const annual = annualizeAmount(amount, f);
  return Math.round((annual / 12) * 100) / 100;
}

export async function getMonthlyBudgetTree(): Promise<BudgetCategoryNode[]> {
  noStore();

  // Demo mode: show categories and commitments from the JSON store.
  if (!hasConfiguredDatabase() || !hasSupabaseAuthConfigured()) {
    const state = await readState();
    const cats = new Map(
      state.commitments.map((c) => [c.categoryId, { id: c.categoryId, name: c.category, sub: new Map<string, string>() }]),
    );
    for (const c of state.commitments) {
      if (c.subcategoryId && c.subcategory) {
        cats.get(c.categoryId)?.sub.set(c.subcategoryId, c.subcategory);
      }
    }

    const out: BudgetCategoryNode[] = [];
    for (const cat of cats.values()) {
      const node: BudgetCategoryNode = {
        id: cat.id,
        name: cat.name,
        monthlyTotal: 0,
        subcategories: Array.from(cat.sub.entries()).map(([id, name]) => ({
          id,
          name,
          monthlyTotal: 0,
          commitments: [],
        })),
        uncategorisedCommitments: [],
      };

      const subById = new Map(node.subcategories.map((s) => [s.id, s]));
      for (const c of state.commitments.filter((c) => !c.archivedAt && c.categoryId === cat.id)) {
        const line: BudgetCommitmentLine = {
          id: c.id,
          name: c.name,
          frequency: c.frequency,
          amount: c.amount,
          monthlyEquivalent: monthlyEquivalent(c.amount, c.frequency),
          categoryId: c.categoryId,
          subcategoryId: c.subcategoryId,
        };
        node.monthlyTotal += line.monthlyEquivalent;
        const sub = c.subcategoryId ? subById.get(c.subcategoryId) : null;
        if (sub) {
          sub.commitments.push(line);
          sub.monthlyTotal += line.monthlyEquivalent;
        } else {
          node.uncategorisedCommitments.push(line);
        }
      }

      out.push(node);
    }

    return out.sort((a, b) => b.monthlyTotal - a.monthlyTotal);
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const [categories, commitments] = await Promise.all([
    prisma.category.findMany({
      where: { budgetId: budget.id },
      include: { subcategories: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.commitment.findMany({
      where: { budgetId: budget.id, archivedAt: null },
      select: {
        id: true,
        name: true,
        frequency: true,
        amount: true,
        categoryId: true,
        subcategoryId: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const byCategory = new Map<string, BudgetCategoryNode>();
  for (const c of categories) {
    byCategory.set(c.id, {
      id: c.id,
      name: c.name,
      monthlyTotal: 0,
      subcategories: c.subcategories.map((s) => ({
        id: s.id,
        name: s.name,
        monthlyTotal: 0,
        commitments: [],
      })),
      uncategorisedCommitments: [],
    });
  }

  for (const c of commitments) {
    const category = byCategory.get(c.categoryId);
    if (!category) continue;
    const line: BudgetCommitmentLine = {
      id: c.id,
      name: c.name,
      frequency: c.frequency,
      amount: Number(c.amount),
      monthlyEquivalent: monthlyEquivalent(Number(c.amount), c.frequency),
      categoryId: c.categoryId,
      subcategoryId: c.subcategoryId ?? undefined,
    };
    category.monthlyTotal += line.monthlyEquivalent;
    const sub = c.subcategoryId
      ? category.subcategories.find((s) => s.id === c.subcategoryId)
      : null;
    if (sub) {
      sub.commitments.push(line);
      sub.monthlyTotal += line.monthlyEquivalent;
    } else {
      category.uncategorisedCommitments.push(line);
    }
  }

  return Array.from(byCategory.values()).sort((a, b) => b.monthlyTotal - a.monthlyTotal);
}

