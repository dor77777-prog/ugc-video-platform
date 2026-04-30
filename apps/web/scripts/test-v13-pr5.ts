// V13 PR5 verification — curated Hebrew error messages map.

import {
  SCENE_ERROR_MESSAGES,
  getSceneErrorMessage,
  sceneErrorHebrew,
  isCuratedSceneError,
  listSceneErrorCodes,
} from '../lib/errors/scene-error-messages';

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

async function main() {
  // ── Coverage of major stages ─────────────────────────────────────────
  const requiredStages = [
    'scrape',
    'intelligence',
    'script',
    'scene-plan',
    'image-brief',
    'image-gen',
    'voice',
    'motion',
    'animation-plan',
    'kling',
    'face-gate',
    'pixverse',
    'render',
  ];
  const codes = listSceneErrorCodes();
  for (const stage of requiredStages) {
    assert(
      codes.some((c) => c.startsWith(`${stage}.`)),
      `[PR5] map covers stage "${stage}" with at least one code`,
      `codes: ${codes.filter((c) => c.startsWith(stage + '.')).join(' | ')}`,
    );
  }

  // ── Every entry has Hebrew text ──────────────────────────────────────
  for (const [code, entry] of Object.entries(SCENE_ERROR_MESSAGES)) {
    assert(
      typeof entry.hebrew === 'string' && entry.hebrew.length >= 8,
      `[PR5] code "${code}" has a non-trivial Hebrew message`,
      `got: "${entry.hebrew}"`,
    );
    // Crude RTL check: does the string contain Hebrew letters?
    assert(
      /[א-ת]/.test(entry.hebrew),
      `[PR5] code "${code}" message contains Hebrew characters`,
      `got: "${entry.hebrew}"`,
    );
  }

  // ── Specific entries from V13 §14.2 spec ─────────────────────────────
  assert(
    !!SCENE_ERROR_MESSAGES['kling.timeout']?.hebrew?.includes('Kling'),
    '[PR5] kling.timeout message names Kling',
  );
  assert(
    !!SCENE_ERROR_MESSAGES['face-gate.no_face_detected']?.hebrew.includes('פנים'),
    '[PR5] face-gate.no_face_detected mentions פנים (face)',
  );
  assert(
    !!SCENE_ERROR_MESSAGES['scene-plan.missing_intelligence']?.hebrew.includes('שלב 1'),
    '[PR5] scene-plan.missing_intelligence guides user back to step 1',
  );
  assert(
    !!SCENE_ERROR_MESSAGES['voice.character_limit']?.hebrew.includes('ElevenLabs'),
    '[PR5] voice.character_limit names ElevenLabs',
  );

  // ── getSceneErrorMessage fallback ────────────────────────────────────
  const known = getSceneErrorMessage('kling.timeout', 'Kling polling timed out after 15m');
  assert(known.isFallback === false, '[PR5] known code returns isFallback=false');
  assert(known.code === 'kling.timeout', '[PR5] known code preserved on result');
  assert(
    known.raw === 'Kling polling timed out after 15m',
    '[PR5] raw error string round-trips on result',
  );

  const unknown = getSceneErrorMessage('totally.invented_code', 'some raw error');
  assert(unknown.isFallback === true, '[PR5] unknown code returns isFallback=true');
  assert(unknown.code === 'totally.invented_code', '[PR5] unknown code preserved on result');
  assert(unknown.raw === 'some raw error', '[PR5] unknown raw error preserved');
  assert(
    unknown.hebrew.length > 5 && /[א-ת]/.test(unknown.hebrew),
    '[PR5] fallback message is also in Hebrew',
  );

  // ── needsUserEdit + retryHint flags ──────────────────────────────────
  assert(
    SCENE_ERROR_MESSAGES['image-gen.safety_rejected']?.needsUserEdit === true,
    '[PR5] safety-rejected marked as needsUserEdit',
  );
  assert(
    SCENE_ERROR_MESSAGES['kling.timeout']?.needsUserEdit === true,
    '[PR5] kling.timeout marked as needsUserEdit (regenerate the still first)',
  );
  assert(
    typeof SCENE_ERROR_MESSAGES['rate-limit.exceeded']?.retryHint === 'string',
    '[PR5] rate-limit code provides a retryHint',
  );

  // ── Convenience helpers ──────────────────────────────────────────────
  assert(
    sceneErrorHebrew('kling.timeout').length > 5,
    '[PR5] sceneErrorHebrew returns the Hebrew message for known codes',
  );
  assert(
    isCuratedSceneError('kling.timeout') === true,
    '[PR5] isCuratedSceneError returns true for known codes',
  );
  assert(
    isCuratedSceneError('foo.bar') === false,
    '[PR5] isCuratedSceneError returns false for unknown codes',
  );

  // ── Code naming convention <stage>.<reason> ───────────────────────────
  for (const code of codes) {
    assert(
      /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/.test(code),
      `[PR5] code "${code}" follows <stage>.<reason> kebab/snake convention`,
    );
  }

  console.log('');
  if (failures === 0) {
    console.log('PR5 verification: ALL CHECKS PASSED');
    process.exit(0);
  } else {
    console.error(`PR5 verification: ${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
