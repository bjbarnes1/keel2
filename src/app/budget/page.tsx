/**
 * Monthly budget view: categories/subcategories with month-equivalent totals.
 *
 * @module app/budget/page
 */

import Link from "next/link";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { getMonthlyBudgetTree } from "@/lib/persistence/keel-store";
import { formatAud, sentenceCaseFrequency } from "@/lib/utils";

export const dynamic = "force-dynamic";

function MonthlyChip({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 font-mono text-xs tabular-nums text-[color:var(--keel-ink)]">
      {formatAud(value)}/mo
    </span>
  );
}

export default async function BudgetPage() {
  const tree = await getMonthlyBudgetTree();
  const total = tree.reduce((sum, c) => sum + c.monthlyTotal, 0);

  return (
    <AppShell title="Budget" currentPath="/budget" backHref="/">
      <SurfaceCard className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[color:var(--keel-ink)]">Monthly plan (commitments)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Commitment amounts are annualised and divided by 12 so the structure is always monthly.
            </p>
          </div>
          <MonthlyChip value={total} />
        </div>
      </SurfaceCard>

      <div className="space-y-3">
        {tree.map((cat) => (
          <SurfaceCard key={cat.id} className="p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[color:var(--keel-ink)]">{cat.name}</p>
                <p className="mt-1 text-xs text-[color:var(--keel-ink-4)]">
                  {cat.subcategories.length} subcategories
                  {cat.uncategorisedCommitments.length ? ` · ${cat.uncategorisedCommitments.length} uncategorised` : ""}
                </p>
              </div>
              <MonthlyChip value={cat.monthlyTotal} />
            </div>

            {cat.subcategories.length ? (
              <div className="border-t border-white/10">
                {cat.subcategories.map((sub) => (
                  <div key={sub.id} className="px-4 py-3 border-b border-white/[0.06] last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[color:var(--keel-ink)]">{sub.name}</p>
                      <MonthlyChip value={sub.monthlyTotal} />
                    </div>
                    {sub.commitments.length ? (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        {sub.commitments.map((c) => (
                          <Link
                            key={c.id}
                            href={`/commitments/${c.id}`}
                            className="glass-clear rounded-xl px-3 py-2 text-sm transition-colors hover:border-white/16"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate text-[color:var(--keel-ink)]">{c.name}</span>
                              <span className="shrink-0 font-mono text-xs tabular-nums text-[color:var(--keel-ink-2)]">
                                {formatAud(c.monthlyEquivalent)}/mo
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">
                              {sentenceCaseFrequency(c.frequency)} · {formatAud(c.amount)}
                            </p>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[color:var(--keel-ink-4)]">No commitments here yet.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {cat.uncategorisedCommitments.length ? (
              <div className="border-t border-white/10 px-4 py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--keel-ink-5)]">
                  Uncategorised commitments
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {cat.uncategorisedCommitments.map((c) => (
                    <Link
                      key={c.id}
                      href={`/commitments/${c.id}`}
                      className="glass-clear rounded-xl px-3 py-2 text-sm transition-colors hover:border-white/16"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[color:var(--keel-ink)]">{c.name}</span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-[color:var(--keel-ink-2)]">
                          {formatAud(c.monthlyEquivalent)}/mo
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[color:var(--keel-ink-4)]">
                        {sentenceCaseFrequency(c.frequency)} · {formatAud(c.amount)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </SurfaceCard>
        ))}
      </div>
    </AppShell>
  );
}

