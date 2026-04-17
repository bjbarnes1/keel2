import { createSpendAccountAction } from "@/app/actions/keel-spend";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { SubmitButton } from "@/components/keel/submit-button";

export const dynamic = "force-dynamic";

export default function NewSpendAccountPage() {
  return (
    <AppShell title="New account" currentPath="/spend" backHref="/spend">
      <SurfaceCard>
        <form action={createSpendAccountAction} className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="text-muted-foreground">Account label</span>
            <input
              name="name"
              required
              placeholder="Everyday account"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-3">
            <label className="block space-y-2 text-sm">
              <span className="text-muted-foreground">Bank name (optional)</span>
              <input
                name="bankName"
                placeholder="e.g. Commonwealth Bank"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span className="text-muted-foreground">BSB (optional)</span>
                <input
                  name="bsb"
                  inputMode="numeric"
                  placeholder="e.g. 123-456"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span className="text-muted-foreground">Account number (optional)</span>
                <input
                  name="accountNumber"
                  inputMode="numeric"
                  placeholder="e.g. 12345678"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono"
                />
              </label>
            </div>
            <label className="block space-y-2 text-sm">
              <span className="text-muted-foreground">Account name (optional)</span>
              <input
                name="accountName"
                placeholder="e.g. Ben Barnes"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            This is only a label for your import — connect it to the CSV you download from your bank.
          </p>
          <SubmitButton
            label="Create account"
            pendingLabel="Creating…"
            className="py-3"
          />
        </form>
      </SurfaceCard>
    </AppShell>
  );
}
