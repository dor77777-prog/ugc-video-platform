// GET /api/voice/sample/[voiceId] — on-demand Hebrew voice preview.
//
// The VoicePicker UI plays this URL when the user clicks ▶ on a voice
// card. We synthesize a short Hebrew sample via ElevenLabs Multilingual
// v2, cache the MP3 to disk under public/voice-samples/, and stream it
// back. Repeat clicks for the same voice id are served from the cache —
// no extra API calls.
//
// Cost per first-time generation ≈ $0.005. After cache, $0.

import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { generateHebrewVoiceover } from '@/lib/voice/elevenlabs';

// Kept short on purpose — ElevenLabs charges 1 credit per character, and
// dev API keys often have a tight per-key quota cap. ~20 chars × 12 voices
// = 240 credits total to populate the full preview cache the first time.
const SAMPLE_TEXT = 'היי, ככה אני נשמעת בעברית.';
const CACHE_DIR_REL = path.join('public', 'voice-samples');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ voiceId: string }> },
) {
  const { voiceId } = await params;
  if (!voiceId || !/^[A-Za-z0-9_-]+$/.test(voiceId)) {
    return NextResponse.json({ error: 'invalid voiceId' }, { status: 400 });
  }

  const cacheDir = path.join(process.cwd(), CACHE_DIR_REL);
  const cachePath = path.join(cacheDir, `${voiceId}.mp3`);

  // 1. Try the cache first.
  try {
    const cached = await fs.readFile(cachePath);
    return audioResponse(cached);
  } catch {
    /* fall through to generate */
  }

  // 2. Synthesize.
  let audioBytes: Buffer;
  try {
    const result = await generateHebrewVoiceover({
      text: SAMPLE_TEXT,
      voiceId,
      performanceNote: null,
      // Pin v3 explicitly — Hebrew is only supported on this model.
      modelId: 'eleven_v3',
    });
    audioBytes = result.audioBytes;
  } catch (err) {
    const detail = (err as Error).message;
    // Detect ElevenLabs's quota_exceeded so the picker can surface a useful
    // Hebrew message ("API key out of credits") instead of generic "sample
    // failed". Pattern matches the JSON error payload they return on 401.
    const reason = /quota_exceeded/i.test(detail)
      ? 'quota_exceeded'
      : /paid_plan_required|payment_required|library voices via the API/i.test(detail)
        ? 'paid_plan_required'
        : /401|invalid_api_key|invalid api key/i.test(detail)
          ? 'invalid_api_key'
          : /ELEVENLABS_API_KEY is not set/.test(detail)
            ? 'not_configured'
            : 'generic';
    return NextResponse.json(
      { error: 'sample generation failed', reason, detail },
      { status: 502 },
    );
  }

  // 3. Cache to disk for next time.
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachePath, audioBytes);
  } catch {
    /* cache write is best-effort */
  }

  return audioResponse(audioBytes);
}

function audioResponse(buf: Buffer): NextResponse {
  // Convert Buffer to Uint8Array for NextResponse body compatibility (
  // works around stricter Node BodyInit typings on newer Next versions).
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
