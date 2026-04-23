-- Daily AI cost tracking (AUD cents) alongside hourly call counts.
ALTER TABLE "AiRateLimit" ADD COLUMN "dayStart" TIMESTAMP(3);
ALTER TABLE "AiRateLimit" ADD COLUMN "costCentsDay" INTEGER NOT NULL DEFAULT 0;
