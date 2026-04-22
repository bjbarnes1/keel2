-- CreateEnum
CREATE TYPE "CommitmentSkipStrategy" AS ENUM ('MAKE_UP_NEXT', 'SPREAD', 'MOVE_ON', 'STANDALONE');

-- AlterTable
ALTER TABLE "CommitmentSkip"
ALTER COLUMN "strategy" TYPE "CommitmentSkipStrategy" USING ("strategy"::"CommitmentSkipStrategy");

