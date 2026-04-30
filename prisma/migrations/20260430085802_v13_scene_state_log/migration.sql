-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "generationLogJson" JSONB,
ADD COLUMN     "lastErrorCode" TEXT,
ADD COLUMN     "lastErrorMessage" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';
