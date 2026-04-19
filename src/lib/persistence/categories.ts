import { unstable_noStore as noStore } from "next/cache";

import { getPrismaClient } from "@/lib/prisma";

import { getBudgetContext } from "./auth";
import { hasConfiguredDatabase } from "./config";

export async function getCategoryOptions() {
  noStore();

  if (!hasConfiguredDatabase()) {
    return [
      { id: "cat-housing", name: "Housing", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-insurance", name: "Insurance", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-utilities", name: "Utilities", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-subscriptions", name: "Subscriptions", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-transport", name: "Transport", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-education", name: "Education", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-health", name: "Health", subcategories: [] as Array<{ id: string; name: string }> },
      { id: "cat-other", name: "Other", subcategories: [] as Array<{ id: string; name: string }> },
    ];
  }

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const categories = await prisma.category.findMany({
    where: { budgetId: budget.id },
    include: { subcategories: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    subcategories: category.subcategories.map((s) => ({ id: s.id, name: s.name })),
  }));
}

export async function createCategory(input: { name: string }) {
  if (!hasConfiguredDatabase()) throw new Error("Categories require a database.");

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const name = input.name.trim();
  if (!name) throw new Error("Category name is required.");

  await prisma.category.create({
    data: { budgetId: budget.id, name, sortOrder: 0 },
  });
}

export async function createSubcategory(input: { categoryId: string; name: string }) {
  if (!hasConfiguredDatabase()) throw new Error("Categories require a database.");

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, budgetId: budget.id },
  });
  if (!category) throw new Error("Category not found.");

  const name = input.name.trim();
  if (!name) throw new Error("Subcategory name is required.");

  await prisma.subcategory.create({
    data: { categoryId: category.id, name, sortOrder: 0 },
  });
}

export async function deleteCategory(categoryId: string) {
  if (!hasConfiguredDatabase()) throw new Error("Categories require a database.");

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, budgetId: budget.id },
  });
  if (!category) throw new Error("Category not found.");

  const [commitments, spend] = await Promise.all([
    prisma.commitment.count({ where: { budgetId: budget.id, categoryId: category.id } }),
    prisma.spendTransaction.count({ where: { budgetId: budget.id, categoryId: category.id } }),
  ]);

  if (commitments > 0 || spend > 0) {
    throw new Error("This category is in use and cannot be deleted.");
  }

  await prisma.category.delete({ where: { id: category.id } });
}

export async function deleteSubcategory(subcategoryId: string) {
  if (!hasConfiguredDatabase()) throw new Error("Categories require a database.");

  const prisma = getPrismaClient();
  const { budget } = await getBudgetContext();

  const subcategory = await prisma.subcategory.findFirst({
    where: { id: subcategoryId, category: { budgetId: budget.id } },
    include: { category: true },
  });
  if (!subcategory) throw new Error("Subcategory not found.");

  const [commitments, spend] = await Promise.all([
    prisma.commitment.count({ where: { budgetId: budget.id, subcategoryId: subcategory.id } }),
    prisma.spendTransaction.count({ where: { budgetId: budget.id, subcategoryId: subcategory.id } }),
  ]);

  if (commitments > 0 || spend > 0) {
    throw new Error("This subcategory is in use and cannot be deleted.");
  }

  await prisma.subcategory.delete({ where: { id: subcategory.id } });
}
