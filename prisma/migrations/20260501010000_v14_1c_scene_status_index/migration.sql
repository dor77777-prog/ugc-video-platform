-- V14.1c — Scene.status index.
-- Additive only: the `status` column already exists (added in V13 PR6
-- migration `v13_scene_state_log`); this just adds an index so admin
-- drill-down filters and any future state-machine WHERE clauses don't
-- full-scan the Scene table.
-- IF NOT EXISTS so re-applying is a no-op.

CREATE INDEX IF NOT EXISTS "Scene_status_idx" ON "Scene"("status");
