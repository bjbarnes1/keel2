import { PrismaClient } from "@prisma/client";

declare global {
  var __keelPrisma__: PrismaClient | undefined;
}

export function getPrismaClient() {
  if (!global.__keelPrisma__) {
    global.__keelPrisma__ = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error"] : ["error"],
    });
  }

  return global.__keelPrisma__;
}
