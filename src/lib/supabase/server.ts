/**
 * Server-side Supabase client (Server Components, Server Actions, Route Handlers).
 *
 * Reads/writes auth cookies through Next’s `cookies()` API. `setAll` is wrapped in
 * try/catch because some server contexts (pure RSC renders) cannot mutate cookies —
 * middleware is responsible for refreshing sessions in those cases.
 *
 * @module lib/supabase/server
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Builds a Supabase client bound to the current request’s cookie jar.
 *
 * Async because `cookies()` is async in Next 15+.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options as CookieOptions);
            });
          } catch {
            // Server Components can't always set cookies. Middleware handles refresh writes.
          }
        },
      },
    },
  );
}

