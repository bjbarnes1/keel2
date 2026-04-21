/**
 * Browser-side Supabase client for Client Components.
 *
 * Uses `@supabase/ssr`’s `createBrowserClient` so session cookies stay compatible
 * with the server/middleware stack. Only import this from `"use client"` modules.
 *
 * @module lib/supabase/client
 */

import { createBrowserClient } from "@supabase/ssr";

/** Single-flight browser client; safe to call from event handlers / effects. */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

