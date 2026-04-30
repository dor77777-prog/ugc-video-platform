-- V13.2 — admin costs hardening.
-- Additive only: every column is nullable (or has a sane default), every
-- index is created IF NOT EXISTS so re-applying is safe. No drops.

-- ── ApiCall: extra cost attribution + linkage + safe metadata ──────────
ALTER TABLE "ApiCall" ADD COLUMN IF NOT EXISTS "estimatedCostUsd" DOUBLE PRECISION;
ALTER TABLE "ApiCall" ADD COLUMN IF NOT EXISTS "actualCostUsd"    DOUBLE PRECISION;
ALTER TABLE "ApiCall" ADD COLUMN IF NOT EXISTS "metadata"         JSONB;
ALTER TABLE "ApiCall" ADD COLUMN IF NOT EXISTS "renderJobId"      TEXT;
ALTER TABLE "ApiCall" ADD COLUMN IF NOT EXISTS "sceneId"          TEXT;

-- New / composite indexes (recent-calls, summary, in-flight, drilldowns).
CREATE INDEX IF NOT EXISTS "ApiCall_provider_operation_createdAt_idx"
  ON "ApiCall" ("provider", "operation", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiCall_provider_status_createdAt_idx"
  ON "ApiCall" ("provider", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiCall_completedAt_idx"
  ON "ApiCall" ("completedAt");
CREATE INDEX IF NOT EXISTS "ApiCall_userId_createdAt_idx"
  ON "ApiCall" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiCall_projectId_createdAt_idx"
  ON "ApiCall" ("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiCall_renderJobId_createdAt_idx"
  ON "ApiCall" ("renderJobId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiCall_sceneId_createdAt_idx"
  ON "ApiCall" ("sceneId", "createdAt");

-- ── CreditTransaction: refType + index for ref lookup ──────────────────
ALTER TABLE "CreditTransaction" ADD COLUMN IF NOT EXISTS "refType" TEXT;
CREATE INDEX IF NOT EXISTS "CreditTransaction_refType_ref_idx"
  ON "CreditTransaction" ("refType", "ref");

-- ── RenderJob: composite (status, createdAt) + completedAt ─────────────
CREATE INDEX IF NOT EXISTS "RenderJob_status_createdAt_idx"
  ON "RenderJob" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "RenderJob_projectId_createdAt_idx"
  ON "RenderJob" ("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "RenderJob_completedAt_idx"
  ON "RenderJob" ("completedAt");

-- ── Project: (userId, createdAt) ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Project_userId_createdAt_idx"
  ON "Project" ("userId", "createdAt");

-- ── ProviderBalanceSnapshot: new model ─────────────────────────────────
CREATE TABLE IF NOT EXISTS "ProviderBalanceSnapshot" (
  "id"                TEXT NOT NULL,
  "provider"          TEXT NOT NULL,
  "balanceType"       TEXT NOT NULL,
  "balanceValue"      DOUBLE PRECISION NOT NULL,
  "balanceUnit"       TEXT NOT NULL,
  "estimatedUsdValue" DOUBLE PRECISION,
  "rawJson"           JSONB,
  "status"            TEXT NOT NULL DEFAULT 'ok',
  "errorMessage"      TEXT,
  "fetchedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderBalanceSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProviderBalanceSnapshot_provider_fetchedAt_idx"
  ON "ProviderBalanceSnapshot" ("provider", "fetchedAt");
CREATE INDEX IF NOT EXISTS "ProviderBalanceSnapshot_fetchedAt_idx"
  ON "ProviderBalanceSnapshot" ("fetchedAt");
