// V26.18 — product feature focus.
//
// Inserted between Avatar (step 2) and Script (step 4) in the wizard.
// The system extracts 3-4 strong selling features from the product
// intelligence dossier; the user picks 1+ to focus the ad on. Pre-
// V26.18 the script LLM saw the entire intelligence blob and tried
// to cover everything, which produced 6 scripts that all read
// similarly enumerative ("industrial / non-human", per the operator).
// Forcing a per-project feature anchor sharpens each script's angle.

export interface ProductFeature {
  /** Stable id used by the UI for selection state. Either a slug
   *  ('grip', 'eco-material') for LLM-suggested features, or a
   *  generated id ('custom-1729...') for user-added ones. */
  id: string;
  /** Short headline, 2-5 Hebrew words. The card label in the picker. */
  title: string;
  /** One-sentence reasoning — why this feature sells in the Israeli
   *  market. Shown in muted text under the title. */
  hook: string;
  /** Where this feature came from. */
  source: 'llm' | 'custom';
}

/** Read suggestedFeatures (cached LLM output) off productData. */
export function suggestedFeaturesFromProductData(
  productData: unknown,
): ProductFeature[] {
  if (productData && typeof productData === 'object') {
    const v = (productData as Record<string, unknown>).suggestedFeatures;
    if (Array.isArray(v)) {
      return v.filter(isProductFeature);
    }
  }
  return [];
}

/** Read selectedFeatures (user's pick + custom adds) off productData. */
export function selectedFeaturesFromProductData(
  productData: unknown,
): ProductFeature[] {
  if (productData && typeof productData === 'object') {
    const v = (productData as Record<string, unknown>).selectedFeatures;
    if (Array.isArray(v)) {
      return v.filter(isProductFeature);
    }
  }
  return [];
}

function isProductFeature(v: unknown): v is ProductFeature {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  return (
    typeof f.id === 'string' &&
    typeof f.title === 'string' &&
    typeof f.hook === 'string' &&
    (f.source === 'llm' || f.source === 'custom')
  );
}

export const FEATURE_SUGGESTION_COUNT = 4;
