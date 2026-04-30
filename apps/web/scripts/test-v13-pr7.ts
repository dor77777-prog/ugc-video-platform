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

console.log('');
if (failures === 0) {
  console.log('PR7 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`PR7 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
