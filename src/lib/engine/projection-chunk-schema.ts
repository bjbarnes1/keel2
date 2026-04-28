/**
 * Zod schemas for timeline projection chunk requests.
 *
 * Kept out of `app/actions/keel.ts` because Next.js `"use server"` modules may only
 * export async functions — the client hook and Vitest suites import this module directly.
 *
 * **Threat model:** prevents absurd `horizonDays` (DoS / huge allocations) and rejects
 * malformed `startDateIso` strings before they reach Prisma/engine code.
 *
 * @module lib/engine/projection-chunk-schema
 */

import { z } from "zod";

/**
 * Validates `loadProjectionChunk` payloads.
 *
 * - `startDateIso`: strict `YYYY-MM-DD` (UTC midnight when interpreted downstream).
 * - `horizonDays`: clamped 1–420 at the schema; the `useTimelineEvents` hook additionally
 *   caps how far users can scroll (24-week policy) before issuing requests.
 */
export const loadProjectionChunkInputSchema = z.object({
  startDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDateIso must be YYYY-MM-DD"),
  horizonDays: z.number().int().min(1).max(420),
});

export type LoadProjectionChunkInput = z.infer<typeof loadProjectionChunkInputSchema>;
