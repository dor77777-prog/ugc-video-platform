// Auto-select a background-music track for a video.
//
// Inputs come from the script's `music_profile` (LLM-generated mood +
// energy + style hint), the product category, the script framework, and
// the duration mode. The scorer ranks tracks by mood / category / style
// / energy match against the metadata in music-library.ts and returns
// the top scorer — or `null` when music is disabled / nothing safe
// matches.
//
// The bias is intentional: prefer LOW or MEDIUM energy. A Hebrew
// voice-over needs to remain dominant, and a high-energy track always
// wins over the voice in the mix. We only let "high" energy through
// when the music_profile explicitly asks for it AND the category is
// fitness / sports / direct_response.

import {
  MUSIC_LIBRARY,
  type MusicTrack,
  type MusicEnergy,
  type MusicStyle,
  listSafeFallbackTracks,
} from './music-library';

export interface MusicProfile {
  enabled_by_default?: boolean;
  mood?: string;
  energy?: MusicEnergy;
  style?: MusicStyle;
  reason?: string;
  /** Default 0.08. Clamped to [0.06, 0.12] downstream. */
  target_volume?: number;
  duck_under_voice?: boolean;
}

export interface SelectMusicInput {
  productCategory?: string | null;
  scriptFramework?: string | null;
  emotionalTrigger?: string | null;
  musicProfile?: MusicProfile | null;
  durationMode: '15s' | '30s';
  /** The Step-1 toggle (productData.backgroundMusic). When false → null. */
  userEnabledMusic: boolean;
}

export interface SelectMusicResult {
  track: MusicTrack;
  /** Aggregated weighted score (higher = better). */
  score: number;
  /** Human-readable explanation for admin/debug logs. */
  reason: string;
}

// Map a free-form product category string into the category vocabulary
// the music library uses. Keep it ASCII-keyword based — the LLM may
// emit Hebrew or messy strings, but the keywords we look for are
// English domain terms.
function bucketsForCategory(raw?: string | null): string[] {
  if (!raw) return [];
  const s = raw.toLowerCase();
  const buckets: string[] = [];
  const add = (b: string) => {
    if (!buckets.includes(b)) buckets.push(b);
  };
  if (/(beauty|skincare|skin care|haircare|hair care|cosmetic|makeup|fragrance|perfume|spa)/.test(s)) {
    add('beauty');
    if (/spa|wellness/.test(s)) add('wellness');
  }
  if (/(wellness|meditat|mindful|self.?care|relax|calm)/.test(s)) {
    add('wellness');
    add('self_care');
  }
  if (/(baby|toddler|kids|child|nursery|stroller|diaper)/.test(s)) {
    add('baby');
    add('kids');
    add('family');
  }
  if (/(family|parent|home|household|kitchen|cook)/.test(s)) {
    add('family');
    add('home');
  }
  if (/(fitness|gym|workout|sport|run|cycl|athlet)/.test(s)) {
    add('fitness');
    add('sports');
  }
  if (/(jewelry|jeweler|luxury|premium|watch|gold|silver|diamond)/.test(s)) {
    add('premium');
    add('jewelry');
  }
  if (/(tech|gadget|electron|app|software|device|smart)/.test(s)) {
    add('tech');
    add('gadgets');
  }
  if (/(fashion|cloth|apparel|streetwear|wear|style)/.test(s)) {
    add('fashion');
  }
  if (/(food|drink|beverage|snack|coffee|tea|wine)/.test(s)) {
    add('food');
  }
  if (/(travel|hotel|flight|tour|vacation|trip)/.test(s)) {
    add('travel');
  }
  if (/(holiday|christmas|chanu|hanuk|halloween|easter)/.test(s)) {
    add('holiday');
  }
  if (/(direct.?response|sale|offer|discount|deal|promo)/.test(s)) {
    add('direct_response');
  }
  if (buckets.length === 0) add('general_ugc');
  return buckets;
}

// Score one track against the requested criteria. Higher = better.
// The weights below are tuned so MOOD + CATEGORY dominate, with style
// and energy as tie-breakers and avoidFor as a hard penalty.
function scoreTrack(
  track: MusicTrack,
  args: {
    profile: MusicProfile | null;
    categoryBuckets: string[];
    /** Whether the scorer is allowed to favor high-energy tracks. */
    allowHighEnergy: boolean;
    /** True when the product is something the voice MUST stay dominant
     *  on (beauty / wellness / baby / etc.) — penalize high energy. */
    voiceDominantBias: boolean;
  },
): { score: number; matches: string[] } {
  const matches: string[] = [];
  let score = 0;

  // 1. Mood — direct hit on MUSIC_LIBRARY.moods is the strongest signal.
  if (args.profile?.mood) {
    if (track.moods.includes(args.profile.mood)) {
      score += 8;
      matches.push(`mood:${args.profile.mood}`);
    } else if (track.moods.some((m) => m.split('_')[0] === args.profile?.mood?.split('_')[0])) {
      // Partial mood match (warm_lifestyle ↔ warm_anything etc.).
      score += 3;
    }
  }

  // 2. Category bucket overlap (bestFor ∩ buckets).
  const bestForHits = track.bestFor.filter((b) => args.categoryBuckets.includes(b));
  if (bestForHits.length > 0) {
    score += bestForHits.length * 4;
    matches.push(`bestFor:${bestForHits.join('+')}`);
  }
  const generalUgcHit =
    args.categoryBuckets.includes('general_ugc') && track.bestFor.includes('general_ugc');
  if (generalUgcHit) {
    score += 2;
    matches.push('bestFor:general_ugc');
  }

  // 3. avoidFor — hard penalty. If even one bucket is in avoidFor we
  // strongly de-rank this track.
  const avoidHits = track.avoidFor.filter((b) => args.categoryBuckets.includes(b));
  if (avoidHits.length > 0) {
    score -= avoidHits.length * 10;
  }

  // 4. Style match.
  if (args.profile?.style && track.style === args.profile.style) {
    score += 4;
    matches.push(`style:${track.style}`);
  } else if (
    args.profile?.style === 'general_ugc' &&
    (track.style === 'soft_pop' || track.style === 'ambient' || track.style === 'general_ugc')
  ) {
    score += 1;
  }

  // 5. Energy.
  if (args.profile?.energy && track.energy === args.profile.energy) {
    score += 3;
    matches.push(`energy:${track.energy}`);
  } else if (
    args.profile?.energy === 'medium' &&
    (track.energy === 'low' || track.energy === 'medium')
  ) {
    score += 1;
  }

  // 6. Bias: prefer low/medium energy for voice-over UGC, hard penalty
  //    for high-energy tracks unless explicitly allowed by the profile.
  if (track.energy === 'high' && !args.allowHighEnergy) {
    score -= 8;
  }
  if (args.voiceDominantBias && track.energy === 'high') {
    score -= 6;
  }
  if (track.energy === 'low') score += 1;

  return { score, matches };
}

export function selectMusicTrack(
  input: SelectMusicInput,
): SelectMusicResult | null {
  if (!input.userEnabledMusic) return null;
  if (MUSIC_LIBRARY.length === 0) return null;

  const profile = input.musicProfile ?? null;
  const categoryBuckets = bucketsForCategory(input.productCategory ?? null);

  // High-energy is permitted ONLY when the script-side profile asks for
  // it AND the product is something where it makes sense (fitness /
  // sports / direct_response). This is the "never accidentally pair a
  // beauty voice-over with a sports highlights track" rule.
  const profileWantsHigh =
    profile?.energy === 'high' ||
    profile?.style === 'upbeat' ||
    profile?.mood === 'energetic_demo';
  const categoryAllowsHigh =
    categoryBuckets.includes('fitness') ||
    categoryBuckets.includes('sports') ||
    categoryBuckets.includes('direct_response') ||
    categoryBuckets.includes('automotive');
  const allowHighEnergy = !!profileWantsHigh && categoryAllowsHigh;

  // Voice-dominant categories — beauty, wellness, baby/kids, jewelry,
  // luxury — get a stronger penalty against high-energy tracks. The
  // voice MUST stay readable.
  const voiceDominantBias =
    categoryBuckets.includes('beauty') ||
    categoryBuckets.includes('wellness') ||
    categoryBuckets.includes('baby') ||
    categoryBuckets.includes('kids') ||
    categoryBuckets.includes('jewelry') ||
    categoryBuckets.includes('premium') ||
    categoryBuckets.includes('self_care');

  const scored = MUSIC_LIBRARY.map((track) => {
    const { score, matches } = scoreTrack(track, {
      profile,
      categoryBuckets,
      allowHighEnergy,
      voiceDominantBias,
    });
    return { track, score, matches };
  });

  // Pick the best — break ties by preferring lower energy.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const e: Record<MusicEnergy, number> = { low: 0, medium: 1, high: 2 };
    return e[a.track.energy] - e[b.track.energy];
  });

  const top = scored[0];
  // If the best score is too weak (or worse, negative because every
  // track had an avoidFor penalty), fall back to a SAFE generic UGC
  // track. We never randomly pick a high-energy fallback.
  const MIN_SCORE_THRESHOLD = 3;
  if (!top || top.score < MIN_SCORE_THRESHOLD) {
    const safe = listSafeFallbackTracks();
    if (safe.length === 0) return null;
    // Prefer low energy, then ambient/soft_pop.
    safe.sort((a, b) => {
      const e: Record<MusicEnergy, number> = { low: 0, medium: 1, high: 2 };
      const eDiff = e[a.energy] - e[b.energy];
      if (eDiff !== 0) return eDiff;
      const styleRank = (s: MusicStyle) => {
        if (s === 'ambient') return 0;
        if (s === 'soft_pop') return 1;
        if (s === 'general_ugc') return 2;
        return 3;
      };
      return styleRank(a.style) - styleRank(b.style);
    });
    return {
      track: safe[0]!,
      score: 0,
      reason: 'safe fallback (no strong category/mood match)',
    };
  }

  const reason =
    top.matches.length > 0
      ? top.matches.join(', ')
      : `top score ${top.score} for ${top.track.title}`;

  return { track: top.track, score: top.score, reason };
}

// Volume helper — clamp the LLM-suggested volume (or defaults) into the
// safe range. Voice must stay dominant, so we hard-cap at 0.12.
export function resolveMusicVolume(profile: MusicProfile | null | undefined): number {
  const DEFAULT_VOLUME = 0.08;
  const MIN_VOLUME = 0.06;
  const MAX_VOLUME = 0.12;
  const v = profile?.target_volume;
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_VOLUME;
  if (v < MIN_VOLUME) return MIN_VOLUME;
  if (v > MAX_VOLUME) return MAX_VOLUME;
  return v;
}
