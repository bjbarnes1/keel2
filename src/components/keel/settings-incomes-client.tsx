"use client";

/**
 * Incomes list with row kebab: edit sheet, set primary, archive (sheet).
 *
 * @module components/keel/settings-incomes-client
 */

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { setPrimaryIncomeAction } from "@/app/actions/keel";
import { IncomeArchiveSheet } from "@/components/keel/income-archive-sheet";
import type { IncomeEditFields } from "@/components/keel/income-edit-sheet";
import { IncomeEditSheet } from "@/components/keel/income-edit-sheet";
import { SurfaceCard } from "@/components/keel/primitives";
import { formatAud, sentenceCaseFrequency } from "@/lib/utils";

type IncomeRow = {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  nextPayDate: string;
};

type Props = {
  incomes: IncomeRow[];
  primaryIncomeId: string;
  editPayloads: IncomeEditFields[];
  initialEditId?: string;
};

export function SettingsIncomesClient({
  incomes,
  primaryIncomeId,
  editPayloads,
  initialEditId,
}: Props) {
  const router = useRouter();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [archiveCtx, setArchiveCtx] = useState<{ id: string; name: string } | null>(null);
  const [editIncomeId, setEditIncomeId] = useState<string | null>(() => {
    if (!initialEditId) return null;
    return editPayloads.some((e) => e.id === initialEditId) ? initialEditId : null;
  });
  const menuRef = useRef<HTMLDivElement>(null);

  const byEditId = useMemo(() => new Map(editPayloads.map((e) => [e.id, e])), [editPayloads]);

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuId(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

  function closeEditSheet() {
    setEditIncomeId(null);
    router.replace("/settings/incomes");
  }

  return (
    <>
      {incomes.map((income) => {
        const isPrimary = income.id === primaryIncomeId;
        const menuOpen = menuId === income.id;

        return (
          <SurfaceCard key={income.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{income.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sentenceCaseFrequency(income.frequency)} · Next pay {income.nextPayDate}
                </p>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <p className="font-mono text-sm font-semibold">{formatAud(income.amount)}</p>
                <div className="relative shrink-0" ref={menuOpen ? menuRef : undefined}>
                  <button
                    type="button"
                    aria-label="Income actions"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuId((id) => (id === income.id ? null : income.id))}
                    className="glass-clear inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {menuOpen ? (
                    <div
                      role="menu"
                      className="glass-heavy absolute right-0 top-full z-20 mt-1 min-w-[200px] rounded-[var(--radius-md)] border border-white/12 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                      style={{
                        backgroundColor: "rgba(20, 26, 23, 0.92)",
                        backdropFilter: "blur(40px) saturate(180%)",
                      }}
                    >
                      {byEditId.has(income.id) ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink)] hover:bg-white/6"
                          onClick={() => {
                            setMenuId(null);
                            setEditIncomeId(income.id);
                          }}
                        >
                          Edit (future)
                        </button>
                      ) : null}
                      {!isPrimary ? (
                        <form action={setPrimaryIncomeAction}>
                          <input type="hidden" name="incomeId" value={income.id} />
                          <button
                            type="submit"
                            role="menuitem"
                            className="w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink-2)] hover:bg-white/6"
                          >
                            Set primary
                          </button>
                        </form>
                      ) : null}
                      {incomes.length > 1 ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full px-3 py-2.5 text-left text-sm text-[color:var(--keel-ink-2)] hover:bg-white/6"
                          onClick={() => {
                            setMenuId(null);
                            setArchiveCtx({ id: income.id, name: income.name });
                          }}
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            {isPrimary ? (
              <p className="text-xs text-muted-foreground">Primary pay source for defaults.</p>
            ) : null}
          </SurfaceCard>
        );
      })}

      <IncomeEditSheet
        open={Boolean(editIncomeId && byEditId.get(editIncomeId ?? ""))}
        onClose={closeEditSheet}
        income={editIncomeId ? byEditId.get(editIncomeId) ?? null : null}
      />

      <IncomeArchiveSheet
        open={Boolean(archiveCtx)}
        onClose={() => setArchiveCtx(null)}
        incomeId={archiveCtx?.id ?? ""}
        incomeName={archiveCtx?.name ?? ""}
      />
    </>
  );
}
