-- CreateTable
CREATE TABLE "CommitmentSkip" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "commitmentId" TEXT NOT NULL,
    "originalDate" DATE NOT NULL,
    "strategy" TEXT NOT NULL,
    "spreadOverN" INTEGER,
    "redirectTo" TEXT,
    "skippedAmount" DECIMAL(65,30),
    "notes" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "CommitmentSkip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalSkip" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "originalDate" DATE NOT NULL,
    "strategy" TEXT NOT NULL,
    "notes" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "GoalSkip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommitmentSkip_budgetId_revokedAt_idx" ON "CommitmentSkip"("budgetId", "revokedAt");

-- CreateIndex
CREATE INDEX "CommitmentSkip_budgetId_idx" ON "CommitmentSkip"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "CommitmentSkip_commitmentId_originalDate_key" ON "CommitmentSkip"("commitmentId", "originalDate");

-- CreateIndex
CREATE INDEX "GoalSkip_budgetId_revokedAt_idx" ON "GoalSkip"("budgetId", "revokedAt");

-- CreateIndex
CREATE INDEX "GoalSkip_budgetId_idx" ON "GoalSkip"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalSkip_goalId_originalDate_key" ON "GoalSkip"("goalId", "originalDate");

-- AddForeignKey
ALTER TABLE "CommitmentSkip" ADD CONSTRAINT "CommitmentSkip_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitmentSkip" ADD CONSTRAINT "CommitmentSkip_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalSkip" ADD CONSTRAINT "GoalSkip_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalSkip" ADD CONSTRAINT "GoalSkip_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
