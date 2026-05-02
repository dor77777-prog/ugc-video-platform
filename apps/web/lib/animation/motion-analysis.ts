// Vision-grounded motion analysis. Before sending an image to Kling/Grok
// i2v, we ask gpt-5.5-mini to LOOK at the actual generated frame AND
// read the surrounding script, then describe what should plausibly move
// and how that motion should serve the narrative.
//
// Two-master design: motion that contradicts the pixels looks fake;
// motion that ignores the narrative looks generic. The model must
// satisfy both — the still's physical reality AND the script's arc.
//
// Output is structured (JSON schema, strict mode). The fields are
// shaped so downstream renderers can compose Kling-flavored or
// Grok-flavored prompts without re-parsing free text.
//
// V27.10.16 — migrated gpt-4o-mini → gpt-5.5-mini per the OpenAI
// migration guide. Three concrete wins for this workload:
//   1. gpt-5.5 image inputs preserve up to 2048px (`detail: 'high'`)
//      vs gpt-4o-mini's resize-down — pixel detail directly drives
//      the accuracy of contactAnchors / framingRisks / primaryAction.
//   2. Stronger instruction following on the two-master constraint
//      (pixels + narrative). The `reasoning.effort: 'low'` setting
//      gives the model just enough headroom for the multi-master
//      reasoning without burning tokens on overthinking.
//   3. Responses API (vs Chat Completions) plays nicer with reasoning
//      models and the structured-output strict mode. Same JSON shape
//      consumed downstream, no contract change for callers.

import OpenAI from 'openai';
import { withRetry } from '@/lib/utils/retry';

const MODEL = process.env.OPENAI_MOTION_VISION_MODEL ?? 'gpt-5.5-mini';
const REQUEST_TIMEOUT_MS = 30_000;

export class MotionAnalysisConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MotionAnalysisConfigError';
  }
}

export type NarrativeRole =
  | 'hook'
  | 'pain'
  | 'reveal'
  | 'demo'
  | 'proof'
  | 'cta'
  | 'support';

// Structured output the vision model returns. Each field maps to a
// piece of the eventual i2v prompt — keeping them separate lets the
// per-provider renderers (kling vs grok) compose them differently.
export interface MotionAnalysis {
  /** One-line gist of what's in the frame (used as the opening of the prompt). */
  sceneGist: string;
  /** What human(s) appear: position, body angle, what they're holding/doing. */
  subjects: string;
  /** The dominant action in physics language — moving subject, verb,
   *  measured amount, contact context. e.g. "right wrist rotates ~15°
   *  so the bottle label tilts toward the light". */
  primaryAction: string;
  /** Secondary subtle motions that round out realism (light shift, fabric, steam, hair). */
  secondaryMotions: string[];
  /** Camera intent — what camera move (if any) is suitable for this frame. */
  cameraIntent: string;
  /** What MUST stay stable (product label, brand, environment) — fed as "preserve" hints. */
  preserveElements: string[];
  /** Negatives the model identified are at risk in this specific frame. */
  framingRisks: string[];
  /** Vision model's read on whether the face is clearly visible + speaking-suitable. */
  faceState: 'clear_speaking_suitable' | 'partial' | 'no_face' | 'unsuitable';
  /** V14+ — physical contact points (hand-object, active-part-surface).
   *  Empty for non-touching scenes. e.g. ["thumb across label",
   *  "four fingers wrap bottle body", "fingertips press skin"].
   *  Optional in TS so old cached MotionAnalysis JSON (pre-V14) still
   *  type-checks; the JSON schema marks it required for new generations. */
  contactAnchors?: string[];
  /** V14+ — duration in seconds the primary action arc takes.
   *  0 means no arc / continuous ambient motion only. */
  motionTimeframeSeconds?: number;
  /** V14+ — the resting state at the end of the clip. e.g. "wrist
   *  settles back to neutral", "label holds facing camera",
   *  "fingertip rests on the surface". */
  motionEndpoint?: string;
  /** V14+ — narrative role this scene plays in the script arc. */
  narrativeRole?: NarrativeRole;
  /** V14+ — emotional tone the motion should carry, 2-6 words.
   *  e.g. "quiet relief", "confident reveal", "gentle care". */
  emotionalTone?: string;
  /** Token usage so we can record cost. */
  usage: { inputTokens: number; outputTokens: number };
}

/** Narrative context passed in alongside the image so the model can
 *  decide motion that serves the script — not just the pixels. */
export interface ScriptContext {
  framework?: string | null;
  productName?: string | null;
  /** Selected hook (Hebrew) — the opening line of the ad. */
  hookHebrew?: string | null;
  /** 0-based index of the current scene within the script. */
  currentSceneIndex: number;
  /** Total scenes in the script (so the model knows position in the arc). */
  totalScenes: number;
  /** Hebrew text the creator is speaking in THIS scene (TTS form). */
  currentSceneTextHebrew?: string | null;
  /** Narrative function tag for this scene (establish_pain, prove_it_works, ...). */
  currentSceneGoal?: string | null;
  /** One-line gist of the scene before this one (if any). */
  prevSceneGist?: string | null;
  /** One-line gist of the scene after this one (if any). */
  nextSceneGist?: string | null;
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
  /** V14+ — full narrative context. When omitted the model only sees
   *  the still + visualBrief, which is the legacy behavior. */
  scriptContext?: ScriptContext | null;
}

const SYSTEM = `You are a video-animation director planning a 5-10 second image-to-video clip from a still frame for a Hebrew UGC product ad.

You serve TWO masters:
  1. The PIXEL reality — what's actually in the still: hands, contact points, product, environment, lighting.
  2. The NARRATIVE reality — what THIS scene means in the script: where it sits in the arc, what the creator is saying right now, what came before, what comes after, the emotional tone.
Motion that contradicts the pixels looks fake. Motion that ignores the narrative looks generic. Both ruin the ad.

Speak in PHYSICS, not choreography:
  - Name the moving subject (right wrist, fingertips, jaw).
  - Use measured amounts (~15 degrees, ~3 seconds, ~5mm).
  - Identify contact points (thumb across the label, four fingers wrap the bottle, fingertip presses the skin).
  - Always state an endpoint — where the motion LANDS at the clip's end. Open-ended motion ("hand moves naturally") makes i2v models loop or vibrate.
  - For talking-head stills, the silent-speaking mouth IS the primary action — a "small breath, lips parting as if mid-word, a natural blink, a small chin-dip" is more useful than "subtle facial movement".

For non-touching scenes (lifestyle, full-body, environment), contactAnchors is an empty array — that's fine.
For static product close-ups, motionTimeframeSeconds may be 0 — set the primaryAction to ambient (slow drift, light shift) and the endpoint to "scene holds".

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
    'contactAnchors',
    'motionTimeframeSeconds',
    'motionEndpoint',
    'narrativeRole',
    'emotionalTone',
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
    contactAnchors: { type: 'array', items: { type: 'string' } },
    motionTimeframeSeconds: { type: 'number' },
    motionEndpoint: { type: 'string' },
    narrativeRole: {
      type: 'string',
      enum: ['hook', 'pain', 'reveal', 'demo', 'proof', 'cta', 'support'],
    },
    emotionalTone: { type: 'string' },
  },
  additionalProperties: false,
} as const;

function buildScriptContextBlock(ctx: ScriptContext | null | undefined): string {
  if (!ctx) return '';
  const lines: string[] = ['Narrative context:'];
  if (ctx.framework) lines.push(`  Framework: ${ctx.framework}`);
  if (ctx.productName) lines.push(`  Product: ${ctx.productName}`);
  if (ctx.hookHebrew) lines.push(`  Selected hook (Hebrew): "${ctx.hookHebrew.slice(0, 200)}"`);
  lines.push(
    `  Position in arc: scene ${ctx.currentSceneIndex + 1} of ${ctx.totalScenes}`,
  );
  if (ctx.currentSceneGoal) lines.push(`  Scene goal: ${ctx.currentSceneGoal}`);
  if (ctx.currentSceneTextHebrew) {
    lines.push(
      `  THIS scene's Hebrew line (creator's voice-over): "${ctx.currentSceneTextHebrew.slice(0, 400)}"`,
    );
  }
  if (ctx.prevSceneGist)
    lines.push(`  Previous scene: "${ctx.prevSceneGist.slice(0, 200)}"`);
  if (ctx.nextSceneGist) lines.push(`  Next scene: "${ctx.nextSceneGist.slice(0, 200)}"`);
  lines.push(
    '  Use this context to choose narrativeRole, emotionalTone, and to bias primaryAction toward the beat THIS scene must hit.',
  );
  return lines.join('\n');
}

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

  const ctxBlock = buildScriptContextBlock(input.scriptContext);

  const userText = [
    `Scene type: ${input.sceneGenerationType ?? 'unknown'}.`,
    `Talking-head pass downstream: ${input.isTalkingHead ? 'YES' : 'NO'}.`,
    input.visualBrief
      ? `Original visual brief from the script: """${input.visualBrief.slice(0, 800)}"""`
      : '',
    ctxBlock,
    '',
    'Analyse the still in light of the narrative context and return motion guidance grounded in BOTH.',
    "If it is a talking-head still: primaryAction = the silent speaking beat (small breath, lips parting as if mid-word, natural blink, micro-eyebrow). contactAnchors usually empty. The narrativeRole + emotionalTone come from the Hebrew line + scene goal.",
    "If it is a product/hands/closeup still: primaryAction = the verb the hands and product perform, in physics language with a measured amount and an endpoint. contactAnchors lists every meaningful hand-object or fingertip-surface contact. Keep face emphasis low.",
    "preserveElements should call out the brand/product label and any text on the package — these MUST stay stable through animation.",
    "framingRisks: list things in this specific frame that could go wrong (e.g. product crops out, label warps, hand has 6 fingers in the source, mirror reflection physics).",
    'motionTimeframeSeconds: integer seconds the primary action takes (0 if static / continuous ambient).',
    'motionEndpoint: the resting state at the end of the clip — never leave the motion open.',
    'Respond with valid JSON only, matching the schema.',
  ]
    .filter(Boolean)
    .join('\n');

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  let resp;
  try {
    // V27.10.16 — Responses API + reasoning.effort: 'low' + detail: 'high'.
    // Older OpenAI SDK typings don't yet declare `reasoning` or the new
    // input-image `detail` field, so we cast through unknown at the
    // SDK boundary while keeping our payload type-checked above.
    // V26.11 — transparent retry on transient (network/5xx) failures.
    const requestPayload = {
      model: MODEL,
      instructions: SYSTEM,
      input: [
        {
          role: 'user' as const,
          content: [
            { type: 'input_text' as const, text: userText },
            { type: 'input_image' as const, image_url: imageContent.url, detail: 'high' as const },
          ],
        },
      ],
      reasoning: { effort: 'low' as const },
      text: {
        format: {
          type: 'json_schema' as const,
          name: 'motion_analysis',
          strict: true,
          schema: SCHEMA as unknown as Record<string, unknown>,
        },
      },
    };
    const responsesApi = client.responses as unknown as {
      create: (
        args: typeof requestPayload,
        opts?: { signal?: AbortSignal },
      ) => Promise<{
        output_text: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      }>;
    };
    resp = await withRetry(
      () => responsesApi.create(requestPayload, { signal: ac.signal }),
      { label: 'openai.motion_analysis', earlyFailWindowMs: 15_000 },
    );
  } finally {
    clearTimeout(t);
  }

  const raw = resp.output_text ?? '';
  let parsed: Omit<MotionAnalysis, 'usage'>;
  try {
    parsed = JSON.parse(raw) as Omit<MotionAnalysis, 'usage'>;
  } catch {
    throw new Error(`Vision response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  return {
    ...parsed,
    usage: {
      inputTokens: resp.usage?.input_tokens ?? 0,
      outputTokens: resp.usage?.output_tokens ?? 0,
    },
  };
}

// Build a Kling-ready motion prompt from the structured analysis. The
// prompt builder in kling.ts checks for a `motionAnalysis` field and
// folds these strings into its template — keeping the structured
// fields here so other providers (Grok, future Runway) can consume
// the same analysis with their own renderers.
export function renderMotionAnalysisToPrompt(a: MotionAnalysis): string {
  const lines = [
    a.sceneGist,
    `Subjects: ${a.subjects}.`,
    `Primary motion: ${a.primaryAction}.`,
    a.contactAnchors && a.contactAnchors.length > 0
      ? `Contact: ${a.contactAnchors.join('; ')}.`
      : '',
    a.motionTimeframeSeconds && a.motionTimeframeSeconds > 0
      ? `Action takes ~${a.motionTimeframeSeconds}s.`
      : '',
    a.motionEndpoint ? `End state: ${a.motionEndpoint}.` : '',
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

interface ImageContent {
  /** data: or https: URL ready to feed Responses API as `image_url`. */
  url: string;
}

async function imageToContent(imageUrl: string): Promise<ImageContent> {
  // V12.1 — read-public-asset handles both disk + HTTP fallback so
  // Vercel (where public/ is excluded from the function bundle)
  // doesn't ENOENT on /avatars/*.png.
  // V27.10.16 — Responses API takes `image_url` as a plain string, not
  // the nested `{ url }` shape Chat Completions expected.
  const { readPublicAssetAsDataUrl } = await import('@/lib/storage/read-public-asset');
  const dataUrl = await readPublicAssetAsDataUrl(imageUrl);
  return { url: dataUrl };
}
