-- V4 product-first scene metadata. All columns nullable so legacy
-- scenes (created before the script-engine schema added these fields)
-- continue to load. Newly-generated scenes will have them populated by
-- the LLM via structured-output.
ALTER TABLE "Scene"
  ADD COLUMN "primarySubject" TEXT,
  ADD COLUMN "secondarySubject" TEXT,
  ADD COLUMN "mustShowProduct" BOOLEAN,
  ADD COLUMN "productVisibilityPriority" TEXT,
  ADD COLUMN "cameraFocus" TEXT,
  ADD COLUMN "showFace" BOOLEAN;
