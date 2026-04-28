// ElevenLabs Hebrew TTS — direct REST integration.
//
// Why no SDK: the official @elevenlabs/elevenlabs-js bundles client-side
// helpers we don't need on the server, and the v1 REST surface for
// /text-to-speech/{voice_id} is small enough that a hand-rolled fetch is
// clearer for our auditing + cost-tracking needs.
//
// CRITICAL — Hebrew model selection:
//
//   eleven_v3              → 70+ languages INCLUDING Hebrew (heb). USE THIS.
//   eleven_multilingual_v2 → 29 languages, Hebrew NOT supported. The API
//                            still accepts Hebrew text but the model wasn't
//                            trained on it, producing GIBBERISH output.
//   eleven_flash_v2_5      → v2 langs + hu/no/vi. Hebrew NOT supported.
//
// Per the official ElevenLabs models doc (April 2026), v3 is the only
// production model that lists Hebrew. It's labeled "research preview" —
// non-deterministic, may need regen — but for Hebrew there is no other
// choice in the lineup. Stability is bumped (≥0.65) to suppress v3's
// "creative mode" hallucinations on long-form Hebrew.
//
// We pass modelId EXPLICITLY from voice-impl.ts (not via env at runtime)
// because Next.js dev server caches process.env at startup — editing .env
// without restart silently keeps using the old model.
//
// Performance/emotion mapping: the script's per-scene `performanceNote`
// field (Hebrew text like "כמעט לוחש" or "פאנץ' חד באמצע") maps to
// ElevenLabs voice settings. Higher `style` = more emotional range, higher
// `stability` = more consistent across sentences. Whisper-soft notes get
// low style + high stability; punchy notes get higher style + lower
// stability.

import { LlmConfigError } from '../llm/scripts';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';
const SINGLE_CALL_TIMEOUT_MS = 90_000; // 5s of audio rarely takes >30s

export class VoiceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceConfigError';
  }
}
export class VoiceTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoiceTimeoutError';
  }
}

export interface VoiceSettings {
  /** 0–1. Higher = more consistent, less expressive. */
  stability: number;
  /** 0–1. Higher = more amplified emotional style transfer. */
  style: number;
  /** 0–1. Higher = closer to the cloned voice's timbre. */
  similarityBoost: number;
  /** Speaker boost for clearer mid-range. */
  useSpeakerBoost: boolean;
}

export interface GenerateVoiceoverInput {
  text: string;
  voiceId: string; // ElevenLabs voice id (uuid-ish)
  performanceNote?: string | null; // Hebrew direction → derives voice settings
  modelId?: string; // override env default
}

export interface GenerateVoiceoverResult {
  audioBytes: Buffer;
  durationSeconds: number; // estimated; ElevenLabs doesn't return duration
  model: string;
  voiceSettings: VoiceSettings;
}

export async function generateHebrewVoiceover(
  input: GenerateVoiceoverInput,
): Promise<GenerateVoiceoverResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new VoiceConfigError(
      'ELEVENLABS_API_KEY is not set. Add it to .env to enable voice generation.',
    );
  }
  if (!input.text.trim()) throw new VoiceConfigError('Empty voiceover text');
  if (!input.voiceId) throw new VoiceConfigError('Missing voiceId');

  // eleven_v3 is the only ElevenLabs model that supports Hebrew (heb).
  // Do NOT fall back to eleven_multilingual_v2 — it accepts Hebrew text
  // silently but produces gibberish (no Hebrew training data).
  const modelId = input.modelId ?? process.env.ELEVENLABS_MODEL_ID ?? 'eleven_v3';
  const voiceSettings = deriveVoiceSettings(input.performanceNote ?? null);

  const url = `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=mp3_44100_128`;

  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), SINGLE_CALL_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: input.text,
        model_id: modelId,
        voice_settings: {
          stability: voiceSettings.stability,
          similarity_boost: voiceSettings.similarityBoost,
          style: voiceSettings.style,
          use_speaker_boost: voiceSettings.useSpeakerBoost,
        },
      }),
      signal: ac.signal,
    });
  } catch (err) {
    if (ac.signal.aborted) {
      throw new VoiceTimeoutError(
        `ElevenLabs did not respond within ${SINGLE_CALL_TIMEOUT_MS / 1000}s.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '<no body>');
    throw new Error(`ElevenLabs ${res.status}: ${detail.slice(0, 300)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const audioBytes = Buffer.from(arrayBuffer);
  // ElevenLabs's REST endpoint doesn't return audio metadata; estimate from
  // text length. Hebrew at natural pace ≈ 14 chars/sec including spaces.
  // The estimate is good enough for credit/cost display; the actual MP3
  // duration is read from the file later by ffprobe (or skipped — not
  // critical for the UI).
  const durationSeconds = Math.max(2, Math.min(20, input.text.length / 14));

  return {
    audioBytes,
    durationSeconds: Number(durationSeconds.toFixed(2)),
    model: modelId,
    voiceSettings,
  };
}

// Maps the Hebrew performance note to ElevenLabs voice settings. The note
// is a short direction the script LLM wrote (e.g. "כמעט לוחש", "פאנץ' חד
// באמצע", "מתחיל בלי חיוך"). We pattern-match common cues and fall back to
// neutral defaults when no note matches.
//
// IMPORTANT for Hebrew + multilingual_v2: the *minimum* stability we use
// is 0.65. Below that, the model drifts and produces gibberish on Hebrew
// text — especially when the text mixes Latin brand names ("HydroPure")
// or numerals. The cost is slight: less emotional swing, but consistent
// pronunciation. For production UGC this is the right trade.
export function deriveVoiceSettings(performanceNote: string | null): VoiceSettings {
  const note = (performanceNote ?? '').toLowerCase();

  // Soft / whispered / intimate
  if (/לוחש|רך|אישי|שקט|לחישה/.test(note)) {
    return { stability: 0.9, style: 0.1, similarityBoost: 0.85, useSpeakerBoost: true };
  }
  // Punchy / fast / excited — was 0.45 stab + 0.65 style before, which
  // caused v3-mode "creative" hallucinations on Hebrew. Bumped to safe
  // floor (0.65/0.45) — still energetic but coherent.
  if (/פאנץ|חד|מהיר|אנרגי|נמרץ|התלהב/.test(note)) {
    return { stability: 0.65, style: 0.45, similarityBoost: 0.8, useSpeakerBoost: true };
  }
  // Tired / contemplative / honest
  if (/עייף|חוש|הודה|כן|אמיתי|אישי/.test(note)) {
    return { stability: 0.75, style: 0.2, similarityBoost: 0.8, useSpeakerBoost: true };
  }
  // Confident / assertive / sales-aware
  if (/בטח|חזק|מומל|הוכחה|מוכר/.test(note)) {
    return { stability: 0.7, style: 0.4, similarityBoost: 0.8, useSpeakerBoost: true };
  }
  // Default — neutral conversational Hebrew UGC
  return { stability: 0.7, style: 0.3, similarityBoost: 0.8, useSpeakerBoost: true };
}

// Tag the LlmConfigError class so the action layer can surface a clean
// Hebrew error if both keys are missing.
export const VoiceErrors = { VoiceConfigError, VoiceTimeoutError, LlmConfigError };
