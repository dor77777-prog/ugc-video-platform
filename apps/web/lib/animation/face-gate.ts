// Face-detection / vision quality gate run BEFORE we send a clip to
// PixVerse for lip-sync. The gate looks at the scene's still image
// (gpt-image-2 output, which is what Kling animates from), runs a
// gpt-4o-mini vision pass, and returns whether the frame is suitable
// for lip-sync.
//
// Why we run on the still and not the rendered Kling video:
//   - Cheaper (one vision call per scene instead of N video frames).
//   - Earlier in the pipeline — if the gate rejects, we save the
//     Kling clip as the final output without uploading anything to
//     PixVerse, which would have cost a token.
//   - The Kling video is animated FROM the still, so face composition
//     transfers 1:1. If the still has no face, the video won't either.
//
// Output shape matches the contract from the V7 product spec:
//   {
//     fullFaceDetected: boolean,
//     mouthVisible: boolean,
//     faceVisibility: 'clear_front_facing' | 'partial_face' | 'profile' | 'no_face',
//     faceDetectionConfidence: number 0..1,
//     shouldLipSync: boolean,
//     reason: string
//   }

import OpenAI from 'openai';
import { withRetry } from '@/lib/utils/retry';

export type FaceVisibility = 'clear_front_facing' | 'partial_face' | 'profile' | 'no_face';

export interface FaceGateResult {
  fullFaceDetected: boolean;
  mouthVisible: boolean;
  faceVisibility: FaceVisibility;
  faceDetectionConfidence: number;
  shouldLipSync: boolean;
  reason: string;
  /** Raw model output for audit + debugging. */
  rawJson: unknown;
  usage: { inputTokens: number; outputTokens: number };
}

const FACE_GATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'fullFaceDetected',
    'mouthVisible',
    'faceVisibility',
    'faceDetectionConfidence',
    'shouldLipSync',
    'reason',
  ],
  properties: {
    fullFaceDetected: {
      type: 'boolean',
      description:
        'true ONLY when a single human face is fully visible, front-facing or near-front-facing, large enough that lip motion would be perceptible, with no occlusions covering the face. Profile shots, hand-on-chin, masks, multiple faces → false.',
    },
    mouthVisible: {
      type: 'boolean',
      description:
        'true ONLY when the mouth is unambiguously visible. A hand on the chin, a microphone, a cup, a product near the lips → false. If face is in profile and only one corner of the mouth shows → false.',
    },
    faceVisibility: {
      type: 'string',
      enum: ['clear_front_facing', 'partial_face', 'profile', 'no_face'],
    },
    faceDetectionConfidence: {
      type: 'number',
      description: '0.0 = certain there is no face. 1.0 = certain about the assessment.',
    },
    shouldLipSync: {
      type: 'boolean',
      description:
        'true ONLY when fullFaceDetected AND mouthVisible AND faceVisibility="clear_front_facing". Use this as the single boolean the pipeline reads — never compute it from the others, the model is the source of truth.',
    },
    reason: {
      type: 'string',
      description:
        '1 short Hebrew or English sentence explaining the decision. e.g. "Clear front-facing full face with visible mouth" or "Hands-only product demo, no face in frame".',
    },
  },
} as const;

const SYSTEM_PROMPT = `You are a strict pre-filter for a lip-sync pipeline. Look at the image and decide whether it is suitable for a lip-sync model that will animate the lips to match an audio track.

Return shouldLipSync = true ONLY when ALL of these are true:
  - Exactly one human face is the dominant subject of the frame.
  - The face is front-facing or near-front-facing (no profile, no >45° head turn).
  - The mouth is fully visible — not covered by hands, hair, microphones, products, or shadows.
  - The face is large enough that mouth motion would be perceptible (face area > ~10% of frame).
  - No multiple faces, no half-faces, no doll/cartoon/sculpture/mask.

For any product-demo / hands-only / closeup-product / cta-visual scene where the face is absent or peripheral → shouldLipSync = false.

Be conservative. False positives waste lip-sync API spend AND produce uncanny outputs. If you're unsure, return false with low confidence.`;

const USER_PROMPT = 'Analyze this still and return the JSON.';

export class FaceGateConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FaceGateConfigError';
  }
}

export async function runFaceGate(input: {
  imageUrl: string;
}): Promise<FaceGateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new FaceGateConfigError('OPENAI_API_KEY not set; face-gate cannot run.');
  }

  const openai = new OpenAI({ apiKey });
  // V27.10.16 — gpt-5.5-mini default. Face-gate is a binary
  // classification (face suitable for lip-sync? yes/no), so we run it
  // with `reasoning.effort: 'none'` per the OpenAI migration guide's
  // explicit recommendation for classification tasks. `detail: 'low'`
  // because a 512x512 view is more than enough to detect a face — no
  // need to spend tokens on full pixel fidelity here.
  const model = process.env.OPENAI_FACE_GATE_MODEL ?? 'gpt-5.5-mini';

  // Resolve local /uploads/... URLs to a data URL so the OpenAI API
  // can see them without a public host.
  const imageContent = await resolveImageForOpenAI(input.imageUrl);

  // V26.11 — transparent retry on transient (network/5xx) failures.
  // V27.10.16 — Responses API. Older OpenAI SDK typings don't yet
  // declare `reasoning` or the new input-image `detail` field, so we
  // cast at the SDK boundary while keeping the payload type-checked.
  const requestPayload = {
    model,
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: 'user' as const,
        content: [
          { type: 'input_text' as const, text: USER_PROMPT },
          { type: 'input_image' as const, image_url: imageContent, detail: 'low' as const },
        ],
      },
    ],
    reasoning: { effort: 'none' as const },
    text: {
      format: {
        type: 'json_schema' as const,
        name: 'face_gate',
        strict: true,
        schema: FACE_GATE_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  };
  const responsesApi = openai.responses as unknown as {
    create: (args: typeof requestPayload) => Promise<{
      output_text: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
  const response = await withRetry(
    () => responsesApi.create(requestPayload),
    { label: 'openai.face_gate', earlyFailWindowMs: 15_000 },
  );

  const content = response.output_text;
  if (!content) {
    throw new Error('face-gate: empty model response');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`face-gate: bad JSON: ${(err as Error).message}`);
  }

  return {
    fullFaceDetected: !!parsed.fullFaceDetected,
    mouthVisible: !!parsed.mouthVisible,
    faceVisibility: parsed.faceVisibility as FaceVisibility,
    faceDetectionConfidence:
      typeof parsed.faceDetectionConfidence === 'number'
        ? (parsed.faceDetectionConfidence as number)
        : 0,
    shouldLipSync: !!parsed.shouldLipSync,
    reason: typeof parsed.reason === 'string' ? (parsed.reason as string) : '',
    rawJson: parsed,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}

async function resolveImageForOpenAI(url: string): Promise<string> {
  // V12.1 — readPublicAssetAsDataUrl handles both local disk (dev)
  // and HTTP fallback (Vercel public/ excluded from bundle).
  const { readPublicAssetAsDataUrl } = await import('@/lib/storage/read-public-asset');
  return readPublicAssetAsDataUrl(url);
}
