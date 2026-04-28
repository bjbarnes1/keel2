/**
 * Budget dashboard route using the new modular Budget UI surface.
 *
 * @module app/budget/page
 */

import {
  BudgetDashboard,
  type BudgetCategoryCardModel,
  type BudgetDashboardModel,
  type BudgetInsightModel,
  type BudgetVsActualCardModel,
} from "@/components/keel/budget/budget-dashboard";
import { AppShell } from "@/components/keel/primitives";
import { getActualVsPlannedReport, getMonthlyBudgetTree } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

function monthLabelForReport(start: string, end: string) {
  if (!start || !end) return "Current month";
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const startLabel = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short" }).format(startDate);
  const endLabel = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(endDate);
  return `${startLabel} - ${endLabel}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function buildCategoryCards(
  tree: Awaited<ReturnType<typeof getMonthlyBudgetTree>>,
  actualByCategory: Map<string, number>,
): BudgetCategoryCardModel[] {
  return tree.map((category) => {
    const planned = roundMoney(category.monthlyTotal);
    const actual = roundMoney(actualByCategory.get(category.id) ?? 0);
    const categoryScale = Math.max(planned, actual, 1);
    const mapItem = (monthlyEquivalent: number) => ({
      progressValue: monthlyEquivalent,
      progressMax: categoryScale,
    });

    return {
      id: category.id,
      name: category.name,
      monthlyTotal: planned,
      planned,
      actual,
      progressValue: actual,
      progressMax: categoryScale,
      commitmentCount:
        category.subcategories.reduce((acc, sub) => acc + sub.commitments.length, 0) +
        category.uncategorisedCommitments.length,
      subcategories: category.subcategories.map((sub) => ({
        id: sub.id,
        name: sub.name,
        monthlyTotal: roundMoney(sub.monthlyTotal),
        commitments: sub.commitments.map((commitment) => ({
          id: commitment.id,
          name: commitment.name,
          amount: commitment.amount,
          monthlyEquivalent: commitment.monthlyEquivalent,
          frequency: commitment.frequency,
          ...mapItem(commitment.monthlyEquivalent),
        })),
      })),
      uncategorisedCommitments: category.uncategorisedCommitments.map((commitment) => ({
        id: commitment.id,
        name: commitment.name,
        amount: commitment.amount,
        monthlyEquivalent: commitment.monthlyEquivalent,
        frequency: commitment.frequency,
        ...mapItem(commitment.monthlyEquivalent),
      })),
    };
  });
}

function buildInsights(
  categories: BudgetCategoryCardModel[],
  plannedTotal: number,
  actualTotal: number,
): BudgetInsightModel[] {
  const onTrack = categories.filter((category) => category.actual <= category.planned + 0.005).length;
  const overPlan = categories.filter((category) => category.actual > category.planned + 0.005).length;
  const largest = categories.reduce<BudgetCategoryCardModel | null>(
    (winner, current) => (winner && winner.monthlyTotal >= current.monthlyTotal ? winner : current),
    null,
  );
  const headroom = roundMoney(plannedTotal - actualTotal);
  const spendCoverage = plannedTotal > 0 ? Math.min(Math.max((actualTotal / plannedTotal) * 100, 0), 100) : 0;

  return [
    {
      title: `${onTrack} categories on track`,
      body: overPlan > 0 ? `${overPlan} categories are currently over plan.` : "No categories are over plan this month.",
      tone: overPlan > 0 ? "attend" : "safe",
    },
    {
      title: largest ? `${largest.name} is your largest planned bucket` : "No category data yet",
      body: largest
        ? `${formatAud(largest.monthlyTotal)} planned per month.`
        : "Create commitments to build your category structure.",
      tone: "accent",
    },
    {
      title: headroom >= 0 ? "Headroom available" : "Spend is over plan",
      body: `${formatAud(Math.abs(headroom))} ${headroom >= 0 ? "remaining against plan" : "above this month's plan"} with ${Math.round(spendCoverage)}% used.`,
      tone: headroom >= 0 ? "safe" : "attend",
    },
  ];
}

function buildBudgetVsActual(
  categories: BudgetCategoryCardModel[],
  reportRows: Awaited<ReturnType<typeof getActualVsPlannedReport>>["rows"],
): BudgetVsActualCardModel[] {
  const byCategoryId = new Map(reportRows.filter((row) => row.categoryId).map((row) => [row.categoryId as string, row]));
  const rows = categories.map<BudgetVsActualCardModel>((category) => {
    const report = byCategoryId.get(category.id);
    const planned = roundMoney(report?.planned ?? category.planned);
    const actual = roundMoney(report?.actual ?? category.actual);
    return {
      id: category.id,
      name: category.name,
      planned,
      actual,
      variance: roundMoney(planned - actual),
    };
  });

  return rows
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, 3);
}

export default async function BudgetPage() {
  const [tree, report] = await Promise.all([getMonthlyBudgetTree(), getActualVsPlannedReport()]);
  const actualByCategory = new Map(
    report.rows.filter((row) => row.categoryId).map((row) => [row.categoryId as string, row.actual]),
  );

  const categories = buildCategoryCards(tree, actualByCategory);
  const plannedTotal = roundMoney(categories.reduce((sum, category) => sum + category.planned, 0));
  const actualTotal = roundMoney(categories.reduce((sum, category) => sum + category.actual, 0));
  const remaining = roundMoney(plannedTotal - actualTotal);
  const overPlanCategories = categories.filter((category) => category.actual > category.planned + 0.005).length;

  const model: BudgetDashboardModel = {
    monthLabel: monthLabelForReport(report.start, report.end),
    statCards: [
      {
        label: "Planned budget",
        value: formatAud(plannedTotal),
        hint: "Monthly commitment equivalent",
        tone: "accent",
      },
      {
        label: "Actual spend",
        value: formatAud(actualTotal),
        hint: `${Math.round(plannedTotal > 0 ? (actualTotal / plannedTotal) * 100 : 0)}% of plan used`,
        tone: overPlanCategories > 0 ? "attend" : "safe",
        progress: { value: actualTotal, max: Math.max(plannedTotal, actualTotal, 1) },
      },
      {
        label: remaining >= 0 ? "Remaining" : "Over plan",
        value: formatAud(Math.abs(remaining)),
        hint: remaining >= 0 ? "Still available this month" : "Needs schedule review",
        tone: remaining >= 0 ? "safe" : "attend",
      },
      {
        label: "Categories",
        value: `${categories.length}`,
        hint: `${overPlanCategories} over plan this month`,
        tone: overPlanCategories > 0 ? "attend" : "accent",
      },
    ],
    categories,
    insights: buildInsights(categories, plannedTotal, actualTotal),
    budgetVsActual: buildBudgetVsActual(categories, report.rows),
  };

  return (
    <AppShell title="Budget" currentPath="/budget" backHref="/">
      <BudgetDashboard model={model} />
    </AppShell>
  );
}

