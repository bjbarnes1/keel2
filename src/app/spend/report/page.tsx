/**
 * Actual vs planned report for a calendar month (`getActualVsPlannedReport`).
 *
 * @module app/spend/report/page
 */

import Link from "next/link";

import { AppShell, SectionTitle, SurfaceCard } from "@/components/keel/primitives";
import { getActualVsPlannedReport } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

function shiftMonthKey(monthKey: string, delta: number) {
  const [yearRaw, monthRaw] = monthKey.split("-").map(Number);
  const base = new Date(Date.UTC(yearRaw, monthRaw - 1 + delta, 1));
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  return `${y}-${m.toString().padStart(2, "0")}`;
}

export default async function SpendReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const report = await getActualVsPlannedReport(params.month);

  const prevMonth = shiftMonthKey(report.monthKey, -1);
  const nextMonth = shiftMonthKey(report.monthKey, 1);

  return (
    <AppShell title="Budget vs actual" currentPath="/spend" backHref="/spend">
      <SurfaceCard className="mb-4">
        <p className="text-sm text-muted-foreground">
          Planned amounts come from active commitments, scaled to the days in the month. Actuals are imported debits with a
          category (plus anything still uncategorized).
        </p>
      </SurfaceCard>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link
            href={`/spend/report?month=${prevMonth}`}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
          >
            ← {prevMonth}
          </Link>
          <Link
            href={`/spend/report?month=${nextMonth}`}
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
          >
            {nextMonth} →
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          {report.start} — {report.end} ({report.periodDays} days)
        </p>
      </div>

      {report.rows.length === 0 ? (
        <SurfaceCard>
          <p className="text-sm text-muted-foreground">
            No data for this month yet. Add commitments and import or tag bank transactions to see comparisons.
          </p>
        </SurfaceCard>
      ) : (
        <>
          <SurfaceCard className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total planned</p>
              <p className="mt-1 font-mono text-xl font-semibold">{formatAud(report.totals.planned)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total actual</p>
              <p className="mt-1 font-mono text-xl font-semibold">{formatAud(report.totals.actual)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Variance (planned − actual)</p>
              <p
                className={`mt-1 font-mono text-xl font-semibold ${
                  report.totals.variance >= 0 ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {formatAud(report.totals.variance)}
              </p>
            </div>
          </SurfaceCard>

          <SectionTitle title="By category" />
          <div className="space-y-2">
            {report.rows.map((row) => (
              <SurfaceCard key={row.categoryId ?? "uncategorized"} className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{row.categoryName}</p>
                  <span
                    className={`text-xs font-medium ${
                      row.variance >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {row.variance >= 0 ? "Under" : "Over"}{" "}
                    {formatAud(Math.abs(row.variance))}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div>
                    <p>Planned</p>
                    <p className="font-mono text-sm text-foreground">{formatAud(row.planned)}</p>
                  </div>
                  <div>
                    <p>Actual</p>
                    <p className="font-mono text-sm text-foreground">{formatAud(row.actual)}</p>
                  </div>
                </div>
              </SurfaceCard>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
