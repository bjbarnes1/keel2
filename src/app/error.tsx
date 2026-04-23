"use client";

/**
 * App Router error boundary: friendly recovery UI when a route segment throws.
 *
 * @module app/error
 */

import Link from "next/link";
import { useEffect } from "react";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook for client-side error reporting when a tracker is wired in.
    if (process.env.NODE_ENV === "development") {
      console.error("[app/error]", error);
    }
  }, [error]);

  return (
    <AppShell title="Something went wrong" currentPath="/">
      <SurfaceCard className="text-center">
        <p className="text-sm text-[color:var(--keel-ink-3)]">
          Keel hit an unexpected snag loading this screen. Your data is still safe — try again, or head home.
        </p>
        {error.digest ? (
          <p className="mt-2 font-mono text-[11px] text-[color:var(--keel-ink-5)]">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-[color:var(--keel-ink)]"
          >
            Go home
          </Link>
        </div>
      </SurfaceCard>
    </AppShell>
  );
}
