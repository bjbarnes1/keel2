/**
 * Per-user AI rate limiting (abuse protection + cost control).
 *
 * **Production path:** atomic upsert into `AiRateLimit` via raw SQL — Prisma’s
 * `upsert` cannot express the “reset counter when window rolls” logic in one round
 * trip without races under concurrency.
 *
 * **Local-dev fallback:** in-memory sliding window when Postgres isn’t configured.
 * Process-local only; not suitable horizontally — acceptable for `vercel dev`.
 *
 * @throws Error with message `RATE_LIMITED` when the cap is exceeded.
 * @module lib/ai/rate-limit
 */

import { getPrismaClient } from "@/lib/prisma";

function isDbAvailable() {
  const url = process.env.DATABASE_URL ?? "";
  return (
    Boolean(url) &&
    !url.includes("johndoe:randompassword") &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

// In-memory fallback for local dev without a database.
type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();

function assertInMemory(userId: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(userId) ?? { timestamps: [] };
  const cutoff = now - windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t >= cutoff);
  if (bucket.timestamps.length >= limit) throw new Error("RATE_LIMITED");
  bucket.timestamps.push(now);
  buckets.set(userId, bucket);
}

async function assertDb(userId: string, limit: number, windowMs: number) {
  const prisma = getPrismaClient();
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  // Single atomic upsert: reset the counter when the window rolls over,
  // otherwise increment. RETURNING gives the post-write value.
  const rows = await prisma.$queryRaw<Array<{ calls: number }>>`
    INSERT INTO "AiRateLimit" ("userId", "windowStart", "calls")
    VALUES (${userId}, ${windowStart}, 1)
    ON CONFLICT ("userId") DO UPDATE
      SET
        "calls" = CASE
          WHEN "AiRateLimit"."windowStart" = EXCLUDED."windowStart"
            THEN "AiRateLimit"."calls" + 1
          ELSE 1
        END,
        "windowStart" = EXCLUDED."windowStart"
    RETURNING "calls"
  `;

  const calls = Number(rows[0]?.calls ?? 1);
  if (calls > limit) throw new Error("RATE_LIMITED");
}

/**
 * Enforces a fixed-window counter per user. Call **before** expensive AI work.
 *
 * @param input.limit max calls allowed within each `windowMs` bucket
 */
export async function assertWithinAiRateLimit(input: {
  userId: string;
  limit: number;
  windowMs: number;
}) {
  if (isDbAvailable()) {
    return assertDb(input.userId, input.limit, input.windowMs);
  }
  assertInMemory(input.userId, input.limit, input.windowMs);
}
