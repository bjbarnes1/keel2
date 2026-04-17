import { acceptBudgetInviteAction } from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AppShell title="Join household" currentPath="/settings" backHref="/settings/household">
      <div className="space-y-4">
        <SurfaceCard className="space-y-2">
          <p className="text-sm font-medium">Accept invite</p>
          <p className="text-sm text-muted-foreground">
            Sign in with the invited email address, then accept to join the shared budget.
          </p>
        </SurfaceCard>

        <form action={acceptBudgetInviteAction} className="space-y-3">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white"
          >
            Accept invite
          </button>
        </form>
      </div>
    </AppShell>
  );
}

