"use client";

/**
 * Commitments browse: overview, category groups, kebab row actions, archived section,
 * floating add, and a pill segmented sort control.
 *
 * @module components/keel/commitments-browse-client
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { restoreCommitmentAction } from "@/app/actions/keel";
import type { ScheduledCashflowEvent } from "@/lib/engine/skips";
import { annualizeAmount } from "@/lib/engine/keel";
import type { CommitmentSkipInput, CommitmentView, IncomeView } from "@/lib/types";
import { cn, formatAud, sentenceCaseFrequency } from "@/lib/utils";

import { CommitmentArchiveSheet } from "@/components/keel/commitment-archive-sheet";
import type { CommitmentFields } from "@/components/keel/commitment-edit-sheet";
import { CommitmentEditSheet } from "@/components/keel/commitment-edit-sheet";
import { CommitmentSkipSheet } from "@/components/keel/commitment-skip-sheet";
import { CategoryGroupHeader } from "@/components/keel/category-group-header";
import { FloatingAddButton } from "@/components/keel/floating-add-button";
import { KebabRow } from "@/components/keel/kebab-row";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";

type GoalOption = { id: string; name: string };

type SkipPreview = {
  baselineOrdered: ScheduledCashflowEvent[];
  startingAvailableMoney: number;
  existingCommitmentSkips: CommitmentSkipInput[];
};

type CategoryOption = {
  id: string;
  name: string;
  subcategories: Array<{ id: string; name: string }>;
};

type Props = {
  commitments: CommitmentView[];
  archivedCommitments: CommitmentView[];
  goals: GoalOption[];
  skipPreview: SkipPreview;
  summaryReserved: number;
  summaryAnnualized: number;
  categories: CategoryOption[];
  incomes: IncomeView[];
  primaryIncomeId: string;
  editPayloadsById: Record<string, CommitmentFields | null>;
};

type SortMode = "due" | "amount" | "name";

const HOUSING = "Housing";

function WaterlineGlyph() {
  return (
    <svg
      className="mx-auto mb-4 h-10 w-24 opacity-40"
      viewBox="0 0 96 32"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 20c12-8 20-8 32 0s20 8 32 0 20-8 28 0"
        stroke="var(--keel-safe-soft)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CommitmentsBrowseClient({
  commitments,
  archivedCommitments,
  goals,
  skipPreview,
  summaryReserved,
  summaryAnnualized,
  categories,
  incomes,
  primaryIncomeId,
  editPayloadsById,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [sort, setSort] = useState<SortMode>("due");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [skipCtx, setSkipCtx] = useState<{
    id: string;
    name: string;
    amount: number;
    originalDateIso: string;
  } | null>(null);
  const [archiveCtx, setArchiveCtx] = useState<{
    id: string;
    name: string;
    heldFormatted?: string;
  } | null>(null);
  const [editCtx, setEditCtx] = useState<{
    id: string;
    fields: CommitmentFields;
    displayPerPay: number;
  } | null>(null);

  const rowMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      if (rowMenuRef.current?.contains(e.target as Node)) return;
      setMenuId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

  const sorted = useMemo(() => {
    const copy = commitments.slice();
    copy.sort((a, b) => {
      if (sort === "amount") {
        return b.amount - a.amount;
      }
      if (sort === "name") {
        return a.name.localeCompare(b.name);
      }
      const ad = a.nextDueDateIso ?? "";
      const bd = b.nextDueDateIso ?? "";
      return ad.localeCompare(bd);
    });
    return copy;
  }, [commitments, sort]);

  const groups = useMemo(() => {
    const byCat = new Map<string, CommitmentView[]>();
    for (const c of sorted) {
      const key = c.category;
      const list = byCat.get(key) ?? [];
      list.push(c);
      byCat.set(key, list);
    }

    const entries = [...byCat.entries()].map(([label, rows]) => {
      const annual = rows.reduce((s, r) => s + annualizeAmount(r.amount, r.frequency), 0);
      return { label, rows, annual };
    });

    entries.sort((a, b) => {
      if (a.label === HOUSING && b.label !== HOUSING) return -1;
      if (b.label === HOUSING && a.label !== HOUSING) return 1;
      return b.annual - a.annual;
    });

    return entries;
  }, [sorted]);

  const archivedSorted = useMemo(() => {
    const copy = archivedCommitments.slice();
    copy.sort((a, b) => a.name.localeCompare(b.name));
    return copy;
  }, [archivedCommitments]);

  function openEditForCommitment(c: CommitmentView) {
    const fields = editPayloadsById[c.id];
    if (!fields) return;
    setEditCtx({ id: c.id, fields, displayPerPay: c.perPay });
  }

  function renderRowMenu(c: CommitmentView, opts: { archived: boolean }) {
    const nextIso = c.nextDueDateIso;
    const menuOpen = menuId === c.id;
    return (
      <>
        {menuOpen ? (
          <div
            role="menu"
            ref={rowMenuRef}
            className="glass-heavy absolute right-2 top-11 z-30 min-w-[200px] rounded-[var(--radius-md)] border border-white/12 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
            style={{
              backgroundColor: "rgba(20, 26, 23, 0.92)",
              backdropFilter: "blur(40px) saturate(180%)",
            }}
          >
            {opts.archived ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink)] hover:bg-white/6"
                  onClick={() => {
                    setMenuId(null);
                    startTransition(async () => {
                      try {
                        await restoreCommitmentAction(c.id);
                        router.refresh();
                      } catch {
                        /* surface via toast later */
                      }
                    });
                  }}
                >
                  Restore
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink)] hover:bg-white/6"
                  onClick={() => {
                    setMenuId(null);
                    openEditForCommitment(c);
                  }}
                >
                  Edit details
                </button>
              </>
            ) : (
              <>
                {nextIso ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink)] hover:bg-white/6"
                    onClick={() => {
                      setMenuId(null);
                      setSkipCtx({
                        id: c.id,
                        name: c.name,
                        amount: c.amount,
                        originalDateIso: nextIso,
                      });
                    }}
                  >
                    Skip next payment
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink)] hover:bg-white/6"
                  onClick={() => {
                    setMenuId(null);
                    openEditForCommitment(c);
                  }}
                >
                  Edit details
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink-2)] hover:bg-white/6"
                  onClick={() => {
                    setMenuId(null);
                    setArchiveCtx({ id: c.id, name: c.name, heldFormatted: formatAud(c.reserved) });
                  }}
                >
                  Archive
                </button>
              </>
            )}
          </div>
        ) : null}
      </>
    );
  }

  function renderCommitmentRow(c: CommitmentView, archived: boolean) {
    const pct = Math.min(Math.round(c.percentFunded), 100);
    const tertiary = c.subcategory ? `${c.category} · ${c.subcategory}` : c.category;
    return (
      <li key={c.id} className={cn("relative", archived && "opacity-60")}>
        <SurfaceCard className="border-white/8 !p-0 transition-colors hover:border-white/14">
          <KebabRow
            onTap={() => {
              if (!archived) router.push(`/commitments/${c.id}`);
            }}
            onKebabTap={() => setMenuId((id) => (id === c.id ? null : c.id))}
            className="items-stretch"
          >
            <div className="grid min-w-0 grid-cols-[1fr_auto] gap-3 px-2 py-3.5 pr-1">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[color:var(--keel-ink)]">{c.name}</p>
                <p className="mt-0.5 text-[12px] text-[color:var(--keel-ink-4)]">
                  {sentenceCaseFrequency(c.frequency)} · Due {c.nextDueDate}
                </p>
                <p className="mt-0.5 text-[11px] text-[color:var(--keel-ink-5)]">{tertiary}</p>
              </div>
              <div className="flex flex-col items-end text-right">
                <p className="font-mono text-[14px] font-medium tabular-nums text-[color:var(--keel-ink)]">
                  {formatAud(c.amount)}
                </p>
                <p className="mt-0.5 max-w-[140px] text-[11px] leading-snug text-[color:var(--keel-ink-4)]">
                  {pct}% funded toward next due date
                </p>
              </div>
              <div className="col-span-2 mt-2 h-[3px] overflow-hidden rounded-sm bg-[var(--keel-ink-6)]">
                <div
                  className="h-full rounded-sm bg-[color:var(--keel-safe-soft)] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </KebabRow>
        </SurfaceCard>
        {renderRowMenu(c, { archived })}
      </li>
    );
  }

  if (commitments.length === 0 && archivedCommitments.length === 0) {
    return (
      <AppShell title="Commitments" currentPath="/commitments">
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-[var(--radius-md)] glass-clear px-6 py-12 text-center">
          <WaterlineGlyph />
          <p className="text-[15px] font-medium text-[color:var(--keel-ink)]">
            Your recurring commitments go here.
          </p>
          <p className="mt-2 max-w-[280px] text-sm leading-relaxed text-[color:var(--keel-ink-3)]">
            Tap + to add your first one.
          </p>
        </div>
        <FloatingAddButton href="/capture?kind=commitment" label="Add commitment" />
      </AppShell>
    );
  }

  return (
    <AppShell title="Commitments" currentPath="/commitments">
      <div className="glass-heavy mb-4 rounded-[var(--radius-md)] border border-white/10 px-5 py-4 shadow-[var(--glass-inset-highlight-heavy)]">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
          Overview
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
              Count
            </p>
            <p className="mt-1 font-mono text-[16px] font-medium tabular-nums text-[color:var(--keel-ink)]">
              {commitments.length}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
              Reserved now
            </p>
            <p className="mt-1 font-mono text-[16px] font-medium tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(summaryReserved)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[color:var(--keel-ink-5)]">
              Annualized
            </p>
            <p className="mt-1 font-mono text-[16px] font-medium tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(summaryAnnualized)}
            </p>
          </div>
        </div>
      </div>

      <div
        className="glass-heavy mb-4 flex rounded-[999px] border border-white/10 p-1 shadow-[var(--glass-inset-highlight-heavy)]"
        role="tablist"
        aria-label="Sort commitments"
      >
        {(
          [
            ["due", "Due date"],
            ["amount", "Amount"],
            ["name", "Name"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={sort === id}
            onClick={() => setSort(id)}
            className={cn(
              "flex-1 rounded-[999px] px-2 py-2 text-center text-[13px] font-medium transition-colors duration-200",
              sort === id
                ? "bg-[rgba(240,235,220,0.08)] text-[color:var(--keel-ink)]"
                : "text-[color:var(--keel-ink-4)] hover:text-[color:var(--keel-ink-2)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {commitments.length === 0 ? (
        <p className="py-6 text-center text-sm text-[color:var(--keel-ink-4)]">
          No active commitments. Restore one from archived below if you have any.
        </p>
      ) : (
        <div className="space-y-1 pb-4">
          {groups.map((group) => (
            <section key={group.label}>
              <CategoryGroupHeader label={group.label.toUpperCase()} count={group.rows.length} />
              <ul className="relative space-y-2">
                {group.rows.map((c) => renderCommitmentRow(c, false))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {archivedCommitments.length > 0 ? (
        <section className="mb-6">
          <CategoryGroupHeader
            label="ARCHIVED"
            count={archivedCommitments.length}
            action={{
              label: archivedExpanded ? "Hide" : "Show",
              onTap: () => setArchivedExpanded((e) => !e),
            }}
          />
          {archivedExpanded ? (
            <ul className="relative space-y-2">
              {archivedSorted.map((c) => renderCommitmentRow(c, true))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <CommitmentSkipSheet
        open={Boolean(skipCtx)}
        onClose={() => setSkipCtx(null)}
        commitmentId={skipCtx?.id ?? ""}
        commitmentName={skipCtx?.name ?? ""}
        amount={skipCtx?.amount ?? 0}
        originalDateIso={skipCtx?.originalDateIso ?? ""}
        goals={goals}
        baselineOrdered={skipPreview.baselineOrdered}
        startingAvailableMoney={skipPreview.startingAvailableMoney}
        existingCommitmentSkips={skipPreview.existingCommitmentSkips}
      />

      <CommitmentArchiveSheet
        open={Boolean(archiveCtx)}
        onClose={() => setArchiveCtx(null)}
        commitmentId={archiveCtx?.id ?? ""}
        commitmentName={archiveCtx?.name ?? ""}
        heldFormatted={archiveCtx?.heldFormatted}
      />

      {editCtx ? (
        <CommitmentEditSheet
          open
          onClose={() => setEditCtx(null)}
          commitmentId={editCtx.id}
          commitment={editCtx.fields}
          displayPerPay={editCtx.displayPerPay}
          categories={categories}
          incomes={incomes}
          primaryIncomeId={primaryIncomeId}
        />
      ) : null}

      <FloatingAddButton href="/capture?kind=commitment" label="Add commitment" />
    </AppShell>
  );
}
