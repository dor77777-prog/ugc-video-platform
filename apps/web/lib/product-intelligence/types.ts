// Product Intelligence shapes — V11.
//
// The "Product Intelligence Dossier" is the single source of truth that
// drives every downstream creative decision: script generation, hooks,
// scene order, image briefs, image QA. It is built once per project
// from scraped data + a vision pass on the hero image, then stored on
// the Project (under productData.intelligence) so we never pay for it
// twice.
//
// All three shapes below are SERIALIZABLE — they get persisted to JSON
// and read back by the script engine + image brief builder + QA pass
// without any custom hydration step.

export interface ProductDossier {
  productName: string;
  brand: string;
  category: string;
  subcategory: string;
  productType: string;
  targetAudiencePrimary: string[];
  targetAudienceSecondary: string[];
  audienceHypotheses: string[];
  painPoints: string[];
  desiredOutcomes: string[];
  purchaseTriggers: string[];
  productMechanism: string;
  keyClaims: string[];
  proofPoints: string[];
  mainObjections: string[];
  ingredientsOrMaterials: string[];
  applicationMethod: string;
  usageSteps: string[];
  applicatorType: string;
  packagingType: string;
  textureType: string;
  outputSubstance: string;
  mustShowVisuals: string[];
  mustAvoidVisuals: string[];
  likelyUseEnvironments: string[];
  israeliRealismCues: string[];
  productParts: string[];
  visualFailureModes: string[];
  visualEvidenceRequirements: string[];
  creativeOpportunities: string[];
  /** Anything the dossier had to assume in the absence of hard data. The
   *  script engine treats these as "soft" — never claim them as facts. */
  conservativeAssumptions: string[];
}

export interface ProductVisualAnalysis {
  objectDescription: string;
  visibleParts: string[];
  activePart: string;
  howToHold: string;
  howToUseVisually: string;
  contactPoint: string;
  substanceVisualType: string;
  textureAndMaterial: string;
  scaleRelativeToHand: string;
  bestDemoAngles: string[];
  mustShowForDemo: string[];
  mustAvoidForDemo: string[];
  likelyModelMistakes: string[];
  productAccuracyNotes: string[];
}

export interface AudienceInference {
  category: string;
  subcategory: string;
  primaryAudience: string[];
  secondaryAudience: string[];
  dailyUseMoments: string[];
  problemContext: string[];
  emotionalTriggers: string[];
  purchaseObjections: string[];
  realisticIsraeliSettings: string[];
  bestAdFrameworks: string[];
  toneRecommendation: string;
  visualStrategyRecommendation: string;
}

export interface ProductIntelligence {
  dossier: ProductDossier;
  visualAnalysis: ProductVisualAnalysis;
  audience: AudienceInference;
  /** Stamp so admin/forensics can spot stale intelligence after a
   *  product page or hero image was edited. */
  generatedAt: string;
  /** Schema version — bump when the prompt or shape changes. */
  schemaVersion: 1;
  /** Models used (for cost forensics + repro). */
  models: {
    dossier: string;
    visualAnalysis: string;
    audience: string;
  };
  /** V27.11.PR6 — deterministic hash of the source product data the
   *  intelligence was built from. Used by concept-actions.ts to
   *  detect staleness when the user has edited description /
   *  features / category / hero image since the eager prebuild ran.
   *  Optional for back-compat with intelligence persisted before
   *  this field landed; missing → treat as stale (rebuild). */
  sourceHash?: string;
}
