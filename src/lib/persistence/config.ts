/**
 * Environment capability flags for persistence and auth.
 *
 * `hasConfiguredDatabase` is intentionally loose — only checks that `DATABASE_URL` is
 * non-empty. Invalid URLs still fail fast on first Prisma connect (better than silently
 * treating “placeholder” strings as disconnected).
 *
 * @module lib/persistence/config
 */

/** `true` when a Postgres URL is present (Prisma + `pg` pool may be used). */
export function hasConfiguredDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/** Minimum env vars required for Supabase browser + server clients. */
export function hasSupabaseAuthConfigured() {
  return (
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

/** True on Vercel production builds (used for stricter guards in a few code paths). */
export function isHostedProduction() {
  return process.env.NODE_ENV === "production" && process.env.VERCEL === "1";
}
