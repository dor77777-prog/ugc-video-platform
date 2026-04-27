-- CreateTable
CREATE TABLE "ApiCall" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "model" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "units" INTEGER,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "userId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiCall_provider_createdAt_idx" ON "ApiCall"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_operation_createdAt_idx" ON "ApiCall"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_createdAt_idx" ON "ApiCall"("createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_userId_idx" ON "ApiCall"("userId");

-- CreateIndex
CREATE INDEX "ApiCall_projectId_idx" ON "ApiCall"("projectId");

-- AddForeignKey
ALTER TABLE "ApiCall" ADD CONSTRAINT "ApiCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
