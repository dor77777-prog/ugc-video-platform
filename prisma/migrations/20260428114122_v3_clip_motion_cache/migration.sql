-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "clipMotionDurationSec" DOUBLE PRECISION,
ADD COLUMN     "clipMotionGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "clipMotionImageUrl" TEXT,
ADD COLUMN     "clipMotionTaskId" TEXT;
