-- Extend SpendAccount with optional bank details.

ALTER TABLE "SpendAccount"
  ADD COLUMN "bankName" TEXT,
  ADD COLUMN "bsb" TEXT,
  ADD COLUMN "accountName" TEXT,
  ADD COLUMN "accountNumberEnc" TEXT,
  ADD COLUMN "accountNumberIv" TEXT,
  ADD COLUMN "accountNumberLastFour" TEXT;

