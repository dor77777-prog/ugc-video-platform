-- AlterTable
ALTER TABLE "ApiCall" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'success';

-- Backfill: existing rows are all completed, mark them as
-- success/failed based on the legacy success boolean, and set
-- completedAt = createdAt (we don't have the original completion time).
UPDATE "ApiCall" SET "status" = 'failed' WHERE "success" = false;
UPDATE "ApiCall" SET "completedAt" = "createdAt" WHERE "completedAt" IS NULL;

-- CreateIndex
CREATE INDEX "ApiCall_status_createdAt_idx" ON "ApiCall"("status", "createdAt");
