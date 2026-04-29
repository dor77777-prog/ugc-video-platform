-- V10: per-scene caption timings
--
-- Adds three nullable columns to Scene:
--   wordTimingsJson      - [{word, startMs, endMs}] (scene-relative)
--   captionChunksJson    - [{text, startMs, endMs, lineCount, wordCount}]
--   captionsGeneratedAt  - timestamp of last successful chunking pass
--
-- The renderer reads these to build a global ASS subtitle file. When
-- they are NULL the renderer skips captions for that scene rather
-- than falling back to proportional timing estimates.

ALTER TABLE "Scene"
  ADD COLUMN "wordTimingsJson" JSONB,
  ADD COLUMN "captionChunksJson" JSONB,
  ADD COLUMN "captionsGeneratedAt" TIMESTAMP(3);
