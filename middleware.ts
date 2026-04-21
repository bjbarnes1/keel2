/**
 * Next.js middleware (edge): Supabase cookie session refresh + route protection.
 *
 * Architecture:
 * - Creates a request-scoped Supabase SSR client so `getUser()` sees up-to-date JWT state.
 * - Unauthenticated visitors to private pages are redirected to `/login?next=…`.
 * - `/api/*` is treated as public at this layer; each API route must independently
 *   verify the session via `createSupabaseServerClient()` so clients get JSON errors
 *   instead of HTML redirects.
 *
 * @module middleware
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Paths that never require a Supabase user (static internals, auth flows, programmatic APIs). */
function isPublicPath(pathname: string) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/auth")) return true;
  if (pathname === "/login") return true;
  if (pathname === "/") return false;
  return false;
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as CookieOptions);
          });
        },
      },
    },
  );

  // Refresh session if needed (critical for Server Components).
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};

