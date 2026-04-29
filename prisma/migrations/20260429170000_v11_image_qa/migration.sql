-- V11: image brief + image QA artifacts on Scene
--
-- imageBriefJson    : the deterministic ImageBrief used to produce imageUrl
-- imageQaJson       : last QA result (score, checks, failureReasons, correctiveActions)
-- imageRegenAttempts: how many times the auto-regen loop fired for this scene
-- needsManualReview : true when retries were exhausted and QA still failed

ALTER TABLE "Scene"
  ADD COLUMN "imageBriefJson" JSONB,
  ADD COLUMN "imageQaJson" JSONB,
  ADD COLUMN "imageRegenAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "needsManualReview" BOOLEAN NOT NULL DEFAULT false;
