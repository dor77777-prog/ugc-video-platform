// Image QA Evaluator — V11.
//
// Vision pass (gpt-4o-mini) that compares a generated scene image
// against its image brief + product visual analysis + Israeli realism
// rules. Returns a strict JSON QA report with checks, score,
// failureReasons, and correctiveActions. Drives the auto-regen loop
// in generate-impl.ts.
//
// Cost: ~$0.005 per QA pass (one gpt-4o-mini vision call). Compared
// to a $0.06 image regen, the QA is essentially free — and prevents
// shipping a frame that clearly contradicts the brief.

import { promises as fs } from 'fs';
import path from 'path';
import OpenAI from 'openai';
import type { ImageBrief } from '@/lib/image-briefs/image-brief-builder';
import type { ProductVisualAnalysis } from '@/lib/product-intelligence';

export class ImageQaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageQaConfigError';
  }
}

export interface ImageQaInput {
  /** Generated image — local /uploads/... or remote URL. */
  imageUrl: string;
  /** The brief the image was supposed to satisfy. */
  brief: ImageBrief;
  /** Visual analysis of the source product (when available). The QA
   *  uses activePart / contactPoint / substanceVisualType to validate
   *  that the generated frame depicts the product correctly. */
  visualAnalysis?: ProductVisualAnalysis | null;
  /** Whether the scene was tagged as a problem scene (relaxes product
   *  visibility checks). */
  isProblemScene?: boolean;
  /** Whether the scene is a talking-head (relaxes product use checks
   *  but still validates Israeli realism). */
  isTalkingHead?: boolean;
}

export interface ImageQaChecks {
  sceneTypeMatch: boolean;
  productUseAccuracy: boolean;
  visualProofStrength: boolean;
  environmentMatch: boolean;
  israeliRealism: boolean;
  mustShowSatisfied: boolean;
  mustAvoidViolated: boolean;
  productVisibility: boolean;
  narrationAlignment: boolean;
}

export interface ImageQaResult {
  sceneNumber: number;
  passed: boolean;
  score: number;
  checks: ImageQaChecks;
  failureReasons: string[];
  correctiveActions: string[];
  /** Convenience flag — true when ANY critical mustAvoid item was
   *  detected. Triggers an immediate regen even if score is high. */
  hasCriticalViolation: boolean;
  /** Token usage for cost forensics. */
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

const SYSTEM = `You are a strict image-QA reviewer for a Hebrew UGC product ad pipeline. You see ONE generated image plus its brief, and you decide whether the image earns its place in the ad.

Your job is NOT to be generous. If the image looks pretty but does not satisfy the brief, FAIL it. The pipeline auto-regenerates failed images.

Hard rules:
- mustShow items are CAMERA REQUIREMENTS. If even one critical mustShow is missing, mustShowSatisfied = false.
- mustAvoid items are FORBIDDEN. If any is visible, mustAvoidViolated = true → automatic fail regardless of score.
- For product/demo scenes: productUseAccuracy means the active part touches the right contact point AND the substance (if any) matches the dossier — never opaque white where it should be transparent.
- For talking-head scenes: relax productUseAccuracy and productVisibility, but enforce israeliRealism + narrationAlignment.
- For problem scenes: product may be absent. visualProofStrength = "is the pain/friction visible?".
- israeliRealism = does the room feel like a real Israeli apartment? Foreign suburban / oversized US kitchens / non-Israeli outlets = fail israeliRealism.
- failureReasons[] must be SPECIFIC and PHYSICAL — what did you see that broke the brief?
- correctiveActions[] must be CAMERA INSTRUCTIONS for the regen — "move to extreme close-up", "show parted hair and direct brush-to-scalp contact", "drop the white cream — substance is transparent serum".
- score is 0–1. Multiply down for each missing critical mustShow or violated mustAvoid.
- Output strict JSON matching the schema.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'passed',
    'score',
    'checks',
    'failureReasons',
    'correctiveActions',
    'hasCriticalViolation',
  ],
  properties: {
    passed: { type: 'boolean' },
    score: { type: 'number' },
    checks: {
      type: 'object',
      additionalProperties: false,
      required: [
        'sceneTypeMatch',
        'productUseAccuracy',
        'visualProofStrength',
        'environmentMatch',
        'israeliRealism',
        'mustShowSatisfied',
        'mustAvoidViolated',
        'productVisibility',
        'narrationAlignment',
      ],
      properties: {
        sceneTypeMatch: { type: 'boolean' },
        productUseAccuracy: { type: 'boolean' },
        visualProofStrength: { type: 'boolean' },
        environmentMatch: { type: 'boolean' },
        israeliRealism: { type: 'boolean' },
        mustShowSatisfied: { type: 'boolean' },
        mustAvoidViolated: { type: 'boolean' },
        productVisibility: { type: 'boolean' },
        narrationAlignment: { type: 'boolean' },
      },
    },
    failureReasons: { type: 'array', items: { type: 'string' } },
    correctiveActions: { type: 'array', items: { type: 'string' } },
    hasCriticalViolation: { type: 'boolean' },
  },
} as const;

const PASS_THRESHOLD = 0.8;
const REQUEST_TIMEOUT_MS = 60_000;

export async function evaluateImageQa(input: ImageQaInput): Promise<ImageQaResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ImageQaConfigError('OPENAI_API_KEY not set');

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_IMAGE_QA_MODEL ?? 'gpt-4o-mini';

  const imageContent = await imageToContent(input.imageUrl);

  const briefSummary = [
    `intent: ${input.brief.whatThisFrameMustProve}`,
    `oneLineIntent: ${input.brief.oneLineIntent}`,
    `cameraInstruction: ${input.brief.cameraInstruction}`,
    `compositionInstruction: ${input.brief.compositionInstruction}`,
    `israeliContext: ${input.brief.israeliContextInstruction}`,
    `productAccuracy: ${input.brief.productAccuracyInstruction}`,
    `mustShow:`,
    ...input.brief.mustShow.map((x) => `  - ${x}`),
    `mustAvoid:`,
    ...input.brief.mustAvoid.map((x) => `  - ${x}`),
  ].join('\n');

  const visualBlock = input.visualAnalysis?.activePart
    ? [
        '',
        'PRODUCT VISUAL TRUTH (ground truth from product hero photo):',
        `objectDescription: ${input.visualAnalysis.objectDescription}`,
        `activePart: ${input.visualAnalysis.activePart}`,
        `howToUseVisually: ${input.visualAnalysis.howToUseVisually}`,
        `contactPoint: ${input.visualAnalysis.contactPoint}`,
        `substanceVisualType: ${input.visualAnalysis.substanceVisualType || '(none)'}`,
        `likelyModelMistakes (these are LIKELY in the generated image — flag if you see them):`,
        ...input.visualAnalysis.likelyModelMistakes.map((x) => `  - ${x}`),
      ].join('\n')
    : '';

  const userText = [
    'Evaluate the generated image against the brief below. Be strict. Output strict JSON.',
    '',
    'BRIEF:',
    briefSummary,
    visualBlock,
    '',
    `Scene type flags: isProblemScene=${input.isProblemScene === true}, isTalkingHead=${input.isTalkingHead === true}.`,
    'For problem scenes: product may be absent — productVisibility check should be true.',
    'For talking-head scenes: skip productUseAccuracy (mark true) but enforce israeliRealism + narrationAlignment.',
  ].join('\n');

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
  let resp;
  try {
    resp = await client.chat.completions.create(
      {
        model,
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
          json_schema: { name: 'image_qa', strict: true, schema: SCHEMA },
        },
      },
      { signal: ac.signal },
    );
  } finally {
    clearTimeout(t);
  }

  const raw = resp.choices?.[0]?.message?.content ?? '';
  let parsed: Omit<ImageQaResult, 'sceneNumber' | 'usage' | 'model'>;
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error(`Image QA response wasn't valid JSON: ${raw.slice(0, 200)}`);
  }

  // Final pass decision combines the model's `passed` with the explicit
  // threshold + critical-violation rule. We don't trust the model to
  // self-decide "pass" reliably — it's lenient at edge cases.
  const passed =
    parsed.passed &&
    parsed.score >= PASS_THRESHOLD &&
    !parsed.hasCriticalViolation &&
    !parsed.checks.mustAvoidViolated;

  return {
    sceneNumber: input.brief.sceneNumber,
    passed,
    score: parsed.score,
    checks: parsed.checks,
    failureReasons: parsed.failureReasons,
    correctiveActions: parsed.correctiveActions,
    hasCriticalViolation: parsed.hasCriticalViolation,
    usage: {
      inputTokens: resp.usage?.prompt_tokens ?? 0,
      outputTokens: resp.usage?.completion_tokens ?? 0,
    },
    model,
  };
}

interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

async function imageToContent(imageUrl: string): Promise<ImageContentPart> {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return { type: 'image_url', image_url: { url: imageUrl } };
  }
  if (imageUrl.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', imageUrl.replace(/^\/+/, ''));
    const buf = await fs.readFile(filePath);
    const ext = (imageUrl.split('.').pop() ?? 'png').toLowerCase();
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    return {
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${buf.toString('base64')}` },
    };
  }
  return { type: 'image_url', image_url: { url: imageUrl } };
}
