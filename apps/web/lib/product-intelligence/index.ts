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
  // Stage 1 — dossier. Text-only, fast.
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

  // Stage 2 — visual analysis (vision). Skipped when no hero image.
  let visualAnalysis = EMPTY_VISUAL_ANALYSIS as unknown as
    BuildProductIntelligenceResult['intelligence']['visualAnalysis'];
  let visualUsage: BuildProductIntelligenceResult['usage']['visualAnalysis'] = null;
  let visualModel: string | null = null;
  if (input.heroImageUrl) {
    try {
      const visualInput: VisualAnalysisInput = {
        imageUrl: input.heroImageUrl,
        secondaryImageUrl: input.secondaryImageUrl ?? null,
        productName: dossierResult.dossier.productName,
        productDescription: input.description ?? '',
        categoryHint: dossierResult.dossier.category || input.categoryGuess || null,
      };
      const v = await analyzeProductVisual(visualInput);
      visualAnalysis = v.analysis;
      visualUsage = v.usage;
      visualModel = v.model;
    } catch (err) {
      // Visual analysis is best-effort — text dossier still drives the
      // pipeline if vision fails.
      console.warn(
        '[product-intelligence] visual analysis failed:',
        (err as Error).message,
      );
    }
  }

  // Stage 3 — audience inference, sees both dossier + visual cues.
  const audienceResult = await inferAudience({
    dossier: dossierResult.dossier,
    visualAnalysis: visualAnalysis.activePart ? visualAnalysis : null,
  });

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
