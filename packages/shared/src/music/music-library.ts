// Local background-music library.
//
// All tracks live under apps/web/public/music/ and are user-provided
// (the operator dropped 17 royalty-free Mixkit tracks into the folder).
// We treat them as a closed set — no remote music API, no downloads at
// runtime, no commercial trending songs.
//
// Each track has metadata that drives auto-selection in select-music.ts.
// When a filename's mood is unclear, we classify CONSERVATIVELY (low
// energy, general_ugc style) rather than skip the track — the worst
// outcome should be "the music is generic" not "no music plays".
//
// To add a new track:
//   1. Drop the file into apps/web/public/music/
//   2. Append a MusicTrack entry below
//   3. Set conservative defaults if mood is unclear

export type MusicEnergy = 'low' | 'medium' | 'high';

export type MusicStyle =
  | 'soft_pop'
  | 'ambient'
  | 'minimal_electronic'
  | 'playful'
  | 'premium'
  | 'acoustic'
  | 'cinematic_light'
  | 'upbeat'
  | 'general_ugc';

export interface MusicTrack {
  id: string;
  title: string;
  fileUrl: string;
  source: 'user_provided';
  license: 'user_provided_free_to_use';
  attributionRequired: false;
  attributionText?: null;
  allowedPlatforms: ['all'];
  /** Loose mood tags. Used by select-music.ts via partial-match scoring. */
  moods: string[];
  /** Higher-level grouping (use cases like "beauty", "tech", "family"). */
  categories: string[];
  energy: MusicEnergy;
  style: MusicStyle;
  /** Buckets the track scores well in. */
  bestFor: string[];
  /** Buckets where we explicitly DON'T want this track. */
  avoidFor: string[];
}

// 17 user-provided Mixkit tracks. The IDs match the filename stem so
// log lines / admin metadata are searchable without a lookup.
export const MUSIC_LIBRARY: readonly MusicTrack[] = [
  // ─── Calm / ambient / low-energy ───────────────────────────────────────
  {
    id: 'mixkit-beautiful-dream-493',
    title: 'Beautiful Dream',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-beautiful-dream-493.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['calm_wellness', 'soft_beauty', 'general_ugc', 'warm_lifestyle'],
    categories: ['beauty', 'wellness', 'lifestyle', 'home'],
    energy: 'low',
    style: 'ambient',
    bestFor: ['beauty', 'skincare', 'haircare', 'wellness', 'self_care', 'meditation'],
    avoidFor: ['fitness', 'direct_response', 'high_energy_demo'],
  },
  {
    id: 'mixkit-hazy-after-hours-132',
    title: 'Hazy After Hours',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-hazy-after-hours-132.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['calm_wellness', 'luxury_elegant', 'soft_beauty', 'warm_lifestyle'],
    categories: ['beauty', 'lifestyle', 'premium', 'fragrance'],
    energy: 'low',
    style: 'ambient',
    bestFor: ['beauty', 'fragrance', 'lifestyle', 'premium', 'jewelry', 'spa'],
    avoidFor: ['fitness', 'kids', 'direct_response'],
  },
  {
    id: 'mixkit-valley-sunset-127',
    title: 'Valley Sunset',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-valley-sunset-127.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['warm_lifestyle', 'calm_wellness', 'general_ugc'],
    categories: ['lifestyle', 'home', 'wellness', 'travel'],
    energy: 'low',
    style: 'cinematic_light',
    bestFor: ['lifestyle', 'home', 'travel', 'wellness', 'storytelling'],
    avoidFor: ['fitness', 'kids', 'direct_response'],
  },
  {
    id: 'mixkit-silent-descent-614',
    title: 'Silent Descent',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-silent-descent-614.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['luxury_elegant', 'clean_premium', 'general_ugc'],
    categories: ['premium', 'tech', 'lifestyle', 'jewelry'],
    energy: 'low',
    style: 'cinematic_light',
    bestFor: ['premium', 'jewelry', 'tech', 'storytelling', 'lifestyle'],
    avoidFor: ['kids', 'fitness', 'high_energy_demo'],
  },
  {
    id: 'mixkit-spirit-in-the-woods-139',
    title: 'Spirit in the Woods',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-spirit-in-the-woods-139.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['warm_lifestyle', 'playful_family', 'calm_wellness'],
    categories: ['lifestyle', 'home', 'family', 'kids', 'travel'],
    energy: 'low',
    style: 'acoustic',
    bestFor: ['family', 'kids', 'home', 'lifestyle', 'storytelling', 'travel'],
    avoidFor: ['fitness', 'direct_response'],
  },

  // ─── Warm / acoustic / family / lifestyle ──────────────────────────────
  {
    id: 'mixkit-sun-and-his-daughter-580',
    title: 'Sun and His Daughter',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-sun-and-his-daughter-580.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['playful_family', 'warm_lifestyle', 'general_ugc'],
    categories: ['family', 'kids', 'home', 'lifestyle'],
    energy: 'medium',
    style: 'acoustic',
    bestFor: ['family', 'kids', 'baby', 'home', 'lifestyle', 'parenting'],
    avoidFor: ['fitness', 'direct_response', 'tech_minimal'],
  },
  {
    id: 'mixkit-romantic-659',
    title: 'Romantic',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-romantic-659.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['soft_beauty', 'luxury_elegant', 'warm_lifestyle'],
    categories: ['beauty', 'jewelry', 'fragrance', 'gifts', 'lifestyle'],
    energy: 'low',
    style: 'soft_pop',
    bestFor: ['beauty', 'jewelry', 'fragrance', 'gifts', 'romance'],
    avoidFor: ['fitness', 'tech_minimal', 'kids'],
  },
  {
    id: 'mixkit-latin-lovers-39',
    title: 'Latin Lovers',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-latin-lovers-39.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['warm_lifestyle', 'playful_family', 'general_ugc'],
    categories: ['lifestyle', 'fashion', 'food', 'travel'],
    energy: 'medium',
    style: 'soft_pop',
    bestFor: ['fashion', 'lifestyle', 'food', 'travel'],
    avoidFor: ['tech_minimal', 'wellness', 'baby'],
  },
  {
    id: 'mixkit-discover-587',
    title: 'Discover',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-discover-587.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['general_ugc', 'warm_lifestyle', 'clean_premium'],
    categories: ['lifestyle', 'tech', 'storytelling'],
    energy: 'medium',
    style: 'cinematic_light',
    bestFor: ['lifestyle', 'storytelling', 'tech', 'discovery', 'general_ugc'],
    avoidFor: ['kids'],
  },

  // ─── Tech / minimal-electronic / clean ─────────────────────────────────
  {
    id: 'mixkit-tech-house-vibes-130',
    title: 'Tech House Vibes',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-tech-house-vibes-130.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['tech_minimal', 'direct_response_light', 'clean_premium'],
    categories: ['tech', 'gadgets', 'electronics', 'apps'],
    energy: 'medium',
    style: 'minimal_electronic',
    bestFor: ['tech', 'gadgets', 'electronics', 'apps', 'direct_response'],
    avoidFor: ['baby', 'wellness', 'beauty'],
  },
  {
    id: 'mixkit-cbpd-400',
    title: 'CBPD',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-cbpd-400.mp3',
    // Filename gives no mood hint — classify conservatively as a safe
    // generic UGC bed. Better to ship as the fallback bucket than to
    // miss it entirely.
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['general_ugc'],
    categories: ['general'],
    energy: 'medium',
    style: 'general_ugc',
    bestFor: ['general_ugc'],
    avoidFor: [],
  },
  {
    id: 'mixkit-deep-urban-623',
    title: 'Deep Urban',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-deep-urban-623.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['tech_minimal', 'direct_response_light', 'clean_premium'],
    categories: ['tech', 'fashion', 'urban'],
    energy: 'medium',
    style: 'minimal_electronic',
    bestFor: ['tech', 'fashion', 'streetwear', 'urban', 'direct_response'],
    avoidFor: ['baby', 'wellness', 'beauty'],
  },
  {
    id: 'mixkit-hip-hop-02-738',
    title: 'Hip Hop 02',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-hip-hop-02-738.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['energetic_demo', 'direct_response_light', 'tech_minimal'],
    categories: ['fashion', 'urban', 'streetwear', 'fitness'],
    energy: 'medium',
    style: 'upbeat',
    bestFor: ['fashion', 'streetwear', 'urban', 'fitness', 'direct_response'],
    avoidFor: ['baby', 'wellness', 'beauty', 'jewelry'],
  },

  // ─── Energetic / motion / fitness ──────────────────────────────────────
  {
    id: 'mixkit-driving-ambition-32',
    title: 'Driving Ambition',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-driving-ambition-32.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['energetic_demo', 'direct_response_light'],
    categories: ['fitness', 'tech', 'sports', 'automotive'],
    energy: 'high',
    style: 'upbeat',
    bestFor: ['fitness', 'sports', 'automotive', 'high_energy_demo'],
    avoidFor: ['baby', 'wellness', 'beauty', 'jewelry', 'meditation'],
  },
  {
    id: 'mixkit-sports-highlights-51',
    title: 'Sports Highlights',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-sports-highlights-51.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['energetic_demo'],
    categories: ['fitness', 'sports', 'automotive'],
    energy: 'high',
    style: 'upbeat',
    bestFor: ['fitness', 'sports', 'automotive', 'high_energy_demo'],
    avoidFor: ['baby', 'wellness', 'beauty', 'jewelry', 'meditation'],
  },

  // ─── Holiday / themed (used only when explicitly matched) ──────────────
  {
    id: 'mixkit-a-very-happy-christmas-897',
    title: 'A Very Happy Christmas',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-a-very-happy-christmas-897.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['playful_family', 'warm_lifestyle'],
    categories: ['holiday', 'family', 'gifts'],
    energy: 'medium',
    style: 'playful',
    bestFor: ['holiday', 'gifts', 'family'],
    // The Israeli market doesn't celebrate Christmas — keep this off
    // the auto-fallback path. It only plays when the script's
    // music_profile explicitly maps to "holiday".
    avoidFor: [
      'general_ugc',
      'beauty',
      'tech',
      'fitness',
      'wellness',
      'jewelry',
      'direct_response',
    ],
  },
  {
    id: 'mixkit-fright-night-871',
    title: 'Fright Night',
    fileUrl: 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev/music/mixkit-fright-night-871.mp3',
    source: 'user_provided',
    license: 'user_provided_free_to_use',
    attributionRequired: false,
    allowedPlatforms: ['all'],
    moods: ['playful_family'],
    categories: ['holiday'],
    energy: 'medium',
    style: 'playful',
    bestFor: ['halloween', 'holiday'],
    // Spooky vibe — never fits a normal product ad. Off the
    // auto-fallback like the Christmas track.
    avoidFor: [
      'general_ugc',
      'beauty',
      'tech',
      'fitness',
      'wellness',
      'jewelry',
      'baby',
      'kids',
      'family',
      'direct_response',
    ],
  },
] as const;

export function findTrackById(id: string): MusicTrack | null {
  return MUSIC_LIBRARY.find((t) => t.id === id) ?? null;
}

// Tracks that are SAFE to use as a fallback when nothing scored well.
// Excludes themed/seasonal tracks (Christmas, fright-night) and
// high-energy tracks — a calm Hebrew voice-over should never get a
// generic-fallback drum'n'bass bed.
export function listSafeFallbackTracks(): MusicTrack[] {
  return MUSIC_LIBRARY.filter(
    (t) =>
      t.energy !== 'high' &&
      !t.avoidFor.includes('general_ugc') &&
      (t.bestFor.includes('general_ugc') ||
        t.bestFor.includes('lifestyle') ||
        t.style === 'soft_pop' ||
        t.style === 'ambient' ||
        t.style === 'general_ugc'),
  );
}
