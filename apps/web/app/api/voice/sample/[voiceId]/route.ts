// GET /api/voice/sample/[voiceId] — on-demand Hebrew voice preview.
//
// Same-origin proxy so the VoicePicker `<audio>` tag can play samples
// without hitting CORS preflight against R2 (R2's `pub-*.r2.dev` domain
// returns 403 on OPTIONS by default — fixing CORS on the bucket needs
// admin-level R2 token; this proxy bypasses the requirement entirely).
//
// Lookup order (first hit wins):
//   1. R2 — bucket key: voice-samples/<voiceId>.mp3 (production cache)
//   2. Local disk — apps/web/public/voice-samples/<voiceId>.mp3 (dev cache)
//   3. ElevenLabs synthesize on demand → cache to BOTH R2 + local disk
//
// Cost per first-time generation ≈ $0.005. After cache, $0.

import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { generateHebrewVoiceover } from '@/lib/voice/elevenlabs';
import { findVoicePreset } from '@/lib/voice/voice-presets';

// V26.SAMPLE — sample text now matches the voice's gender. Pre-V26
// every voice (male and female) used the feminine line "ככה אני
// נשמעת בעברית", which sounds wrong on the male preset cards.
//
// Cache strategy: female voices keep using the existing R2 cache
// key `<voiceId>.mp3` (no re-spend on the 23 female voices that are
// already cached). Male voices get a NEW cache key
// `<voiceId>__m.mp3` so they cleanly miss the old cache, regenerate
// once, and serve from the new key forever after.
const SAMPLE_TEXT_FEMALE = 'היי, ככה אני נשמעת בעברית.';
const SAMPLE_TEXT_MALE = 'היי, ככה אני נשמע בעברית.';
const CACHE_DIR_REL = path.join('public', 'voice-samples');

const R2_PUBLIC_BASE = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ voiceId: string }> },
) {
  const { voiceId } = await params;
  if (!voiceId || !/^[A-Za-z0-9_-]+$/.test(voiceId)) {
    return NextResponse.json({ error: 'invalid voiceId' }, { status: 400 });
  }

  // V26.SAMPLE — pick gendered sample text + cache key per voice.
  const preset = findVoicePreset(voiceId);
  const gender = preset?.gender ?? 'female';
  const sampleText = gender === 'male' ? SAMPLE_TEXT_MALE : SAMPLE_TEXT_FEMALE;
  const cacheFilename = gender === 'male' ? `${voiceId}__m.mp3` : `${voiceId}.mp3`;

  // 1. Try R2 first (production has 30 voice samples there from V12.2).
  if (R2_PUBLIC_BASE) {
    try {
      const r2Url = `${R2_PUBLIC_BASE}/voice-samples/${cacheFilename}`;
      const r2Res = await fetch(r2Url);
      if (r2Res.ok) {
        const bytes = Buffer.from(await r2Res.arrayBuffer());
        return audioResponse(bytes);
      }
    } catch {
      /* fall through */
    }
  }

  // 2. Try local disk cache (dev convenience).
  const cacheDir = path.join(process.cwd(), CACHE_DIR_REL);
  const cachePath = path.join(cacheDir, cacheFilename);
  try {
    const cached = await fs.readFile(cachePath);
    return audioResponse(cached);
  } catch {
    /* fall through to synthesize */
  }

  // 3. Synthesize via ElevenLabs.
  let audioBytes: Buffer;
  try {
    const result = await generateHebrewVoiceover({
      text: sampleText,
      voiceId,
      performanceNote: null,
      // Pin v3 explicitly — Hebrew is only supported on this model.
      modelId: 'eleven_v3',
    });
    audioBytes = result.audioBytes;
  } catch (err) {
    const detail = (err as Error).message;
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

  // 4. Cache to local disk (dev) and R2 (prod) for next time.
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cachePath, audioBytes);
  } catch {
    /* dev-disk cache best-effort */
  }
  if (R2_PUBLIC_BASE) {
    try {
      const { getStorage } = await import('@/lib/storage');
      const storage = await getStorage();
      await storage.putBytes({
        folder: 'voice-samples',
        filename: `${voiceId}.mp3`,
        data: audioBytes,
        contentType: 'audio/mpeg',
      });
    } catch {
      /* R2 cache best-effort */
    }
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
