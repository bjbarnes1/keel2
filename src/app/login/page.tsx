"use client";

/**
 * Email magic-link login via Supabase (`createSupabaseBrowserClient`).
 *
 * Client Component: reads `searchParams` for post-auth redirect target (`next`).
 *
 * @module app/login/page
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AppShell, SurfaceCard } from "@/components/keel/primitives";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const nextPath = useMemo(() => searchParams.next ?? "/", [searchParams.next]);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"link" | "code">("link");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function sendLink() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;

    setStatus("sending");
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      // Supabase sends a magic link by default; a 6-digit code appears in the email only if the
      // project’s "Magic link" auth email template includes {{ .Token }} (Dashboard → Auth → Email templates).
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

  async function verifyCode() {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedCode = code.trim();
    if (!trimmedEmail || !trimmedCode) return;

    setStatus("sending");
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedCode,
        type: "email",
      });

      if (error) {
        throw error;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Unable to verify code.");
    }
  }

  return (
    <AppShell title="Sign in" currentPath="/login" backHref="/">
      <div className="space-y-6">
        <SurfaceCard className="space-y-3">
          <p className="text-sm font-medium">Email sign-in</p>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you a sign-in link (and a 6-digit code too, if your Supabase email template
            includes it—see Auth → Email templates → Magic link).
          </p>
        </SurfaceCard>

        {searchParams.error ? (
          <SurfaceCard className="border-red-500/30 bg-red-500/10">
            <p className="text-sm font-medium text-red-500">Sign-in failed</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {searchParams.error}
            </p>
          </SurfaceCard>
        ) : null}

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
              Use the sign-in link we sent to {email.trim()}
              {", or the 6-digit code from that same email if it appears."}
            </p>
            <button
              type="button"
              onClick={() => setMode("code")}
              className="mt-3 text-left text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Enter 6-digit code
            </button>
          </SurfaceCard>
        ) : null}

        {status === "error" && errorMessage ? (
          <SurfaceCard className="border-red-500/30 bg-red-500/10">
            <p className="text-sm font-medium text-red-500">Couldn&apos;t send link</p>
            <p className="mt-2 text-sm text-muted-foreground">{errorMessage}</p>
          </SurfaceCard>
        ) : null}

        {mode === "code" ? (
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-sm text-muted-foreground">6-digit code</span>
              <input
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\s+/g, ""))}
                className="w-full rounded-2xl border border-border bg-card px-4 py-4 outline-none"
                placeholder="123456"
                autoComplete="one-time-code"
              />
            </label>

            <button
              type="button"
              onClick={verifyCode}
              disabled={status === "sending" || !email.trim() || !code.trim()}
              className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "sending" ? "Verifying…" : "Verify code"}
            </button>

            <button
              type="button"
              onClick={() => setMode("link")}
              className="block w-full rounded-2xl border border-border bg-card px-4 py-4 text-center text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Use link instead
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={sendLink}
            disabled={status === "sending" || !email.trim()}
            className="block w-full rounded-2xl bg-primary px-4 py-4 text-center text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Send sign-in link"}
          </button>
        )}
      </div>
    </AppShell>
  );
}

