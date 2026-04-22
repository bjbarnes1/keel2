"use client";

/**
 * Commitment detail interactive shell: sheets for skip/edit/archive; skip-next on held card.
 *
 * @module components/keel/commitment-detail-client
 */

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ScheduledCashflowEvent } from "@/lib/engine/skips";
import type { CommitmentSkipInput, CommitmentView, IncomeView } from "@/lib/types";
import { cn, formatAud, formatDisplayDate } from "@/lib/utils";

import { CommitmentArchiveSheet } from "@/components/keel/commitment-archive-sheet";
import { CommitmentEditSheet } from "@/components/keel/commitment-edit-sheet";
import { CommitmentRestoreSheet } from "@/components/keel/commitment-restore-sheet";
import { CommitmentSkipSheet } from "@/components/keel/commitment-skip-sheet";
import { AppShell, CommitmentCardContent, SurfaceCard } from "@/components/keel/primitives";

type CategoryOption = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

type GoalOption = { id: string; name: string };

type Occurrence = { iso: string; amount: number; activeSkipId?: string };

type SpendRow = { id: string; postedOnIso: string; amount: number; memo: string };

type SkipPreview = {
  baselineOrdered: ScheduledCashflowEvent[];
  startingAvailableMoney: number;
  existingCommitmentSkips: CommitmentSkipInput[];
};

type CommitmentFields = {
  name: string;
  amount: number;
  frequency: CommitmentView["frequency"];
  nextDueDate: string;
  categoryId: string;
  subcategoryId?: string;
  fundedByIncomeId?: string;
};

type Props = {
  commitmentId: string;
  display: CommitmentView;
  editFields: CommitmentFields;
  incomes: IncomeView[];
  primaryIncomeId: string;
  categories: CategoryOption[];
  goals: GoalOption[];
  skipPreview: SkipPreview;
  occurrences: Occurrence[];
  prefillSkipDate?: string;
  recentSpend: SpendRow[];
  keelNoticed: string;
};

function resolvePrefill(prefillSkipDate: string | undefined, occurrences: Occurrence[]) {
  if (!prefillSkipDate || !/^\d{4}-\d{2}-\d{2}$/.test(prefillSkipDate)) {
    return { sheetDate: null as string | null, sheetOpen: false };
  }
  const match = occurrences.find((row) => row.iso === prefillSkipDate && !row.activeSkipId);
  if (!match) {
    return { sheetDate: null as string | null, sheetOpen: false };
  }
  return { sheetDate: match.iso, sheetOpen: true };
}

export function CommitmentDetailClient({
  commitmentId,
  display,
  editFields,
  incomes,
  primaryIncomeId,
  categories,
  goals,
  skipPreview,
  occurrences,
  prefillSkipDate,
  recentSpend,
  keelNoticed,
}: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initialSkip = useMemo(
    () => resolvePrefill(prefillSkipDate, occurrences),
    [prefillSkipDate, occurrences],
  );
  const [sheetOpen, setSheetOpen] = useState(initialSkip.sheetOpen);
  const [sheetDate, setSheetDate] = useState<string | null>(initialSkip.sheetDate);
  const [restoreSkipId, setRestoreSkipId] = useState<string | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const sheetAmount = useMemo(() => {
    if (!sheetDate) return 0;
    return occurrences.find((row) => row.iso === sheetDate)?.amount ?? 0;
  }, [occurrences, sheetDate]);

  const heldTint = display.isAttention ? "glass-tint-attend" : "glass-tint-safe";

  const kebab = (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="Commitment actions"
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
    <AppShell
      title={display.name}
      currentPath="/commitments"
      backHref="/commitments"
      headerRight={kebab}
    >
      <SurfaceCard className="mb-4 !p-0 overflow-hidden">
        <div className="p-4">
          <CommitmentCardContent commitment={display} />
        </div>
      </SurfaceCard>

      <SurfaceCard className={cn("mb-4", heldTint, "!p-4")}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">
          Held toward next due date
        </p>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[color:var(--keel-ink)]">
          {formatAud(display.reserved)}
          <span className="ml-2 font-sans text-sm font-normal text-[color:var(--keel-ink-3)]">
            of {formatAud(display.amount)}
          </span>
        </p>
      </SurfaceCard>

      <SurfaceCard className="mb-4 !p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-3)]">
          Keel noticed
        </p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--keel-ink-2)]">{keelNoticed}</p>
      </SurfaceCard>

      <section className="mb-6">
        <div className="px-1 pb-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
            Upcoming
          </p>
        </div>

        <div className="glass-clear overflow-hidden rounded-[var(--radius-md)] border border-white/10">
          {occurrences.length === 0 ? (
            <div className="px-3 py-3 text-sm text-[color:var(--keel-ink-3)]">No upcoming payments.</div>
          ) : (
            occurrences
              .slice(0, (() => {
                switch (display.frequency) {
                  case "weekly":
                    return 10;
                  case "fortnightly":
                    return 10;
                  case "monthly":
                    return 6;
                  case "quarterly":
                    return 4;
                  case "annual":
                    return 3;
                  default:
                    return 6;
                }
              })())
              .map((row, index) => {
                const faded = index >= 6 ? "opacity-75" : index >= 3 ? "opacity-90" : null;
                return (
                  <div
                    key={row.iso}
                    className={cn(
                      "grid grid-cols-[80px_1fr_auto] items-center gap-3 border-b border-white/[0.04] px-3 py-3 last:border-b-0",
                      faded,
                    )}
                  >
                    <p className="text-[12px] tabular-nums text-[color:var(--keel-ink-3)]">
                      {formatDisplayDate(row.iso, "short-day")}
                    </p>
                    <p
                      className={cn(
                        "truncate font-mono text-[14px] tabular-nums text-[color:var(--keel-ink)]",
                        row.activeSkipId ? "text-[color:var(--keel-ink-4)] line-through" : null,
                      )}
                    >
                      {formatAud(row.amount)}
                    </p>
                    {row.activeSkipId ? (
                      <button
                        type="button"
                        onClick={() => setRestoreSkipId(row.activeSkipId!)}
                        className={cn(
                          "rounded-full border border-white/12 px-3 py-1.5 text-[11px] font-semibold text-[color:var(--keel-ink)]",
                          "glass-tint-attend",
                        )}
                      >
                        Unskip
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSheetDate(row.iso);
                          setSheetOpen(true);
                        }}
                        className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-[color:var(--keel-ink-3)] hover:bg-white/[0.06]"
                      >
                        Skip
                      </button>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-[color:var(--keel-ink)]">Recent spend</h2>
        <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">Transactions linked to this commitment.</p>
        {recentSpend.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--keel-ink-3)]">No linked spend yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentSpend.map((tx) => {
              const out = Number.isFinite(tx.amount) ? Math.abs(tx.amount) : 0;
              return (
                <li
                  key={tx.id}
                  className="glass-clear rounded-[var(--radius-md)] border border-white/10 px-3 py-3"
                >
                  <p className="text-xs text-[color:var(--keel-ink-4)]">
                    {formatDisplayDate(tx.postedOnIso)}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--keel-ink)]">{tx.memo || "Spend"}</p>
                  <p className="mt-1 font-mono text-sm tabular-nums text-[color:var(--keel-ink)]">
                    {formatAud(out)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CommitmentSkipSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setSheetDate(null);
          if (prefillSkipDate) {
            router.replace(`/commitments/${commitmentId}`);
          }
        }}
        commitmentId={commitmentId}
        commitmentName={display.name}
        amount={sheetAmount}
        originalDateIso={sheetDate ?? ""}
        goals={goals}
        baselineOrdered={skipPreview.baselineOrdered}
        startingAvailableMoney={skipPreview.startingAvailableMoney}
        existingCommitmentSkips={skipPreview.existingCommitmentSkips}
      />

      <CommitmentRestoreSheet
        open={restoreSkipId != null}
        skipId={restoreSkipId}
        onClose={() => setRestoreSkipId(null)}
        label={display.name}
      />

      <CommitmentEditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        commitmentId={commitmentId}
        commitment={editFields}
        displayPerPay={display.perPay}
        categories={categories}
        incomes={incomes}
        primaryIncomeId={primaryIncomeId}
      />

      <CommitmentArchiveSheet
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        commitmentId={commitmentId}
        commitmentName={display.name}
      />
    </AppShell>
  );
}
