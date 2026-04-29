-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "audioHandling" TEXT,
ADD COLUMN     "faceDetectionConfidence" DOUBLE PRECISION,
ADD COLUMN     "faceGateImageUrl" TEXT,
ADD COLUMN     "faceGateReason" TEXT,
ADD COLUMN     "fullFaceDetected" BOOLEAN,
ADD COLUMN     "lipSyncErrorMessage" TEXT,
ADD COLUMN     "lipSyncStatus" TEXT,
ADD COLUMN     "mouthVisible" BOOLEAN,
ADD COLUMN     "pixverseAudioMediaId" TEXT,
ADD COLUMN     "pixverseVideoId" TEXT,
ADD COLUMN     "pixverseVideoMediaId" TEXT;
