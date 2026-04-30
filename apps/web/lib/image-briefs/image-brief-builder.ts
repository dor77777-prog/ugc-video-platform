// Image Brief Builder — V11.
//
// DETERMINISTIC (no LLM) — composes a strict image brief from the
// scene fields + product intelligence. The output is a structured
// brief AND the final English image prompt that gets passed to
// gpt-image-2. Replaces the old "narration → image prompt" path that
// produced generic frames.
//
// Why deterministic: a brief is a contract. Letting the LLM build it
// re-introduces the exact drift we're trying to eliminate (mustShow
// items disappearing, mustAvoid items leaking back in). Instead, we
// pull the constraints directly from the dossier + visual analysis
// and stitch them into the prompt with predictable structure.

import type {
  ProductDossier,
  ProductVisualAnalysis,
  ProductIntelligence,
} from '@/lib/product-intelligence';
import { buildIsraeliRealismBlock } from '@/lib/scene-planning/israeli-realism-rules';
import {
  detectHandsPhysicsRequired,
  detectMirrorRisk,
  buildHandsPhysicsRule,
  buildMirrorSafetyRule,
} from '@/lib/scene-planning/scene-rules';

export interface ImageBrief {
  sceneNumber: number;
  oneLineIntent: string;
  whatThisFrameMustProve: string;
  visualPriorityOrder: string[];
  mustShow: string[];
  mustAvoid: string[];
  environmentDetails: string[];
  cameraInstruction: string;
  compositionInstruction: string;
  realismInstruction: string;
  israeliContextInstruction: string;
  productAccuracyInstruction: string;
  /** V13 PR2.2 — true when the brief appended the hands-physics rule. */
  handsPhysicsRequired: boolean;
  /** V13 PR2.2 — true when the brief appended the mirror-safety rule. */
  mirrorRisk: boolean;
  /** V13 PR2.2 — extra prompt blocks appended after the universal sections. */
  ruleBlocks: string[];
  negativeConstraints: string[];
  finalImagePrompt: string;
}

export interface BuildImageBriefInput {
  sceneNumber: number;
  totalScenes: number;
  /** What the scene is for narratively. Drives the "intent" line. */
  sceneGoal: string;
  /** product_demo / hands_only / talking_head / closeup_product / etc. */
  sceneGenerationType: string;
  /** clear_front_facing / partial_face / profile / no_face. */
  faceVisibility: string;
  /** Scripted Hebrew text (only used to anchor proof — never the
   *  primary source of the prompt). */
  spokenTextHebrew: string;
  /** The English visual brief the script LLM wrote — folded in as a
   *  hint, not the primary source. */
  rawVisualBrief: string;
  cameraDirection?: string | null;
  primarySubject?: string | null;
  mustShowProduct?: boolean | null;
  productVisibilityPriority?: string | null;
  cameraFocus?: string | null;
  showFace?: boolean | null;
  /** Voice of the product — drives proof requirements. Required for
   *  the V11 path. When null, we fall back to a degraded brief that
   *  is still better than the legacy narration-driven path. */
  intelligence: ProductIntelligence | null;
  /** Whether this is a problem scene — if so we relax product visibility. */
  isProblemScene?: boolean;
}

const TALKING_TYPES = new Set([
  'talking_head',
  'selfie_talking',
  'mirror_selfie_talking',
]);

const PROBLEM_TYPES = new Set([
  'problem_visual',
  'problem_context',
  'failed_method',
  'before_state',
]);

export function isProblemSceneType(t: string): boolean {
  return PROBLEM_TYPES.has(t);
}

export function buildImageBrief(input: BuildImageBriefInput): ImageBrief {
  const intel = input.intelligence;
  const dossier: ProductDossier | null = intel?.dossier ?? null;
  const visual: ProductVisualAnalysis | null =
    intel && intel.visualAnalysis.activePart ? intel.visualAnalysis : null;

  const isTalking = TALKING_TYPES.has(input.sceneGenerationType);
  const isProblem =
    !!input.isProblemScene || isProblemSceneType(input.sceneGenerationType);

  // ── mustShow ─────────────────────────────────────────────────────────
  // Pull from dossier for product/demo scenes, visual analysis for
  // close-ups. Talking-head + problem scenes don't force product.
  const mustShow: string[] = [];
  if (!isTalking && !isProblem && dossier) {
    for (const v of dossier.mustShowVisuals) mustShow.push(v);
  }
  if (
    visual &&
    (input.sceneGenerationType === 'product_demo' ||
      input.sceneGenerationType === 'hands_only' ||
      input.sceneGenerationType === 'closeup_product')
  ) {
    for (const v of visual.mustShowForDemo) mustShow.push(v);
    if (visual.contactPoint) {
      mustShow.push(`direct contact: ${visual.contactPoint}`);
    }
    if (visual.substanceVisualType) {
      mustShow.push(
        `substance accuracy: ${visual.substanceVisualType} — never opaque white cream unless the dossier says so`,
      );
    }
  }
  if (isTalking) {
    mustShow.push('clear front-facing Israeli person, mouth visible, natural UGC selfie framing');
  }
  if (isProblem) {
    mustShow.push('the actual problem is the visual subject — friction / frustration / mess / wasted time / wrong workaround');
  }

  // ── mustAvoid ────────────────────────────────────────────────────────
  const mustAvoid: string[] = [];
  if (dossier) {
    for (const v of dossier.mustAvoidVisuals) mustAvoid.push(v);
    for (const v of dossier.visualFailureModes) mustAvoid.push(v);
  }
  if (visual) {
    for (const v of visual.mustAvoidForDemo) mustAvoid.push(v);
    for (const v of visual.likelyModelMistakes) mustAvoid.push(v);
  }
  // Universal Israeli-realism guards — extracted to a dedicated module
  // so every brief and (later) every scene-plan applies the same rules.
  const israeliRealism = buildIsraeliRealismBlock({ isTalking, isProblem });
  for (const item of israeliRealism.mustAvoid) mustAvoid.push(item);
  for (const item of israeliRealism.mustShow) mustShow.push(item);

  // ── Environment ──────────────────────────────────────────────────────
  const environmentDetails: string[] = [];
  if (intel?.audience.realisticIsraeliSettings.length) {
    environmentDetails.push(
      `Israeli setting from this list: ${intel.audience.realisticIsraeliSettings.slice(0, 4).join(' / ')}`,
    );
  } else if (dossier?.likelyUseEnvironments.length) {
    environmentDetails.push(
      `Use environment: ${dossier.likelyUseEnvironments.slice(0, 4).join(' / ')}`,
    );
  } else {
    environmentDetails.push('realistic Israeli apartment interior');
  }
  if (dossier?.israeliRealismCues.length) {
    environmentDetails.push(
      `Israeli realism cues: ${dossier.israeliRealismCues.slice(0, 4).join('; ')}`,
    );
  }

  // ── Camera + composition ─────────────────────────────────────────────
  const cameraInstruction = (() => {
    if (input.sceneGenerationType === 'closeup_product') {
      return 'extreme close-up framed on the product action, mobile-first 9:16 vertical, hand and product fill the frame';
    }
    if (input.sceneGenerationType === 'hands_only') {
      return 'over-the-shoulder or POV close-up of hands using the product, no face in frame, vertical 9:16';
    }
    if (input.sceneGenerationType === 'product_demo') {
      return 'tight UGC framing on the action — product + active part + contact point clearly in frame, vertical 9:16';
    }
    if (isTalking) {
      return 'natural selfie UGC framing, eye-level, soft natural light, vertical 9:16, looks like a real phone front camera';
    }
    if (isProblem) {
      return 'documentary UGC framing on the problem itself, vertical 9:16, slightly imperfect — this is meant to feel real';
    }
    return input.cameraDirection ?? 'natural UGC framing, vertical 9:16';
  })();

  const compositionInstruction = (() => {
    if (input.cameraFocus === 'product') return 'composition centers the product action — viewer eye lands on product first';
    if (input.cameraFocus === 'face') return 'composition centers the speaking face, product secondary or absent';
    if (input.cameraFocus === 'action') return 'composition centers the verb the hands are performing';
    return 'composition centers the proof moment of this scene';
  })();

  // ── Realism + Israeli context ────────────────────────────────────────
  const realismInstruction =
    'mobile-first UGC, single consistent natural light source, realistic skin texture, slightly imperfect — never the over-polished stock-photo look';

  const israeliContextInstruction = israeliRealism.promptText;

  // ── Product accuracy (the centerpiece for proof scenes) ───────────────
  const productAccuracyInstruction = (() => {
    if (!visual) return 'product matches the reference image exactly — packaging, label, color, scale';
    const parts: string[] = [];
    parts.push(`product is: ${visual.objectDescription}`);
    if (visual.activePart) parts.push(`active part: ${visual.activePart}`);
    if (visual.howToHold) parts.push(`held: ${visual.howToHold}`);
    if (visual.howToUseVisually) parts.push(`used: ${visual.howToUseVisually}`);
    if (visual.contactPoint) parts.push(`contact point: ${visual.contactPoint}`);
    if (visual.substanceVisualType) parts.push(`substance: ${visual.substanceVisualType}`);
    if (visual.textureAndMaterial) parts.push(`material: ${visual.textureAndMaterial}`);
    return parts.join('; ');
  })();

  // ── Visual proof — the "what this frame must prove" line ──────────────
  const whatThisFrameMustProve = (() => {
    if (isProblem) {
      const pain = dossier?.painPoints?.[0] ?? 'the friction the audience actually feels';
      return `prove the pain: ${pain}`;
    }
    if (isTalking) return 'a real Israeli person is speaking honestly to camera — believable selfie UGC';
    if (input.sceneGenerationType === 'product_demo') {
      return `prove the product mechanism by showing: ${visual?.howToUseVisually || dossier?.productMechanism || 'correct product use'}`;
    }
    if (input.sceneGenerationType === 'closeup_product' || input.sceneGenerationType === 'hands_only') {
      return `prove product detail / contact / substance accuracy: ${dossier?.visualEvidenceRequirements?.[0] ?? 'meaningful product detail'}`;
    }
    if (input.sceneGenerationType === 'cta_visual') return 'clean product-led closing shot — zero clutter, zero competing focal points';
    return dossier?.visualEvidenceRequirements?.[0] ?? 'meaningful proof related to the spoken line';
  })();

  // ── Negative constraints (joined into the prompt at the end) ──────────
  const negativeConstraints: string[] = [...mustAvoid];

  // ── Scene-specific safety rules (hands physics + mirror) ──────────────
  // Pure detectors; same input → same flags. Promoted to ImageBrief so the
  // admin debug panel + future Scene Plan can read them directly.
  const handsPhysicsRequired = detectHandsPhysicsRequired({
    sceneGenerationType: input.sceneGenerationType,
    mustShowProduct: input.mustShowProduct,
    cameraDirection: input.cameraDirection,
    sceneGoal: input.sceneGoal,
    faceVisibility: input.faceVisibility,
  });
  const mirrorRisk = detectMirrorRisk({
    sceneGenerationType: input.sceneGenerationType,
    mustShowProduct: input.mustShowProduct,
    cameraDirection: input.cameraDirection,
    sceneGoal: input.sceneGoal,
    faceVisibility: input.faceVisibility,
  });
  const ruleBlocks: string[] = [];
  if (handsPhysicsRequired) {
    const r = buildHandsPhysicsRule();
    for (const m of r.mustShow) mustShow.push(m);
    for (const m of r.mustAvoid) mustAvoid.push(m);
    ruleBlocks.push(r.promptText);
  }
  if (mirrorRisk) {
    const r = buildMirrorSafetyRule();
    for (const m of r.mustAvoid) mustAvoid.push(m);
    ruleBlocks.push(r.promptText);
  }

  // ── Visual priority ───────────────────────────────────────────────────
  const visualPriorityOrder = (() => {
    if (isProblem) return ['the problem itself', 'environment that grounds the problem', 'subject\'s reaction'];
    if (isTalking) return ['speaking face', 'natural environment', 'subtle product presence (if appropriate)'];
    if (input.sceneGenerationType === 'closeup_product')
      return ['product detail', 'active part', 'substance accuracy'];
    if (input.sceneGenerationType === 'hands_only')
      return ['hands using product', 'product action', 'contact point'];
    if (input.sceneGenerationType === 'product_demo')
      return ['product action', 'contact point', 'visible substance / outcome'];
    if (input.sceneGenerationType === 'cta_visual') return ['product on its own', 'clean background', 'mobile-first composition'];
    return ['scene subject', 'environment', 'lighting'];
  })();

  // ── Final prompt assembly ─────────────────────────────────────────────
  const finalImagePrompt = renderFinalPrompt({
    rawBrief: input.rawVisualBrief,
    intent: whatThisFrameMustProve,
    cameraInstruction,
    compositionInstruction,
    realismInstruction,
    israeliContextInstruction,
    productAccuracyInstruction,
    environmentDetails,
    mustShow,
    negativeConstraints,
    ruleBlocks,
    isProblem,
    isTalking,
  });

  return {
    sceneNumber: input.sceneNumber,
    oneLineIntent: `${input.sceneGenerationType} — ${whatThisFrameMustProve.slice(0, 140)}`,
    whatThisFrameMustProve,
    visualPriorityOrder,
    mustShow: dedupeKeepOrder(mustShow),
    mustAvoid: dedupeKeepOrder(mustAvoid),
    environmentDetails,
    cameraInstruction,
    compositionInstruction,
    realismInstruction,
    israeliContextInstruction,
    productAccuracyInstruction,
    handsPhysicsRequired,
    mirrorRisk,
    ruleBlocks,
    negativeConstraints: dedupeKeepOrder(negativeConstraints),
    finalImagePrompt,
  };
}

function renderFinalPrompt(p: {
  rawBrief: string;
  intent: string;
  cameraInstruction: string;
  compositionInstruction: string;
  realismInstruction: string;
  israeliContextInstruction: string;
  productAccuracyInstruction: string;
  environmentDetails: string[];
  mustShow: string[];
  negativeConstraints: string[];
  /** V13 PR2.2 — extra prompt sections (HANDS PHYSICS, MIRROR SAFETY, …)
   *  appended after universal context, before the MUST SHOW / MUST NOT
   *  SHOW lists. */
  ruleBlocks: string[];
  isProblem: boolean;
  isTalking: boolean;
}): string {
  const sections: string[] = [];
  sections.push(`SCENE INTENT: ${p.intent}.`);
  if (p.rawBrief && p.rawBrief.trim()) {
    sections.push(`SCENE BRIEF (from script): ${p.rawBrief.trim()}`);
  }
  sections.push(`CAMERA: ${p.cameraInstruction}.`);
  sections.push(`COMPOSITION: ${p.compositionInstruction}.`);
  sections.push(`REALISM: ${p.realismInstruction}.`);
  if (p.environmentDetails.length) {
    sections.push(`ENVIRONMENT: ${p.environmentDetails.join('; ')}.`);
  }
  sections.push(`ISRAELI CONTEXT (mandatory): ${p.israeliContextInstruction}.`);
  if (!p.isTalking && !p.isProblem) {
    sections.push(`PRODUCT ACCURACY: ${p.productAccuracyInstruction}.`);
  }
  for (const block of p.ruleBlocks) {
    sections.push(`${block}.`);
  }
  if (p.mustShow.length) {
    sections.push(
      `MUST SHOW (camera REQUIREMENTS — frame must contain these): ${p.mustShow.join('; ')}.`,
    );
  }
  if (p.negativeConstraints.length) {
    // V13 PR1 removed the post-gen QA loop — wording updated from
    // "fails QA if these appear" to a flat forbidden list.
    sections.push(
      `MUST NOT SHOW (forbidden): ${p.negativeConstraints.join('; ')}.`,
    );
  }
  return sections.join('\n');
}

function dedupeKeepOrder(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x.trim());
  }
  return out;
}

