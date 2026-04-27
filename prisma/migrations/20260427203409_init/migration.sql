-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('draft', 'product_extracted', 'scripts_generated', 'rendering', 'completed', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "ScriptAngle" AS ENUM ('problem_solution', 'testimonial', 'product_demo', 'before_after', 'price_anchor', 'fast_benefit');

-- CreateEnum
CREATE TYPE "SceneType" AS ENUM ('hook', 'problem', 'product_demo', 'benefit', 'cta', 'other');

-- CreateEnum
CREATE TYPE "RenderJobStatus" AS ENUM ('pending', 'extracting_assets', 'generating_voice', 'generating_avatar_video', 'generating_broll', 'composing_video', 'uploading_final', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('product_image', 'voice_audio', 'avatar_video', 'broll_video', 'composition', 'final_video', 'thumbnail', 'background_music');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "creditsBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productUrl" TEXT,
    "productName" TEXT,
    "productData" JSONB,
    "status" "ProjectStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "angle" "ScriptAngle" NOT NULL,
    "hook" TEXT NOT NULL,
    "cta" TEXT,
    "targetAudience" TEXT,
    "estimatedDurationSeconds" INTEGER NOT NULL,
    "rawJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "sceneOrder" INTEGER NOT NULL,
    "textHebrew" TEXT NOT NULL,
    "textHebrewTts" TEXT,
    "visualPromptEnglish" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "sceneType" "SceneType" NOT NULL DEFAULT 'other',

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenderJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RenderJobStatus" NOT NULL DEFAULT 'pending',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "providerPayloadJson" JSONB,
    "finalVideoUrl" TEXT,
    "estimatedCostUsd" DOUBLE PRECISION,
    "actualCostUsd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "renderJobId" TEXT,
    "type" "AssetType" NOT NULL,
    "provider" TEXT,
    "url" TEXT NOT NULL,
    "durationSeconds" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Project_userId_idx" ON "Project"("userId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Script_projectId_idx" ON "Script"("projectId");

-- CreateIndex
CREATE INDEX "Scene_scriptId_idx" ON "Scene"("scriptId");

-- CreateIndex
CREATE UNIQUE INDEX "Scene_scriptId_sceneOrder_key" ON "Scene"("scriptId", "sceneOrder");

-- CreateIndex
CREATE INDEX "RenderJob_projectId_idx" ON "RenderJob"("projectId");

-- CreateIndex
CREATE INDEX "RenderJob_userId_idx" ON "RenderJob"("userId");

-- CreateIndex
CREATE INDEX "RenderJob_status_idx" ON "RenderJob"("status");

-- CreateIndex
CREATE INDEX "Asset_projectId_idx" ON "Asset"("projectId");

-- CreateIndex
CREATE INDEX "Asset_renderJobId_idx" ON "Asset"("renderJobId");

-- CreateIndex
CREATE INDEX "Asset_type_idx" ON "Asset"("type");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenderJob" ADD CONSTRAINT "RenderJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_renderJobId_fkey" FOREIGN KEY ("renderJobId") REFERENCES "RenderJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
