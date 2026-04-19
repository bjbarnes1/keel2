// Fix #18: removed brittle "johndoe:randompassword" placeholder check.
// If DATABASE_URL is set but invalid, Prisma will fail loudly on first connection.
export function hasConfiguredDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
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
