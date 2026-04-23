/**
 * Global 404 page (App Router `not-found.tsx`).
 *
 * @module app/not-found
 */

import Link from "next/link";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function NotFound() {
  return (
    <AppShell title="Not found" currentPath="/">
      <SurfaceCard className="text-center">
        <h2 className="text-lg font-semibold">We can&apos;t find that screen</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old, or the page moved. Head home and pick up from your dashboard.
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
