import { createSpendAccountAction } from "@/app/actions/keel-spend";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";

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
          <p className="text-xs text-muted-foreground">
            This is only a label for your import — connect it to the CSV you download from your bank.
          </p>
          <button
            type="submit"
            className="w-full rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Create account
          </button>
        </form>
      </SurfaceCard>
    </AppShell>
  );
}
