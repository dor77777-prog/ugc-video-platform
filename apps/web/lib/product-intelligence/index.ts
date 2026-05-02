// Product Intelligence orchestrator — V11.
//
// Single entry point that takes scraped product data + an optional
// hero image and returns the full ProductIntelligence bundle (dossier
// + visual analysis + audience). Wired into the project-creation
// path AFTER scrape and BEFORE script generation. The result is
// persisted on Project.productData.intelligence so we never recompute
// it for the same project.
//
// Cost: ~$0.10 per project (one gpt-5.4-mini text call for dossier,
// one gpt-4o-mini vision call for visual analysis, one gpt-5.4-mini
// text call for audience). The whole thing replaces the previous
// "shallow scraped text → script" pipeline that produced generic
// scripts and weak image briefs.

import { buildProductDossier, type DossierInput } from './product-dossier';
import {
  analyzeProductVisual,
  type VisualAnalysisInput,
} from './product-visual-analysis';
import { inferAudience } from './audience-inference';
import type { ProductIntelligence } from './types';
export type {
  ProductDossier,
  ProductVisualAnalysis,
  AudienceInference,
  ProductIntelligence,
} from './types';

export {
  buildProductDossier,
  analyzeProductVisual,
};
export {
  inferAudience,
} from './audience-inference';

export interface BuildProductIntelligenceInput extends DossierInput {
  /** Hero image URL — local /uploads/... or remote https://. When null,
   *  visual analysis is SKIPPED and the resulting bundle has a
   *  zero-filled visualAnalysis. */
  heroImageUrl?: string | null;
  secondaryImageUrl?: string | null;
}

export interface BuildProductIntelligenceResult {
  intelligence: ProductIntelligence;
  usage: {
    dossier: { inputTokens: number; outputTokens: number };
    visualAnalysis: { inputTokens: number; outputTokens: number } | null;
    audience: { inputTokens: number; outputTokens: number };
  };
}

const EMPTY_VISUAL_ANALYSIS = {
  objectDescription: '',
  visibleParts: [],
  activePart: '',
  howToHold: '',
  howToUseVisually: '',
  contactPoint: '',
  substanceVisualType: '',
  textureAndMaterial: '',
  scaleRelativeToHand: '',
  bestDemoAngles: [],
  mustShowForDemo: [],
  mustAvoidForDemo: [],
  likelyModelMistakes: [],
  productAccuracyNotes: [],
} as const;

export async function buildProductIntelligence(
  input: BuildProductIntelligenceInput,
): Promise<BuildProductIntelligenceResult> {
  // Stage 1 — dossier. Text-only, fast (~5-10s). Must complete first
  // because both visual analysis + audience inference depend on its
  // output.
  const dossierResult = await buildProductDossier({
    productName: input.productName,
    brand: input.brand ?? null,
    description: input.description ?? null,
    features: input.features ?? [],
    price: input.price ?? null,
    currency: input.currency ?? null,
    sourceUrl: input.sourceUrl ?? null,
    userNotes: input.userNotes ?? null,
    categoryGuess: input.categoryGuess ?? null,
  });

  // V27.11.PR6 — stages 2 and 3 run IN PARALLEL.
  //
  // Pre-PR6 they were sequential (stage 2 → stage 3) so audience
  // inference could see the visual analysis output. That cost ~15-20s
  // wall-clock for back-to-back vision + text calls on a fresh
  // project's first concept-gen.
  //
  // Trade-off: parallelizing means audience inference doesn't see
  // visual cues. The audience prompt already tolerates a null
  // visualAnalysis (it's an optional input) and still produces a
  // good audience block from the dossier alone. Quality dip is small
  // (audience.dailyUseMoments slightly less specific without visual
  // grounding). Latency win is large (~10-15s saved on the slow
  // first call).
  //
  // Net first-call wall-clock: stage 1 (~7s) + max(stage 2, stage 3)
  // (~10s) = ~17s, vs pre-PR6 ~32s. Cached calls are unaffected.
  const visualPromise: Promise<{
    analysis: BuildProductIntelligenceResult['intelligence']['visualAnalysis'];
    usage: BuildProductIntelligenceResult['usage']['visualAnalysis'];
    model: string | null;
  }> = (async () => {
    if (!input.heroImageUrl) {
      return {
        analysis: EMPTY_VISUAL_ANALYSIS as unknown as BuildProductIntelligenceResult['intelligence']['visualAnalysis'],
        usage: null,
        model: null,
      };
    }
    try {
      const visualInput: VisualAnalysisInput = {
        imageUrl: input.heroImageUrl,
        secondaryImageUrl: input.secondaryImageUrl ?? null,
        productName: dossierResult.dossier.productName,
        productDescription: input.description ?? '',
        categoryHint: dossierResult.dossier.category || input.categoryGuess || null,
      };
      const v = await analyzeProductVisual(visualInput);
      return { analysis: v.analysis, usage: v.usage, model: v.model };
    } catch (err) {
      console.warn(
        '[product-intelligence] visual analysis failed:',
        (err as Error).message,
      );
      return {
        analysis: EMPTY_VISUAL_ANALYSIS as unknown as BuildProductIntelligenceResult['intelligence']['visualAnalysis'],
        usage: null,
        model: null,
      };
    }
  })();

  // Stage 3 runs in parallel with stage 2. It DOES NOT wait for the
  // visual analysis — audience inference passes null for visualAnalysis
  // and still produces a useful audience block from the dossier alone.
  const audiencePromise = inferAudience({
    dossier: dossierResult.dossier,
    visualAnalysis: null,
  });

  const [
    { analysis: visualAnalysis, usage: visualUsage, model: visualModel },
    audienceResult,
  ] = await Promise.all([visualPromise, audiencePromise]);

  const intelligence: ProductIntelligence = {
    dossier: dossierResult.dossier,
    visualAnalysis,
    audience: audienceResult.audience,
    generatedAt: new Date().toISOString(),
    schemaVersion: 1,
    models: {
      dossier: dossierResult.model,
      visualAnalysis: visualModel ?? '(skipped)',
      audience: audienceResult.model,
    },
  };

  return {
    intelligence,
    usage: {
      dossier: dossierResult.usage,
      visualAnalysis: visualUsage,
      audience: audienceResult.usage,
    },
  };
}
