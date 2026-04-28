// One-time script: pre-generate Hebrew TTS samples for all 12 voice
// presets so the picker never has to call ElevenLabs at preview time.
//
// Why: previewing on-demand costs ~25 ElevenLabs credits per first click
// per voice and adds ~3-5s of latency. Bundling 12 static MP3s makes
// the picker feel instant and removes any quota dependency.
//
// Run from apps/web:
//   npx tsx scripts/generate-voice-samples.ts
//
// Idempotent: skips voices whose sample already exists in
// public/voice-samples/. Pass --force to regenerate everything.

import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { VOICE_PRESETS } from '../lib/voice/voice-presets';
import { generateHebrewVoiceover } from '../lib/voice/elevenlabs';

// Same line is used at runtime in /api/voice/sample/[voiceId]/route.ts —
// keep them in sync if you ever change the script.
const SAMPLE_TEXT = 'היי, ככה אני נשמעת בעברית.';

const OUT_DIR = path.resolve(__dirname, '../public/voice-samples');

async function main() {
  const force = process.argv.includes('--force');
  await fs.mkdir(OUT_DIR, { recursive: true });

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Generating ${VOICE_PRESETS.length} voice samples → ${OUT_DIR}\n`);

  for (const preset of VOICE_PRESETS) {
    const filePath = path.join(OUT_DIR, `${preset.voiceId}.mp3`);

    if (!force) {
      try {
        await fs.access(filePath);
        console.log(`⏭  ${preset.id.padEnd(24)} (${preset.voiceId}) already exists, skipping`);
        skipped++;
        continue;
      } catch {
        /* fall through */
      }
    }

    const startedAt = Date.now();
    try {
      const result = await generateHebrewVoiceover({
        text: SAMPLE_TEXT,
        voiceId: preset.voiceId,
        performanceNote: null,
        // Pin v3 — Hebrew works on this model only. Stays consistent
        // with what the runtime pipeline uses for actual scene voice-overs.
        modelId: 'eleven_v3',
      });
      await fs.writeFile(filePath, result.audioBytes);
      generated++;
      const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(
        `✅ ${preset.id.padEnd(24)} (${preset.voiceId}) saved ${(result.audioBytes.length / 1024).toFixed(0)}KB in ${dur}s`,
      );
    } catch (err) {
      failed++;
      console.error(`❌ ${preset.id.padEnd(24)} failed: ${(err as Error).message}`);
    }
  }

  const charsCharged = generated * SAMPLE_TEXT.length;
  console.log(
    `\nDone. generated=${generated}  skipped=${skipped}  failed=${failed}  ` +
      `chars=${charsCharged}  ≈$${((charsCharged / 1000) * 0.1).toFixed(3)} (multilingual_v2 @ $0.10/1K)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
