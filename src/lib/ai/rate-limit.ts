/**
 * Per-user AI rate limiting (abuse protection + cost control).
 *
 * **Production path:** atomic upsert into `AiRateLimit` via raw SQL — Prisma’s
 * `upsert` cannot express the “reset counter when window rolls” logic in one round
 * trip without races under concurrency.
 *
 * **Daily cost ceiling:** `costCentsDay` accumulates against `dayStart` (UTC midnight).
 * Call {@link assertWithinAiCostCeil} before LLM work and {@link trackAnthropicCompletion}
 * after successful completions.
 *
 * **Local-dev fallback:** in-memory sliding window when Postgres isn’t configured.
 * Process-local only; not suitable horizontally — acceptable for `vercel dev`.
 *
 * @throws Error with message `RATE_LIMITED` when the cap is exceeded.
 * @module lib/ai/rate-limit
 */

import { estimateAnthropicCostCentsAud } from "@/lib/ai/pricing";
import { getPrismaClient } from "@/lib/prisma";

function isDbAvailable() {
  const url = process.env.DATABASE_URL ?? "";
  return (
    Boolean(url) &&
    !url.includes("johndoe:randompassword") &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

/** Default ~$0.50 AUD / day per user (50 cents). */
export function defaultAiCostCeilingCentsAud(): number {
  const raw = process.env.KEEL_AI_COST_CEILING_CENTS_AUD;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

function utcDayStartDate(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// In-memory fallback for local dev without a database.
type Bucket = {
  timestamps: number[];
  costDayKey?: number;
  costCentsDay?: number;
};
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

  const rows = await prisma.$queryRaw<Array<{ calls: number }>>`
    INSERT INTO "AiRateLimit" ("userId", "windowStart", "calls", "dayStart", "costCentsDay")
    VALUES (${userId}, ${windowStart}, 1, NULL, 0)
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

/**
 * Blocks further AI work when the user has exceeded the daily AUD-cent ceiling.
 */
export async function assertWithinAiCostCeil(input: {
  userId: string;
  ceilingCentsAud: number;
}): Promise<{ ok: true } | { ok: false }> {
  const ceiling = input.ceilingCentsAud;
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    return { ok: true };
  }

  const today = utcDayStartDate();

  if (isDbAvailable()) {
    const prisma = getPrismaClient();
    const rows = await prisma.$queryRaw<Array<{ costCentsDay: number | null; dayStart: Date | null }>>`
      SELECT "costCentsDay", "dayStart" FROM "AiRateLimit" WHERE "userId" = ${input.userId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ok: true };
    if (!row.dayStart || row.dayStart.getTime() !== today.getTime()) {
      return { ok: true };
    }
    if (Number(row.costCentsDay ?? 0) >= ceiling) {
      return { ok: false };
    }
    return { ok: true };
  }

  const bucket = buckets.get(input.userId) ?? { timestamps: [] };
  const dayKey = today.getTime();
  if (bucket.costDayKey !== dayKey) {
    bucket.costCentsDay = 0;
    bucket.costDayKey = dayKey;
  }
  if (Number(bucket.costCentsDay ?? 0) >= ceiling) {
    return { ok: false };
  }
  return { ok: true };
}

async function trackAiCostCentsDb(userId: string, deltaCentsAud: number) {
  const prisma = getPrismaClient();
  const hourMs = 60 * 60 * 1000;
  const windowStart = new Date(Math.floor(Date.now() / hourMs) * hourMs);
  const dayStart = utcDayStartDate();

  await prisma.$executeRaw`
    INSERT INTO "AiRateLimit" ("userId", "windowStart", "calls", "dayStart", "costCentsDay")
    VALUES (${userId}, ${windowStart}, 0, ${dayStart}, ${deltaCentsAud})
    ON CONFLICT ("userId") DO UPDATE SET
      "costCentsDay" = CASE
        WHEN "AiRateLimit"."dayStart" IS NULL OR "AiRateLimit"."dayStart" <> EXCLUDED."dayStart"
          THEN EXCLUDED."costCentsDay"
        ELSE "AiRateLimit"."costCentsDay" + EXCLUDED."costCentsDay"
      END,
      "dayStart" = EXCLUDED."dayStart"
  `;
}

function trackAiCostCentsMemory(userId: string, deltaCentsAud: number) {
  const today = utcDayStartDate();
  const dayKey = today.getTime();
  const bucket = buckets.get(userId) ?? { timestamps: [] };
  if (bucket.costDayKey !== dayKey) {
    bucket.costCentsDay = 0;
    bucket.costDayKey = dayKey;
  }
  bucket.costCentsDay = (bucket.costCentsDay ?? 0) + deltaCentsAud;
  buckets.set(userId, bucket);
}

/**
 * Adds estimated spend (AUD cents) to the user’s daily bucket.
 */
export async function trackAiCostCents(input: { userId: string; deltaCentsAud: number }) {
  if (!Number.isFinite(input.deltaCentsAud) || input.deltaCentsAud <= 0) {
    return;
  }
  if (isDbAvailable()) {
    await trackAiCostCentsDb(input.userId, Math.ceil(input.deltaCentsAud));
    return;
  }
  trackAiCostCentsMemory(input.userId, Math.ceil(input.deltaCentsAud));
}

/**
 * Estimates token usage cost and records it against the daily ceiling.
 */
export async function trackAnthropicCompletion(input: {
  userId: string;
  model: string;
  usage?: { input_tokens?: number; output_tokens?: number } | null;
}) {
  const inT = Number(input.usage?.input_tokens ?? 0);
  const outT = Number(input.usage?.output_tokens ?? 0);
  if (inT === 0 && outT === 0) {
    return;
  }
  const delta = estimateAnthropicCostCentsAud(input.model, inT, outT);
  await trackAiCostCents({ userId: input.userId, deltaCentsAud: delta });
}
