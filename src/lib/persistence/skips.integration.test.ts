import { describe, expect, it } from "vitest";

/**
 * Env-gated smoke test. Set `KEEL_INTEGRATION_DATABASE_URL` to a migrated Postgres URL locally;
 * CI leaves it unset so this block is skipped. Full skip create/revoke flows still need seeded auth.
 */
describe.skipIf(!process.env.KEEL_INTEGRATION_DATABASE_URL)("Prisma / skips integration", () => {
  it("database is reachable", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const rows = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1::int as ok`;
      expect(rows[0]?.ok).toBe(1);
    } finally {
      await prisma.$disconnect();
    }
  });
});
