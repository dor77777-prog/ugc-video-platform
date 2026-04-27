-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "imageGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "imageGenerationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "imagePromptUsed" TEXT,
ADD COLUMN     "imageProvider" TEXT,
ADD COLUMN     "imageUrl" TEXT;
