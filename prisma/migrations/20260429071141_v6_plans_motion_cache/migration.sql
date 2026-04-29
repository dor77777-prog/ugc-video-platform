-- V6: subscription plan billing state + cached gpt-4o-mini motion analysis.
--
-- Plan column already exists (String); we just add the billing-state
-- companions so the new lib/plans.ts can compute renewal dates +
-- effective credit value. Defaults are safe for existing users:
-- planAnnualBilling=false, planRenewsAt=NULL, planStartedAt=NULL.
ALTER TABLE "User"
  ADD COLUMN "planAnnualBilling" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "planRenewsAt" TIMESTAMP(3),
  ADD COLUMN "planStartedAt" TIMESTAMP(3);

-- Bring legacy "free" plan strings up to the new "free_trial" slug.
UPDATE "User" SET "plan" = 'free_trial' WHERE "plan" = 'free';

CREATE INDEX "User_plan_idx" ON "User"("plan");

-- Motion-analysis cache on Scene. JSON blob holds the gpt-4o-mini
-- response so we can re-feed it to Kling without paying for vision
-- again. motionAnalysisImageUrl is the cache key — we only re-analyze
-- when scene.imageUrl differs from this stored value.
ALTER TABLE "Scene"
  ADD COLUMN "motionAnalysisJson" JSONB,
  ADD COLUMN "motionAnalysisImageUrl" TEXT,
  ADD COLUMN "motionAnalysisAt" TIMESTAMP(3);
