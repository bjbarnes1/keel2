-- CreateTable
CREATE TABLE "AiRateLimit" (
    "userId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiRateLimit_pkey" PRIMARY KEY ("userId")
);
