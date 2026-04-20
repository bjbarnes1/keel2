import { z } from "zod";

/**
 * Validation contract for `loadProjectionChunk`. Lives outside the `"use server"` module so
 * both the action and the hook / tests can import the schema without Next.js rejecting it
 * (server files can only export async functions).
 *
 * `horizonDays` max is 200 (safety valve); the `useTimelineEvents` hook enforces the
 * 24-week / ~168-day upper bound before calling.
 */
export const loadProjectionChunkInputSchema = z.object({
  startDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDateIso must be YYYY-MM-DD"),
  horizonDays: z.number().int().min(1).max(200),
});

export type LoadProjectionChunkInput = z.infer<typeof loadProjectionChunkInputSchema>;
