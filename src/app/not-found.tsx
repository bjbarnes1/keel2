import Link from "next/link";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function NotFound() {
  return (
    <AppShell title="Not found" currentPath="/">
      <SurfaceCard className="text-center">
        <h2 className="text-lg font-semibold">That screen does not exist</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Head back to the dashboard and keep building from there.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
        >
          Go home
        </Link>
      </SurfaceCard>
    </AppShell>
  );
}
