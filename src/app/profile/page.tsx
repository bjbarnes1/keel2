/**
 * Profile placeholder surface.
 *
 * // TODO: Profile screen pending design. Currently hidden from avatar menu.
 * // Restore Identity → Profile entry in `src/components/keel/avatar-menu.tsx` once content exists.
 *
 * @module app/profile/page
 */

import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function ProfilePage() {
  return (
    <AppShell title="Profile" currentPath="/profile" backHref="/">
      <SurfaceCard className="glass-clear">
        <p className="text-sm font-medium text-[color:var(--keel-ink)]">Coming soon</p>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--keel-ink-3)]">
          Profile details and preferences will live here once the design is ready.
        </p>
      </SurfaceCard>
    </AppShell>
  );
}
