"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { ScheduledCashflowEvent } from "@/lib/engine/skips";
import { annualizeAmount } from "@/lib/engine/keel";
import type { CommitmentSkipInput, CommitmentView } from "@/lib/types";
import { cn, formatAud } from "@/lib/utils";

import { CommitmentArchiveSheet } from "@/components/keel/commitment-archive-sheet";
import { CommitmentSkipSheet } from "@/components/keel/commitment-skip-sheet";
import { CategoryGroupHeader } from "@/components/keel/category-group-header";
import { FloatingAddButton } from "@/components/keel/floating-add-button";
import { CommitmentCardContent, EmptyState, SurfaceCard } from "@/components/keel/primitives";
import { SwipeActionRow } from "@/components/keel/swipe-action-row";

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
  const [skipCtx, setSkipCtx] = useState<{
    id: string;
    name: string;
    amount: number;
    originalDateIso: string;
  } | null>(null);
  const [archiveCtx, setArchiveCtx] = useState<{ id: string; name: string } | null>(null);

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

      <div className="mb-3 flex flex-wrap gap-2">
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
            onClick={() => setSort(id)}
            className={cn(
              "rounded-[var(--radius-pill)] px-3 py-1.5 text-xs font-medium transition-colors",
              sort === id
                ? "glass-tint-safe text-[color:var(--keel-ink)]"
                : "glass-clear text-[color:var(--keel-ink-3)]",
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
                return (
                  <li key={c.id}>
                    <SwipeActionRow
                      secondaryAction={{
                        label: "Skip next",
                        tint: "neutral",
                        onPress: () => {
                          if (!nextIso) return;
                          setSkipCtx({
                            id: c.id,
                            name: c.name,
                            amount: c.amount,
                            originalDateIso: nextIso,
                          });
                        },
                      }}
                      primaryAction={{
                        label: "Archive",
                        tint: "attend",
                        onPress: () => setArchiveCtx({ id: c.id, name: c.name }),
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/commitments/${c.id}`)}
                        className="block w-full text-left"
                      >
                        <SurfaceCard className="border-white/8 !p-4 transition-colors hover:border-white/14">
                          <CommitmentCardContent commitment={c} />
                        </SurfaceCard>
                      </button>
                    </SwipeActionRow>
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
