import Link from "next/link";

import { createBudgetInviteAction } from "@/app/actions/keel";
import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { getBudgetMembers } from "@/lib/persistence/keel-store";

export const dynamic = "force-dynamic";

export default async function BudgetMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const members = await getBudgetMembers();

  return (
    <AppShell title="Household" currentPath="/budget/members" backHref="/">
      <div className="space-y-4">
        <SurfaceCard className="space-y-3">
          <p className="text-sm font-medium">Members</p>
          <p className="text-sm text-muted-foreground">
            Everyone in this household can see and edit the same budget.
          </p>
        </SurfaceCard>

        <div className="space-y-2">
          {members.map((member) => (
            <SurfaceCard key={member.userId} className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{member.name || member.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">{member.email}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {member.role}
              </span>
            </SurfaceCard>
          ))}
        </div>

        <SurfaceCard className="space-y-3">
          <p className="text-sm font-medium">Invite someone</p>
          <form action={createBudgetInviteAction} className="flex items-center gap-2">
            <input
              name="email"
              type="email"
              placeholder="person@example.com"
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none"
            />
            <button
              type="submit"
              className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
            >
              Invite
            </button>
          </form>
          <p className="text-xs text-muted-foreground">
            This creates a link you can share. Email sending comes later.
          </p>
        </SurfaceCard>

        {invite ? (
          <SurfaceCard className="space-y-2 border-emerald-500/30 bg-emerald-500/10">
            <p className="text-sm font-medium text-emerald-500">Invite link</p>
            <p className="break-all text-xs text-muted-foreground">
              <Link className="underline" href={`/budget/invite/${invite}`}>
                {`/budget/invite/${invite}`}
              </Link>
            </p>
          </SurfaceCard>
        ) : null}
      </div>
    </AppShell>
  );
}

