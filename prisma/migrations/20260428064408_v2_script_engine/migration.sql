-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "cameraDirection" TEXT,
ADD COLUMN     "onScreenCaptionHebrew" TEXT,
ADD COLUMN     "performanceNote" TEXT,
ADD COLUMN     "sceneGoal" TEXT;

-- AlterTable
ALTER TABLE "Script" ADD COLUMN     "framework" TEXT,
ADD COLUMN     "qualityScoreOverall" DOUBLE PRECISION,
ADD COLUMN     "selectedHookReason" TEXT;
