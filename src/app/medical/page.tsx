/**
 * Medical sub-items + rebate queue: manual workflows for household health spend.
 *
 * @module app/medical/page
 */

import {
  createMedicalSubItemAction,
  deleteMedicalSubItemAction,
  recordRebateMatchAction,
  setRebateExpectationAction,
} from "@/app/actions/medical";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { getSpendReconciliationQueue, listMedicalSubItems, listOutstandingRebates } from "@/lib/persistence/keel-store";
import { formatAud } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MedicalPage() {
  const [items, rebates, queue] = await Promise.all([
    listMedicalSubItems(),
    listOutstandingRebates(),
    getSpendReconciliationQueue(30),
  ]);

  return (
    <AppShell title="Medical" currentPath="/medical" backHref="/">
      <SurfaceCard className="mb-4">
        <p className="text-sm text-muted-foreground">
          Track expected medical costs by line item, flag rebates on spend rows, and manually match rebate deposits
          back to expenses.
        </p>
      </SurfaceCard>

      <h2 className="mb-2 text-lg font-semibold">Sub-items</h2>
      <form action={createMedicalSubItemAction} className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Name</label>
          <input name="name" required className="mt-1 block w-48 rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Expected (AUD)</label>
          <input name="expectedTotal" type="number" step="0.01" className="mt-1 block w-32 rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </div>
        <SubmitButton label="Add" pendingLabel="Saving…" />
      </form>

      <div className="space-y-2">
        {items.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm text-muted-foreground">No medical lines yet.</p>
          </SurfaceCard>
        ) : (
          items.map((m) => (
            <SurfaceCard key={m.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Spent {formatAud(m.spent)}
                  {m.expectedTotal != null ? ` · expected ${formatAud(m.expectedTotal)}` : ""}
                </p>
              </div>
              <form action={deleteMedicalSubItemAction}>
                <input type="hidden" name="id" value={m.id} />
                <SubmitButton label="Remove" pendingLabel="…" variant="outline" className="text-xs" />
              </form>
            </SurfaceCard>
          ))
        )}
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Rebate queue</h2>
      <div className="space-y-2">
        {rebates.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm text-muted-foreground">No open rebate flags.</p>
          </SurfaceCard>
        ) : (
          rebates.map((r) => (
            <SurfaceCard key={r.id} className="text-sm">
              <p className="font-medium">{r.memo}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.postedOn} · expected {formatAud(r.expected)} · matched {formatAud(r.matched)}
              </p>
            </SurfaceCard>
          ))
        )}
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Flag rebate on a transaction</h2>
      <SurfaceCard>
        <form action={setRebateExpectationAction} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Transaction id</label>
            <input name="transactionId" required className="mt-1 block w-full min-w-[220px] rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Expected rebate (AUD)</label>
            <input name="expectedAmount" type="number" step="0.01" required className="mt-1 block w-36 rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <SubmitButton label="Save" pendingLabel="Saving…" />
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Copy an id from Reconcile or Recent activity. Use positive dollars for the expected rebate total.
        </p>
      </SurfaceCard>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Match rebate deposit (partial)</h2>
      <SurfaceCard>
        <form action={recordRebateMatchAction} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Expense transaction id</label>
            <input name="expenseTransactionId" required className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Credit (deposit) transaction id</label>
            <input name="creditTransactionId" required className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Amount matched (AUD)</label>
            <input name="amount" type="number" step="0.01" required className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Notes (optional)</label>
            <input name="notes" className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </div>
          <div className="md:col-span-2">
            <SubmitButton label="Record match" pendingLabel="Saving…" />
          </div>
        </form>
      </SurfaceCard>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Recent uncategorised (ids)</h2>
      <div className="space-y-1 text-xs text-muted-foreground">
        {queue.slice(0, 8).map((t) => (
          <SurfaceCard key={t.id} className="!py-2">
            <span className="font-mono text-[11px] text-foreground">{t.id}</span> · {t.memo.slice(0, 60)}
          </SurfaceCard>
        ))}
      </div>
    </AppShell>
  );
}
