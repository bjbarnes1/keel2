/**
 * Budget-scoped SQL scans for scheduled jobs (no Supabase cookie context).
 *
 * @module lib/alerts/cron-budget-scan
 */

import { getPrismaClient } from "@/lib/prisma";

import type { DailyAlert } from "./daily-alerts";

const MS_DAY = 86400000;

export async function scanBudgetAlerts(budgetId: string, now = new Date()): Promise<DailyAlert[]> {
  const prisma = getPrismaClient();
  const alerts: DailyAlert[] = [];

  const triage = await prisma.spendTransaction.count({
    where: { budgetId, categoryId: null },
  });
  if (triage > 0) {
    alerts.push({
      level: "info",
      code: "SPEND_TRIAGE",
      message: `${triage} spend transaction(s) need a category.`,
    });
  }

  const rebateRows = await prisma.spendTransaction.findMany({
    where: {
      budgetId,
      rebateState: { in: ["EXPECTED", "PARTIAL"] },
    },
    select: { memo: true, postedOn: true, rebateExpectedAmount: true, rebateMatchedAmount: true },
    take: 40,
  });

  for (const r of rebateRows) {
    const expected = Number(r.rebateExpectedAmount ?? 0);
    const matched = Number(r.rebateMatchedAmount ?? 0);
    const remaining = expected - matched;
    if (remaining < 500) continue;
    const ageDays = (now.getTime() - r.postedOn.getTime()) / MS_DAY;
    if (ageDays >= 60) {
      alerts.push({
        level: "warn",
        code: "REBATE_STALE",
        message: `Large rebate still open (${remaining.toFixed(0)} AUD): ${r.memo.slice(0, 80)}`,
      });
    }
  }

  return alerts;
}

export async function scanAllBudgetAlerts(now = new Date()) {
  const prisma = getPrismaClient();
  const budgets = await prisma.budget.findMany({ select: { id: true, name: true }, take: 100 });
  const out: Array<{ budgetId: string; budgetName: string; alerts: DailyAlert[] }> = [];
  for (const b of budgets) {
    const alerts = await scanBudgetAlerts(b.id, now);
    if (alerts.length) out.push({ budgetId: b.id, budgetName: b.name, alerts });
  }
  return out;
}
