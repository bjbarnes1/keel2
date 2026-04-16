import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

declare global {
  var __keelPgPool__: Pool | undefined;
  var __keelPrisma__: PrismaClient | undefined;
}

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
