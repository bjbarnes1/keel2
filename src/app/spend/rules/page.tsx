/**
 * Merchant memo rules applied on Up sync (and reusable for future auto-taggers).
 *
 * @module app/spend/rules
 */

import Link from "next/link";

import { createSpendRuleAction, deleteSpendRuleAction } from "@/app/actions/spend-rules";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";
import { getCategoryOptions, listSpendCategorisationRules } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function SpendRulesPage() {
  const [rules, categories] = await Promise.all([listSpendCategorisationRules(), getCategoryOptions()]);

  return (
    <AppShell title="Spend rules" currentPath="/spend" backHref="/spend">
      <SurfaceCard className="mb-4">
        <p className="text-sm text-muted-foreground">
          Case-insensitive substring match on transaction memo. Higher priority runs first.
        </p>
      </SurfaceCard>

      <form action={createSpendRuleAction} className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Memo contains</label>
          <input name="pattern" required className="mt-1 block w-56 rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Category</label>
          <select name="categoryId" required className="mt-1 block w-48 rounded-md border border-border bg-background px-2 py-1 text-sm">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Priority</label>
          <input name="priority" type="number" defaultValue={0} className="mt-1 block w-24 rounded-md border border-border bg-background px-2 py-1 text-sm" />
        </div>
        <SubmitButton label="Add rule" pendingLabel="Saving…" />
      </form>

      <div className="space-y-2">
        {rules.length === 0 ? (
          <SurfaceCard>
            <p className="text-sm text-muted-foreground">No rules yet.</p>
          </SurfaceCard>
        ) : (
          rules.map((r) => (
            <SurfaceCard key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  “{r.pattern}” → {r.categoryName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.matchKind} · priority {r.priority}
                </p>
              </div>
              <form action={deleteSpendRuleAction}>
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton label="Delete" pendingLabel="…" variant="outline" className="text-xs" />
              </form>
            </SurfaceCard>
          ))
        )}
      </div>

      <p className="mt-6 text-sm">
        <Link href="/spend/up" className="text-primary">
          ← Up sync
        </Link>
      </p>
    </AppShell>
  );
}
