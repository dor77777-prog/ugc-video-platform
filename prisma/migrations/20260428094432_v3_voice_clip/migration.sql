-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "clipDurationSeconds" DOUBLE PRECISION,
ADD COLUMN     "clipGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "clipGenerationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clipProvider" TEXT,
ADD COLUMN     "clipUrl" TEXT,
ADD COLUMN     "voiceDurationSeconds" DOUBLE PRECISION,
ADD COLUMN     "voiceGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "voiceGenerationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voiceProvider" TEXT,
ADD COLUMN     "voiceUrl" TEXT;
