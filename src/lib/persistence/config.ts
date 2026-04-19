export function hasConfiguredDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  return Boolean(url) && !url.includes("johndoe:randompassword");
}

export function hasSupabaseAuthConfigured() {
  return (
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function isHostedProduction() {
  return process.env.NODE_ENV === "production" && process.env.VERCEL === "1";
}
