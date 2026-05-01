// Vision-grounded motion analysis. Before sending an image to Kling
// i2v, we ask gpt-4o-mini to LOOK at the actual generated frame and
// describe what should plausibly move.
//
// Why this exists: Kling i2v takes (still image + text prompt). Our
// previous text prompts were GENERIC ("hands move naturally", "subtle
// blinks") so Kling defaulted to "make the avatar blink and breathe"
// regardless of what was in the frame. An image of "hand pouring
// HydroPure into a tier-elevated" got the same blinks treatment as a face
// close-up — total disconnect between frame content and motion.
//
// Now: vision model reads the frame and produces a SPECIFIC motion
// brief grounded in what's actually visible (the bottle pours, the
// hand tilts, the gaze follows the action, etc). Cost is tiny
// ($0.001-0.005 per scene) but the Kling output looks ~10x more
// believable.

import OpenAI from 'openai';
import { withRetry } from '@/lib/utils/retry';

const MODEL = process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 30_000;

export class MotionAnalysisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionAnalysisConfigError';
  }
}

// Structured output the vision model returns. Each field maps to a
// piece of the eventual Kling prompt — keeping them separate lets the
// prompt builder weight them, drop pieces, or swap providers later.
export interface MotionAnalysis {
  /** One-line gist of what's in the frame (used as the opening of the Kling prompt). */
  sceneGist: string;
  /** What human(s) appear: position, body angle, what they're holding/doing. */
  subjects: string;
  /** The dominant action that should animate (the "verb" of the scene). */
  primaryAction: string;
  /** Secondary subtle motions that round out the realism (light shift, fabric, steam, hair). */
  secondaryMotions: string[];
  /** Camera intent — what camera move (if any) is suitable for this frame. */
  cameraIntent: string;
  /** What MUST stay stable (product label, brand, environment) — fed as "preserve" hints. */
  preserveElements: string[];
  /** Negatives the model identified are at risk in this specific frame. */
  framingRisks: string[];
  /** Vision model's read on whether the face is clearly visible + speaking-suitable. */
  faceState: 'clear_speaking_suitable' | 'partial' | 'no_face' | 'unsuitable';
  /** Token usage so we can record cost. */
  usage: { inputTokens: number; outputTokens: number };
}

export interface AnalyzeInput {
  /** Public URL OR /uploads/... local path. */
  imageUrl: string;
  /** Hebrew/English text the LLM wrote in the script — context for what should happen. */
  visualBrief?: string | null;
  /** Whether this scene was routed as talking-head (changes what the model emphasizes). */
  isTalkingHead?: boolean;
  /** Scene type label (broll / product_demo / closeup_product / ...). */
  sceneGenerationType?: string | null;
}

const SYSTEM = `You are a video-animation director analysing a STILL FRAME that will be animated by an image-to-video model (Kling).
Your job is to produce a motion brief that tells the i2v model exactly what should move IN THIS FRAME.
The motion you describe must be GROUNDED in what's actually visible — never invent objects or actions that aren't in the image.
Always respond with valid JSON matching the schema. No prose outside the JSON.`;

const SCHEMA = {
  type: 'object',
  required: [
    'sceneGist',
    'subjects',
    'primaryAction',
    'secondaryMotions',
    'cameraIntent',
    'preserveElements',
    'framingRisks',
    'faceState',
  ],
  properties: {
    sceneGist: { type: 'string' },
    subjects: { type: 'string' },
    primaryAction: { type: 'string' },
    secondaryMotions: { type: 'array', items: { type: 'string' } },
    cameraIntent: { type: 'string' },
    preserveElements: { type: 'array', items: { type: 'string' } },
    framingRisks: { type: 'array', items: { type: 'string' } },
    faceState: {
      type: 'string',
      enum: ['clear_speaking_suitable', 'partial', 'no_face', 'unsuitable'],
    },
  },
  additionalProperties: false,
} as const;

export async function analyzeSceneForMotion(
  input: AnalyzeInput,
): Promise<MotionAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new MotionAnalysisConfigError('OPENAI_API_KEY not set.');
  }
  const client = new OpenAI({ apiKey });

  // Resolve image to a data URL gpt-4o-mini can read. Local /uploads/...
  // paths get base64-encoded; remote URLs pass through (cheaper for big
  // images since the model fetches them directly).
  const imageContent = await imageToContent(input.imageUrl);

  const userText = [
    `Scene type: ${input.sceneGenerationType ?? 'unknown'}.`,
    `Talking-head pass downstream: ${input.isTalkingHead ? 'YES' : 'NO'}.`,
    input.visualBrief
      ? `Original visual brief from the script: """${input.visualBrief.slice(0, 800)}"""`
      : '',
    '',
    'Analyse the still and return motion guidance grounded in what is visible.',
    "If it is a talking-head still: focus primaryAction on natural mid-sentence mouth + micro-expression + small body angle. Don't invent props.",
    "If it is a product/hands/closeup still: focus primaryAction on the verb the hands and product perform (pouring, tilting, applying, opening, mixing, spraying, holding to light). Keep face emphasis low.",
    "preserveElements should call out the brand/product label and any text on the package — these MUST stay stable through animation.",
    "framingRisks: list things in this specific frame that could go wrong (e.g. product crops out, label warps, hand has 6 fingers in the source, mirror reflection physics).",
    'Respond with valid JSON only, matching the schema.',
  ]
    .filter(Boolean)
    .join('\n');

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  let resp;
  try {
    // V26.11 — transparent retry on transient (network/5xx) failures.
    resp = await withRetry(
      () =>
        client.chat.completions.create(
          {
            model: MODEL,
            messages: [
              { role: 'system', content: SYSTEM },
              {
                role: 'user',
                content: [
                  { type: 'text', text: userText },
                  imageContent,
                ],
              },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'motion_analysis', strict: true, schema: SCHEMA },
            },
          },
          { signal: ac.signal },
        ),
      { label: 'openai.motion_analysis', earlyFailWindowMs: 15_000 },
    );
  } finally {
    clearTimeout(t);
  }

  const raw = resp.choices?.[0]?.message?.content ?? '';
  let parsed: Omit<MotionAnalysis, 'usage'>;
  try {
    parsed = JSON.parse(raw) as Omit<MotionAnalysis, 'usage'>;
  } catch {
    throw new Error(`Vision response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    ...parsed,
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    },
  };
}

// Build a Kling-ready motion prompt from the structured analysis. The
// prompt builder in kling.ts checks for a `motionAnalysis` field and
// folds these strings into its template — keeping the structured
// fields here so other providers (Sync.so, future Runway) can consume
// the same analysis.
export function renderMotionAnalysisToPrompt(a: MotionAnalysis): string {
  const lines = [
    a.sceneGist,
    `Subjects: ${a.subjects}.`,
    `Primary motion: ${a.primaryAction}.`,
    a.secondaryMotions.length > 0
      ? `Secondary motion: ${a.secondaryMotions.join('; ')}.`
      : '',
    `Camera: ${a.cameraIntent}.`,
    a.preserveElements.length > 0
      ? `MUST preserve through animation: ${a.preserveElements.join('; ')}.`
      : '',
    a.framingRisks.length > 0
      ? `AVOID: ${a.framingRisks.join('; ')}.`
      : '',
  ];
  return lines.filter(Boolean).join(' ');
}

/* ---------- helpers ---------- */

interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

async function imageToContent(imageUrl: string): Promise<ImageContentPart> {
  // V12.1 — read-public-asset handles both disk + HTTP fallback so
  // Vercel (where public/ is excluded from the function bundle)
  // doesn't ENOENT on /avatars/*.png.
  const { readPublicAssetAsDataUrl } = await import('@/lib/storage/read-public-asset');
  const dataUrl = await readPublicAssetAsDataUrl(imageUrl);
  return { type: 'image_url', image_url: { url: dataUrl } };
}
