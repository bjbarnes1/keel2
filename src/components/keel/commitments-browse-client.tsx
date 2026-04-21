"use client";

/**
 * Main commitments browse experience: grouping, row kebab actions, skip entry points.
 *
 * @module components/keel/commitments-browse-client
 */

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ScheduledCashflowEvent } from "@/lib/engine/skips";
import { annualizeAmount } from "@/lib/engine/keel";
import type { CommitmentSkipInput, CommitmentView } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

import { CommitmentArchiveSheet } from "@/components/keel/commitment-archive-sheet";
import { CommitmentSkipSheet } from "@/components/keel/commitment-skip-sheet";
import { CategoryGroupHeader } from "@/components/keel/category-group-header";
import { FloatingAddButton } from "@/components/keel/floating-add-button";
import { CommitmentCardContent, EmptyState, SurfaceCard } from "@/components/keel/primitives";

type GoalOption = { id: string; name: string };

type SkipPreview = {
  baselineOrdered: ScheduledCashflowEvent[];
  startingAvailableMoney: number;
  existingCommitmentSkips: CommitmentSkipInput[];
};

type Props = {
  commitments: CommitmentView[];
  goals: GoalOption[];
  skipPreview: SkipPreview;
  summaryReserved: number;
  summaryAnnualized: number;
};

type SortMode = "due" | "amount" | "name";

const HOUSING = "Housing";

export function CommitmentsBrowseClient({
  commitments,
  goals,
  skipPreview,
  summaryReserved,
  summaryAnnualized,
}: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<SortMode>("due");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [skipCtx, setSkipCtx] = useState<{
    id: string;
    name: string;
    amount: number;
    originalDateIso: string;
  } | null>(null);
  const [archiveCtx, setArchiveCtx] = useState<{ id: string; name: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
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

  if (commitments.length === 0) {
    return (
      <>
        <EmptyState
          title="No commitments yet"
          description="Add rent, utilities, subscriptions, and other recurring costs so Keel can reserve per pay."
          actionHref="/commitments/new"
          actionLabel="Add a commitment"
        />
        <FloatingAddButton href="/capture?kind=commitment" label="Add with capture" />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 rounded-[var(--radius-md)] glass-clear px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--keel-ink-4)]">
          Overview
        </p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <p className="text-[color:var(--keel-ink-4)]">Count</p>
            <p className="font-mono text-[17px] font-semibold tabular-nums text-[color:var(--keel-ink)]">
              {commitments.length}
            </p>
          </div>
          <div>
            <p className="text-[color:var(--keel-ink-4)]">Reserved now</p>
            <p className="font-mono text-[17px] font-semibold tabular-nums text-[color:var(--keel-safe-soft)]">
              {formatAud(summaryReserved)}
            </p>
          </div>
          <div>
            <p className="text-[color:var(--keel-ink-4)]">Annualized</p>
            <p className="font-mono text-[17px] font-semibold tabular-nums text-[color:var(--keel-ink)]">
              {formatAud(summaryAnnualized)}
            </p>
          </div>
        </div>
      </div>

      <div
        className="mb-3 inline-flex rounded-[var(--radius-pill)] p-0.5 glass-clear"
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
              "rounded-[calc(var(--radius-pill)-2px)] px-3 py-1.5 text-xs font-medium transition-colors",
              sort === id
                ? "glass-tint-safe text-[color:var(--keel-ink)] shadow-sm"
                : "text-[color:var(--keel-ink-3)] hover:text-[color:var(--keel-ink-2)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4 pb-4">
        {groups.map((group) => (
          <section key={group.label}>
            <CategoryGroupHeader label={group.label} count={group.rows.length} />
            <ul className="space-y-2">
              {group.rows.map((c) => {
                const nextIso = c.nextDueDateIso;
                const menuOpen = menuId === c.id;

                return (
                  <li key={c.id} className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/commitments/${c.id}`)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <SurfaceCard className="border-white/8 !p-4 transition-colors hover:border-white/14">
                        <CommitmentCardContent commitment={c} />
                      </SurfaceCard>
                    </button>
                    <div
                      className="relative flex shrink-0 flex-col justify-center"
                      ref={menuOpen ? menuRef : undefined}
                    >
                      <button
                        type="button"
                        aria-label={`Actions for ${c.name}`}
                        aria-expanded={menuOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((id) => (id === c.id ? null : c.id));
                        }}
                        className="glass-clear inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--keel-ink-2)] hover:text-[color:var(--keel-ink)]"
                      >
                        <MoreHorizontal className="h-5 w-5" />
                      </button>
                      {menuOpen ? (
                        <div
                          role="menu"
                          className="glass-heavy absolute right-0 top-full z-30 mt-1 min-w-[200px] rounded-[var(--radius-md)] border border-white/12 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                          style={{
                            backgroundColor: "rgba(20, 26, 23, 0.92)",
                            backdropFilter: "blur(40px) saturate(180%)",
                          }}
                        >
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
                              router.push(`/commitments/${c.id}`);
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink-2)] hover:bg-white/6"
                            onClick={() => {
                              setMenuId(null);
                              setArchiveCtx({ id: c.id, name: c.name });
                            }}
                          >
                            Archive
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <p className="pb-6 text-center text-sm text-[color:var(--keel-ink-3)]">
        Prefer a form?{" "}
        <Link href="/commitments/new" className="font-medium text-[color:var(--keel-safe-soft)] hover:underline">
          Add manually
        </Link>
      </p>

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
      />

      <FloatingAddButton href="/capture?kind=commitment" label="Add with capture" />
    </>
  );
}
