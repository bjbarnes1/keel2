"use client";

import { MoreHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { setPrimaryIncomeAction } from "@/app/actions/keel";
import type { IncomeEditFields } from "@/components/keel/income-edit-sheet";
import { IncomeArchiveSheet } from "@/components/keel/income-archive-sheet";
import { IncomeEditSheet } from "@/components/keel/income-edit-sheet";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { cn, formatAud, formatDisplayDate, sentenceCaseFrequency } from "@/lib/utils";

type UpcomingPay = { iso: string; amount: number };

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
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

  return (
    <AppShell title={income.name} currentPath="/settings" backHref="/incomes" headerRight={kebab}>
      {/* TODO: Income skips are pending a dedicated PR (IncomeSkip model + engine semantics). */}
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
            upcoming.map((row) => (
              <div
                key={row.iso}
                className="grid grid-cols-[80px_1fr_auto] items-center gap-3 border-b border-white/[0.04] px-3 py-3 last:border-b-0"
              >
                <p className="text-[12px] tabular-nums text-[color:var(--keel-ink-3)]">{formatDisplayDate(row.iso)}</p>
                <p className="truncate text-sm font-medium text-[color:var(--keel-ink)]">{income.name}</p>
                <p className="font-mono text-[13px] font-medium tabular-nums text-[color:var(--keel-safe-soft)]">
                  +{formatAud(row.amount)}
                </p>
              </div>
            ))
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

