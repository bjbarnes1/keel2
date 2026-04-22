/**
 * Prisma 7 runtime wiring for PostgreSQL (Supabase).
 *
 * Uses the official `pg` driver + `@prisma/adapter-pg` instead of the legacy
 * built-in engine, per Prisma 7’s driver-adapter model. A singleton `Pool` and
 * `PrismaClient` are attached to `globalThis` in development so hot reload does
 * not exhaust database connections.
 *
 * Callers should use `getPrismaClient()` — never instantiate `PrismaClient` ad hoc.
 *
 * @throws If `DATABASE_URL` is missing when persistence is exercised.
 * @module lib/prisma
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

declare global {
  var __keelPgPool__: Pool | undefined;
  var __keelPrisma__: PrismaClient | undefined;
}

/**
 * Returns the process-wide Prisma client (lazy-initialized).
 *
 * Side effects: may create a `pg.Pool` and open DB connections on first call.
 */
export function getPrismaClient() {
  if (!global.__keelPrisma__) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required when Prisma runtime persistence is enabled.",
      );
    }

    const pool =
      global.__keelPgPool__ ??
      new Pool({
        connectionString,
      });

    global.__keelPgPool__ = pool;
    const adapter = new PrismaPg(pool);

    global.__keelPrisma__ = new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
    });
  }

  return global.__keelPrisma__;
}
