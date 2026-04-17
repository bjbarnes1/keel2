import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/";

  try {
    const supabase = await createSupabaseServerClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
    } else if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        type: type as never,
        token_hash: tokenHash,
      });
      if (error) throw error;
    }
  } catch (err) {
    const redirectUrl = new URL("/login", url.origin);
    redirectUrl.searchParams.set("next", next);
    redirectUrl.searchParams.set(
      "error",
      err instanceof Error ? err.message : "Unable to sign in.",
    );
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

