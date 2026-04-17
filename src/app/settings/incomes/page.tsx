import Link from "next/link";

import {
  AppShell,
  SurfaceCard,
} from "@/components/keel/primitives";
import {
  deleteIncomeAction,
  setPrimaryIncomeAction,
} from "@/app/actions/keel";
import { getDashboardSnapshot } from "@/lib/persistence/keel-store";
import { formatAud, sentenceCaseFrequency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsIncomesPage() {
  const snapshot = await getDashboardSnapshot();

  const ordered = snapshot.incomes
    .slice()
    .sort((left, right) => {
      if (left.id === snapshot.primaryIncomeId) return -1;
      if (right.id === snapshot.primaryIncomeId) return 1;
      return left.name.localeCompare(right.name);
    });

  return (
    <AppShell title="Incomes" currentPath="/settings" backHref="/settings">
      <div className="space-y-3">
        <SurfaceCard className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Your pay sources</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bills and goals can be allocated to a specific income so per-pay
              amounts match the right cadence. Edits apply from a date you choose—past
              periods stay as they were.
            </p>
          </div>
          <Link
            href="/settings/incomes/new"
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-primary"
          >
            + Add
          </Link>
        </SurfaceCard>

        {ordered.map((income) => {
          const isPrimary = income.id === snapshot.primaryIncomeId;

          return (
            <SurfaceCard key={income.id} className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{income.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {sentenceCaseFrequency(income.frequency)} · Next pay{" "}
                    {income.nextPayDate}
                  </p>
                </div>
                <p className="font-mono text-sm font-semibold">
                  {formatAud(income.amount)}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/settings/incomes/${income.id}/edit`}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-primary"
                >
                  Edit (future)
                </Link>
                {isPrimary ? (
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    Primary
                  </span>
                ) : (
                  <form action={setPrimaryIncomeAction}>
                    <input type="hidden" name="incomeId" value={income.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      Set primary
                    </button>
                  </form>
                )}

                {ordered.length > 1 ? (
                  <form action={deleteIncomeAction}>
                    <input type="hidden" name="incomeId" value={income.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-500"
                    >
                      Delete
                    </button>
                  </form>
                ) : null}
              </div>
            </SurfaceCard>
          );
        })}
      </div>
    </AppShell>
  );
}
