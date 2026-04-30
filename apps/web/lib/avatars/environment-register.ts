// Environment register lock — V14 hotfix #2.
//
// Same shape as outfit lock (V14 PR3): a deterministic per-project
// LOCK that pins the apartment register across every scene of the
// same ad. Without this, the script LLM picks environment_style
// independently per scene → scene 1 reads "modern renovated" while
// scene 3 reads "older practical home", which breaks visual continuity
// even when the avatar / outfit are stable.
//
// This module is pure (no LLM, no I/O, no Math.random / Date.now).
// Same input → byte-identical output.

import type { PersonaArchetype } from '@/lib/scene-planning/israeli-realism-rules';

export type LockedEnvironmentRegister =
  | 'modern_clean'
  | 'practical_lived_in'
  | 'urban_compact'
  | 'premium_renovated';

export function computeLockedEnvironmentRegister(
  archetype: PersonaArchetype,
): LockedEnvironmentRegister {
  switch (archetype) {
    case 'young_tel_aviv':
      return 'urban_compact';
    case 'aspirational_modern':
      return 'premium_renovated';
    case 'family_suburban':
    case 'mature_traditional':
    case 'periphery_practical':
      return 'practical_lived_in';
    case 'outdoorsy':
      return 'modern_clean';
  }
}

export function describeLockedEnvironmentRegister(
  r: LockedEnvironmentRegister,
): string {
  switch (r) {
    case 'modern_clean':
      return 'modern Israeli apartment, recently renovated, clean and uncluttered, neutral wall colors (white / off-white / light grey), simple modern furniture, daylight from the window';
    case 'practical_lived_in':
      return 'practical Israeli family home, lived-in but tidy, slightly cluttered with everyday objects (school papers on the fridge, books on a shelf, a few framed photos), well-used everyday furniture, warm worn wall colors';
    case 'urban_compact':
      return 'small urban Tel Aviv apartment, compact rooms, books and plants visible, slightly bohemian register, white or off-white walls, mid-century or IKEA-style furniture, daylight through trissim';
    case 'premium_renovated':
      return 'premium Israeli apartment, freshly renovated, high-end finishes, designer light fixtures, polished but warm, minimal clutter, neutral wall colors';
  }
}
