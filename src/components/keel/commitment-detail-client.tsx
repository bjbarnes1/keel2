"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ScheduledCashflowEvent } from "@/lib/engine/skips";
import type { CommitmentSkipInput, CommitmentView, IncomeView } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

import { CommitmentArchiveSheet } from "@/components/keel/commitment-archive-sheet";
import { CommitmentEditSheet } from "@/components/keel/commitment-edit-sheet";
import { CommitmentRestoreSheet } from "@/components/keel/commitment-restore-sheet";
import { CommitmentSkipSheet } from "@/components/keel/commitment-skip-sheet";
import { AppShell, CommitmentCardContent, SurfaceCard } from "@/components/keel/primitives";
import { SwipeActionRow } from "@/components/keel/swipe-action-row";

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

      <section className="mb-4">
        <h2 className="text-sm font-semibold text-[color:var(--keel-ink)]">Upcoming</h2>
        <p className="mt-1 text-xs text-[color:var(--keel-ink-3)]">Next three scheduled payments.</p>
        <ul className="mt-3 space-y-2">
          {occurrences.length === 0 ? (
            <li className="rounded-[var(--radius-md)] border border-white/10 px-3 py-4 text-sm text-[color:var(--keel-ink-3)]">
              No upcoming occurrences in range.
            </li>
          ) : (
            occurrences.map((row) => (
              <li key={row.iso}>
                <SwipeActionRow
                  secondaryAction={
                    row.activeSkipId
                      ? undefined
                      : {
                          label: "Skip",
                          tint: "neutral",
                          onPress: () => {
                            setSheetDate(row.iso);
                            setSheetOpen(true);
                          },
                        }
                  }
                  primaryAction={
                    row.activeSkipId
                      ? {
                          label: "Restore",
                          tint: "safe",
                          onPress: () => setRestoreSkipId(row.activeSkipId!),
                        }
                      : undefined
                  }
                >
                  <SurfaceCard className="!p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm text-[color:var(--keel-ink)]">{row.iso}</p>
                        <p className="text-xs text-[color:var(--keel-ink-3)]">{formatAud(row.amount)}</p>
                      </div>
                      {row.activeSkipId ? (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-4)]">
                          Skipped
                        </span>
                      ) : null}
                    </div>
                  </SurfaceCard>
                </SwipeActionRow>
              </li>
            ))
          )}
        </ul>
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
                  <p className="text-xs text-[color:var(--keel-ink-4)]">{tx.postedOnIso}</p>
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
