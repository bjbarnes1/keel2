"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createIncomeSkip, revokeIncomeSkip } from "@/app/actions/income-skips";
import { setPrimaryIncomeAction } from "@/app/actions/keel";
import type { IncomeEditFields } from "@/components/keel/income-edit-sheet";
import { IncomeArchiveSheet } from "@/components/keel/income-archive-sheet";
import { IncomeEditSheet } from "@/components/keel/income-edit-sheet";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { cn, formatAud, formatDisplayDate, sentenceCaseFrequency } from "@/lib/utils";

type UpcomingPay = {
  iso: string;
  amount: number;
  skip: { id: string; createdAt: string } | null;
};

export function IncomeDetailClient({
  incomeId,
  income,
  isPrimary,
  upcoming,
}: {
  incomeId: string;
  income: IncomeEditFields;
  isPrimary: boolean;
  upcoming: UpcomingPay[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [confirmSkipIso, setConfirmSkipIso] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const heroMeta = useMemo(
    () => `${sentenceCaseFrequency(income.frequency)} · Next pay ${formatDisplayDate(income.nextPayDate)}`,
    [income.frequency, income.nextPayDate],
  );

  const kebab = (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="Income actions"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        className="glass-clear inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--keel-ink-2)] hover:text-[color:var(--keel-ink)]"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {menuOpen ? (
        <div
          role="menu"
          className="glass-heavy absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-[var(--radius-md)] border border-white/12 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
          style={{
            backgroundColor: "rgba(20, 26, 23, 0.92)",
            backdropFilter: "blur(40px) saturate(180%)",
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink)] hover:bg-white/6"
            onClick={() => {
              setMenuOpen(false);
              setEditOpen(true);
            }}
          >
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink-2)] hover:bg-white/6"
            onClick={() => {
              setMenuOpen(false);
              setArchiveOpen(true);
            }}
          >
            Archive
          </button>
        </div>
      ) : null}
    </div>
  );

  function rowOpacityClass(index: number) {
    if (index < 3) return "opacity-100";
    if (index < 6) return "opacity-90";
    return "opacity-[0.75]";
  }

  return (
    <AppShell title={income.name} currentPath="/settings" backHref="/incomes" headerRight={kebab}>
      <SurfaceCard className="mb-4 !p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">Per pay</p>
        <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-[color:var(--keel-ink)]">
          {formatAud(income.amount)}
        </p>
        <p className="mt-2 text-sm text-[color:var(--keel-ink-3)]">{heroMeta}</p>
      </SurfaceCard>

      {isPrimary ? (
        <SurfaceCard className="mb-4 !p-4">
          <p className="text-sm font-medium text-[color:var(--keel-ink)]">Primary income</p>
          <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">Used as the default for new commitments and goals.</p>
        </SurfaceCard>
      ) : (
        <SurfaceCard className="mb-4 !p-4">
          <p className="text-sm font-medium text-[color:var(--keel-ink)]">Not primary</p>
          <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">Set this as primary to use it by default.</p>
          <form action={setPrimaryIncomeAction} className="mt-3">
            <input type="hidden" name="incomeId" value={incomeId} />
            <button
              type="submit"
              className={cn(
                "w-full rounded-[var(--radius-md)] border border-white/12 py-3 text-sm font-semibold text-[color:var(--keel-ink)]",
                "glass-tint-safe",
              )}
            >
              Set as primary
            </button>
          </form>
        </SurfaceCard>
      )}

      <section className="mb-6">
        <div className="px-1 pb-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
            Upcoming pay
          </p>
        </div>
        <div className="glass-clear overflow-hidden rounded-[var(--radius-md)] border border-white/10">
          {upcoming.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[color:var(--keel-ink-3)]">No upcoming pays found.</div>
          ) : (
            upcoming.map((row, index) => {
              const skipped = Boolean(row.skip);
              return (
                <div
                  key={row.iso}
                  className={cn(
                    "border-b border-white/[0.04] px-3 py-3 last:border-b-0",
                    rowOpacityClass(index),
                  )}
                >
                  <div className="grid grid-cols-[80px_1fr_auto] items-start gap-3">
                    <p className="text-[12px] tabular-nums text-[color:var(--keel-ink-3)]">
                      {formatDisplayDate(row.iso)}
                    </p>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm font-medium text-[color:var(--keel-ink)]",
                          skipped && "text-[color:var(--keel-ink-4)] line-through decoration-[color:var(--keel-ink-4)]",
                        )}
                      >
                        {income.name}
                      </p>
                      {skipped && row.skip ? (
                        <p className="mt-1 text-[11px] text-[color:var(--keel-ink-5)]">
                          Skipped on {formatDisplayDate(row.skip.createdAt.slice(0, 10))}
                        </p>
                      ) : null}
                      {confirmSkipIso === row.iso ? (
                        <div className="mt-2 rounded-[var(--radius-md)] border border-white/10 bg-black/20 px-3 py-2">
                          <p className="text-xs font-medium text-[color:var(--keel-ink)]">
                            Skip {income.name} on {formatDisplayDate(row.iso)}?
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--keel-ink-3)]">
                            Your available money won&apos;t include this pay. You can unskip anytime.
                          </p>
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              className="flex-1 rounded-[var(--radius-md)] border border-white/15 py-2 text-xs font-medium text-[color:var(--keel-ink-2)]"
                              onClick={() => setConfirmSkipIso(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              className={cn(
                                "flex-1 rounded-[var(--radius-md)] py-2 text-xs font-semibold text-[color:var(--keel-ink)]",
                                "glass-tint-attend border border-white/12",
                              )}
                              onClick={() => {
                                startTransition(async () => {
                                  await createIncomeSkip({
                                    incomeId,
                                    originalDateIso: row.iso,
                                  });
                                  setConfirmSkipIso(null);
                                  router.refresh();
                                });
                              }}
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <p
                        className={cn(
                          "font-mono text-[13px] font-medium tabular-nums text-[color:var(--keel-safe-soft)]",
                          skipped && "text-[color:var(--keel-ink-4)] line-through",
                        )}
                      >
                        +{formatAud(row.amount)}
                      </p>
                      {skipped && row.skip ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await revokeIncomeSkip({ skipId: row.skip!.id });
                              router.refresh();
                            });
                          }}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold text-[color:var(--keel-ink)]",
                            "glass-tint-attend border border-white/12",
                          )}
                        >
                          Unskip
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending || (confirmSkipIso !== null && confirmSkipIso !== row.iso)}
                          onClick={() => setConfirmSkipIso(row.iso)}
                          className="rounded-full border border-white/[0.08] bg-[rgba(255,255,255,0.04)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--keel-ink-2)]"
                        >
                          Skip
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <IncomeEditSheet open={editOpen} onClose={() => setEditOpen(false)} income={income} />
      <IncomeArchiveSheet
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        incomeId={incomeId}
        incomeName={income.name}
      />
    </AppShell>
  );
}
