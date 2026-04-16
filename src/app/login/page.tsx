"use client";

import { useMemo, useState } from "react";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const nextPath = useMemo(() => searchParams.next ?? "/", [searchParams.next]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function sendLink() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setStatus("sending");
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            nextPath,
          )}`,
        },
      });

      if (error) {
        throw error;
      }

      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Unable to send link.");
    }
  }

  return (
    <AppShell title="Sign in" currentPath="/login" backHref="/">
      <div className="space-y-6">
        <SurfaceCard className="space-y-3">
          <p className="text-sm font-medium">Email sign-in</p>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you a sign-in link. No password needed.
          </p>
        </SurfaceCard>

        <label className="block space-y-2">
          <span className="text-sm text-muted-foreground">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>

        {status === "sent" ? (
          <SurfaceCard className="border-emerald-500/30 bg-emerald-500/10">
            <p className="text-sm font-medium text-emerald-500">Check your inbox</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Click the sign-in link we sent to {email.trim()}.
            </p>
          </SurfaceCard>
        ) : null}

        {status === "error" && errorMessage ? (
          <SurfaceCard className="border-red-500/30 bg-red-500/10">
            <p className="text-sm font-medium text-red-500">Couldn&apos;t send link</p>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
          </SurfaceCard>
        ) : null}

        <button
          type="button"
          onClick={sendLink}
          disabled={status === "sending" || !email.trim()}
          className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Send sign-in link"}
        </button>
      </div>
    </AppShell>
  );
}

