// V13 PR6 verification — scene-status helper + schema.prisma additions.

import {
  SCENE_STATUSES,
  isSceneStatus,
  isTerminalSceneStatus,
  isInFlightSceneStatus,
  SCENE_STATUS_DEFAULT,
  SCENE_STATUS_TERMINAL,
  SCENE_STATUS_IN_FLIGHT,
} from '../lib/scenes/scene-status';
import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
function ok(name: string) {
  console.log(`PASS ${name}`);
}
function fail(name: string, detail: string) {
  failures++;
  console.error(`FAIL ${name}\n   ${detail}`);
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name);
  else fail(name, detail);
}

// ── Const tuple shape ────────────────────────────────────────────────
{
  assert(Array.isArray(SCENE_STATUSES), '[PR6] SCENE_STATUSES is an array');
  assert(SCENE_STATUSES.length === 11, '[PR6] SCENE_STATUSES has 11 states');
  for (const expected of [
    'pending',
    'planning',
    'brief_built',
    'generating_image',
    'image_ready',
    'generating_voice',
    'voice_ready',
    'generating_clip',
    'clip_ready',
    'needs_review',
    'failed',
  ]) {
    assert(
      (SCENE_STATUSES as readonly string[]).includes(expected),
      `[PR6] SCENE_STATUSES contains "${expected}"`,
    );
  }
  assert(SCENE_STATUS_DEFAULT === 'pending', '[PR6] SCENE_STATUS_DEFAULT === "pending"');
}

// ── Type guard ───────────────────────────────────────────────────────
{
  assert(isSceneStatus('pending') === true, '[PR6] isSceneStatus("pending") true');
  assert(isSceneStatus('clip_ready') === true, '[PR6] isSceneStatus("clip_ready") true');
  assert(isSceneStatus('totally_invalid') === false, '[PR6] isSceneStatus rejects unknown strings');
  assert(isSceneStatus(42) === false, '[PR6] isSceneStatus rejects non-strings');
  assert(isSceneStatus(null) === false, '[PR6] isSceneStatus rejects null');
  assert(isSceneStatus(undefined) === false, '[PR6] isSceneStatus rejects undefined');
}

// ── Terminal / in-flight sets ───────────────────────────────────────
{
  assert(SCENE_STATUS_TERMINAL.has('clip_ready'), '[PR6] terminal set contains clip_ready');
  assert(SCENE_STATUS_TERMINAL.has('failed'), '[PR6] terminal set contains failed');
  assert(SCENE_STATUS_TERMINAL.has('needs_review'), '[PR6] terminal set contains needs_review');
  assert(!SCENE_STATUS_TERMINAL.has('planning'), '[PR6] terminal set excludes planning');

  assert(SCENE_STATUS_IN_FLIGHT.has('generating_image'), '[PR6] in-flight set contains generating_image');
  assert(SCENE_STATUS_IN_FLIGHT.has('generating_voice'), '[PR6] in-flight set contains generating_voice');
  assert(SCENE_STATUS_IN_FLIGHT.has('generating_clip'), '[PR6] in-flight set contains generating_clip');
  assert(SCENE_STATUS_IN_FLIGHT.has('planning'), '[PR6] in-flight set contains planning');
  assert(!SCENE_STATUS_IN_FLIGHT.has('clip_ready'), '[PR6] in-flight set excludes clip_ready');

  // Predicates
  assert(isTerminalSceneStatus('failed') === true, '[PR6] isTerminalSceneStatus("failed") true');
  assert(isInFlightSceneStatus('generating_image') === true, '[PR6] isInFlightSceneStatus("generating_image") true');
  assert(isTerminalSceneStatus('pending') === false, '[PR6] isTerminalSceneStatus("pending") false');
}

// ── Schema additions ─────────────────────────────────────────────────
{
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../../prisma/schema.prisma'),
    'utf8',
  );
  assert(
    /status\s+String\s+@default\("pending"\)/.test(schema),
    '[PR6] schema.prisma has status String @default("pending")',
  );
  assert(
    /lastErrorCode\s+String\?/.test(schema),
    '[PR6] schema.prisma has lastErrorCode String?',
  );
  assert(
    /lastErrorMessage\s+String\?/.test(schema),
    '[PR6] schema.prisma has lastErrorMessage String?',
  );
  assert(
    /generationLogJson\s+Json\?/.test(schema),
    '[PR6] schema.prisma has generationLogJson Json?',
  );

  // Migration SQL committed
  const migrationDir = path.resolve(__dirname, '../../../prisma/migrations');
  const dirs = fs.readdirSync(migrationDir).filter((d) => d.endsWith('v13_scene_state_log'));
  assert(dirs.length === 1, '[PR6] v13_scene_state_log migration directory exists');
  if (dirs.length === 1) {
    const sql = fs.readFileSync(path.join(migrationDir, dirs[0]!, 'migration.sql'), 'utf8');
    assert(
      /ALTER TABLE "Scene" ADD COLUMN/.test(sql),
      '[PR6] migration.sql is an additive ALTER TABLE',
    );
    assert(
      /"status" TEXT NOT NULL DEFAULT 'pending'/.test(sql),
      '[PR6] migration.sql adds status TEXT NOT NULL DEFAULT \'pending\'',
    );
    assert(
      sql.includes('"lastErrorCode" TEXT'),
      '[PR6] migration.sql adds lastErrorCode TEXT',
    );
    assert(
      sql.includes('"lastErrorMessage" TEXT'),
      '[PR6] migration.sql adds lastErrorMessage TEXT',
    );
    assert(
      sql.includes('"generationLogJson" JSONB'),
      '[PR6] migration.sql adds generationLogJson JSONB',
    );
    assert(
      !/DROP\s+COLUMN/i.test(sql) && !/DELETE\s+FROM/i.test(sql),
      '[PR6] migration.sql is additive only (no DROP / DELETE)',
    );
  }
}

console.log('');
if (failures === 0) {
  console.log('PR6 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`PR6 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
