-- AlterTable
ALTER TABLE "Scene" ADD COLUMN     "clipInFlightAt" TIMESTAMP(3),
ADD COLUMN     "imageInFlightAt" TIMESTAMP(3),
ADD COLUMN     "voiceInFlightAt" TIMESTAMP(3);
