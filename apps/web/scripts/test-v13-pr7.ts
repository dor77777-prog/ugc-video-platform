// V13 PR7 verification — wired state transitions in the pipeline impls.
//
// PR7.1: status writes + lastErrorCode/Message at every stage transition
// in generate-impl / voice-impl / clip-impl. Future commits add the
// log buffer flush (PR7.2) and the wizard UX components (PR7.3).

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

const WEB = path.resolve(__dirname, '..');
const generateImpl = fs.readFileSync(path.join(WEB, 'lib/scenes/generate-impl.ts'), 'utf8');
const voiceImpl = fs.readFileSync(path.join(WEB, 'lib/scenes/voice-impl.ts'), 'utf8');
const clipImpl = fs.readFileSync(path.join(WEB, 'lib/scenes/clip-impl.ts'), 'utf8');

// ── PR7.1 — generate-impl writes the right transitions ─────────────────
{
  assert(
    /status:\s*'generating_image'/.test(generateImpl),
    "[PR7.1] generate-impl sets status='generating_image' on in-flight",
  );
  assert(
    /status:\s*'image_ready'/.test(generateImpl),
    "[PR7.1] generate-impl sets status='image_ready' on success persist",
  );
  assert(
    /status:\s*'failed'/.test(generateImpl),
    "[PR7.1] generate-impl sets status='failed' on error path",
  );
  for (const code of ['image-gen.config', 'image-gen.timeout', 'image-gen.safety_rejected', 'image-gen.generic']) {
    assert(
      generateImpl.includes(`'${code}'`),
      `[PR7.1] generate-impl writes lastErrorCode='${code}'`,
    );
  }
  assert(
    /lastErrorCode:\s*null/.test(generateImpl),
    '[PR7.1] generate-impl clears lastErrorCode on success/in-flight',
  );
}

// ── PR7.1 — voice-impl writes the right transitions ───────────────────
{
  assert(
    /status:\s*'generating_voice'/.test(voiceImpl),
    "[PR7.1] voice-impl sets status='generating_voice' on in-flight",
  );
  assert(
    /status:\s*'voice_ready'/.test(voiceImpl),
    "[PR7.1] voice-impl sets status='voice_ready' on success persist",
  );
  assert(
    /status:\s*'failed'/.test(voiceImpl),
    "[PR7.1] voice-impl sets status='failed' on error path",
  );
  for (const code of ['voice.config', 'voice.elevenlabs_timeout', 'voice.character_limit']) {
    assert(
      voiceImpl.includes(`'${code}'`),
      `[PR7.1] voice-impl writes lastErrorCode='${code}'`,
    );
  }
  assert(
    /lastErrorCode:\s*null/.test(voiceImpl),
    '[PR7.1] voice-impl clears lastErrorCode on success/in-flight',
  );
}

// ── PR7.1 — clip-impl writes the right transitions ────────────────────
{
  assert(
    /status:\s*'generating_clip'/.test(clipImpl),
    "[PR7.1] clip-impl sets status='generating_clip' on in-flight",
  );
  assert(
    /status:\s*'clip_ready'/.test(clipImpl),
    "[PR7.1] clip-impl sets status='clip_ready' on success persist",
  );
  assert(
    /status:\s*'failed'/.test(clipImpl),
    "[PR7.1] clip-impl sets status='failed' on i2v error path",
  );
  for (const code of ['kling.config', 'kling.timeout', 'kling.task_failed', 'kling.network']) {
    assert(
      clipImpl.includes(`'${code}'`),
      `[PR7.1] clip-impl writes lastErrorCode='${code}'`,
    );
  }
  assert(
    /lastErrorCode:\s*null/.test(clipImpl),
    '[PR7.1] clip-impl clears lastErrorCode on success/in-flight',
  );
}

// ── PR7.1 — All curated codes from PR5 still exist for the codes the
//            pipeline actually emits ───────────────────────────────────
{
  const errorMap = fs.readFileSync(path.join(WEB, 'lib/errors/scene-error-messages.ts'), 'utf8');
  const emitted = [
    'image-gen.config',
    'image-gen.timeout',
    'image-gen.safety_rejected',
    'image-gen.generic',
    'voice.config',
    'voice.elevenlabs_timeout',
    'voice.character_limit',
    'kling.config',
    'kling.timeout',
    'kling.task_failed',
    'kling.network',
  ];
  for (const code of emitted) {
    assert(
      errorMap.includes(`'${code}'`),
      `[PR7.1] PR5 error map has a curated entry for '${code}'`,
    );
  }
}

// ── PR7.3 — Scene-card UX components exist + import the right things ─
{
  const badgePath = path.resolve(WEB, 'components/wizard/scene-card-status-badge.tsx');
  const detailsPath = path.resolve(WEB, 'components/wizard/scene-error-details.tsx');
  assert(fs.existsSync(badgePath), '[PR7.3] scene-card-status-badge.tsx file exists');
  assert(fs.existsSync(detailsPath), '[PR7.3] scene-error-details.tsx file exists');

  const badge = fs.readFileSync(badgePath, 'utf8');
  assert(
    /import .* from .*lib\/scenes\/scene-status/.test(badge),
    '[PR7.3] status badge imports from lib/scenes/scene-status (PR6 helper)',
  );
  // Must list all 11 SceneStatus values in HEBREW_LABELS so the type
  // exhaustiveness check passes at compile time.
  for (const status of [
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
      badge.includes(`${status}:`),
      `[PR7.3] HEBREW_LABELS covers status "${status}"`,
    );
  }
  // Must contain Hebrew label characters
  assert(/[א-ת]/.test(badge), '[PR7.3] status badge contains Hebrew text');
  assert(
    /dir="rtl"/.test(badge),
    '[PR7.3] status badge sets dir="rtl"',
  );

  const details = fs.readFileSync(detailsPath, 'utf8');
  assert(
    /'use client'/.test(details),
    '[PR7.3] scene-error-details is a client component',
  );
  assert(
    /getSceneErrorMessage/.test(details) &&
      /['"]@\/lib\/errors\/scene-error-messages['"]/.test(details),
    '[PR7.3] scene-error-details imports getSceneErrorMessage (PR5 map)',
  );
  assert(
    /נסה שוב/.test(details),
    '[PR7.3] scene-error-details renders Hebrew "נסה שוב" retry button',
  );
  assert(
    /דלג על סצנה זו/.test(details),
    '[PR7.3] scene-error-details renders Hebrew "דלג על סצנה זו" skip button',
  );
  assert(
    /צפה ב-debug/.test(details),
    '[PR7.3] scene-error-details renders Hebrew "צפה ב-debug" admin link',
  );
  assert(
    /<details>/.test(details),
    '[PR7.3] scene-error-details exposes raw error in <details>',
  );
  assert(
    /role="alert"/.test(details),
    '[PR7.3] scene-error-details has role="alert" for screen readers',
  );
  assert(
    /dir="rtl"/.test(details),
    '[PR7.3] scene-error-details sets dir="rtl"',
  );
}

// ── PR7.4 — Log viewer + warnings panel exist + render the right things ─
{
  const viewerPath = path.resolve(WEB, 'components/wizard/scene-log-viewer.tsx');
  const warningsPath = path.resolve(WEB, 'components/wizard/wizard-warnings-panel.tsx');
  assert(fs.existsSync(viewerPath), '[PR7.4] scene-log-viewer.tsx file exists');
  assert(fs.existsSync(warningsPath), '[PR7.4] wizard-warnings-panel.tsx file exists');

  const viewer = fs.readFileSync(viewerPath, 'utf8');
  assert(/'use client'/.test(viewer), '[PR7.4] log viewer is a client component');
  assert(/dir="rtl"/.test(viewer), '[PR7.4] log viewer sets dir="rtl"');
  assert(/[א-ת]/.test(viewer), '[PR7.4] log viewer contains Hebrew text');
  // Stage label coverage — every stage emitted by PR4.2 / PR4.3 must
  // have a Hebrew translation in STAGE_HEBREW.
  for (const stage of [
    'image-brief',
    'image-gen',
    'voice',
    'motion-analysis',
    'kling',
    'face-gate',
    'pixverse',
    'render',
    'clip',
  ]) {
    // JS object literal: dashed keys quoted, plain keys unquoted.
    const pattern = new RegExp(`(?:^|\\s)['"]?${stage.replace('-', '\\-')}['"]?:`, 'm');
    assert(
      pattern.test(viewer),
      `[PR7.4] STAGE_HEBREW covers stage "${stage}"`,
    );
  }
  // Reverse-chronological order (newest first)
  assert(
    /\.reverse\(\)/.test(viewer),
    '[PR7.4] log viewer renders entries in reverse-chronological order',
  );
  // Empty-state message
  assert(
    /אין רשומות/.test(viewer),
    '[PR7.4] log viewer renders Hebrew empty-state when entries.length === 0',
  );

  const warnings = fs.readFileSync(warningsPath, 'utf8');
  assert(/'use client'/.test(warnings), '[PR7.4] warnings panel is a client component');
  assert(/dir="rtl"/.test(warnings), '[PR7.4] warnings panel sets dir="rtl"');
  // Hebrew title
  assert(/אזהרות/.test(warnings), '[PR7.4] warnings panel renders Hebrew "אזהרות"');
  // Hidden when empty
  assert(
    /warnings\.length === 0/.test(warnings) && /return null/.test(warnings),
    '[PR7.4] warnings panel returns null when warnings list is empty',
  );
  // Per-scene prefix when sceneNumber is set
  assert(
    /סצנה /.test(warnings),
    '[PR7.4] warnings panel adds "סצנה N" prefix when sceneNumber is set',
  );
}

console.log('');
if (failures === 0) {
  console.log('PR7 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`PR7 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
