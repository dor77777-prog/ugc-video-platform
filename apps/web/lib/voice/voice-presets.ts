// Curated catalog of 12 Israeli Hebrew voices for ElevenLabs.
//
// Pattern matches apps/web/lib/avatars/catalog.ts — same chip-filter UX,
// same "12 hand-picked entries" feel, persisted on the project as
// productData.voiceId. Each preset has a sample MP3 the user can preview
// in the VoicePicker UI before committing to a project-level voice.
//
// IMPORTANT: voice IDs below are placeholders. Replace each `voiceId` with
// the actual ElevenLabs voice id you want to expose. The UI picker, the
// backend wiring, and the cost tracking all key off these slugs — not the
// upstream voice ids — so you can swap a `voiceId` value without touching
// any other code.
//
// Where to find Hebrew voice IDs:
//   1. https://elevenlabs.io/app/voice-library — filter by language: Hebrew
//   2. Click "Add to my voices" on each one you want
//   3. Open the voice in your library → copy the Voice ID from the URL
//   4. Paste it into the corresponding `voiceId` field below

export type VoiceGender = 'male' | 'female';
export type VoiceAgeRange = '18-25' | '25-35' | '35-50' | '50+';
export type VoiceEnergy = 'calm' | 'warm' | 'energetic' | 'authoritative';

export interface VoicePreset {
  /** Stable slug — referenced by `Project.productData.voiceId`. */
  id: string;
  /** Hebrew display name shown in the picker. */
  displayName: string;
  /** ElevenLabs upstream voice id. Swap to change voice without code edits. */
  voiceId: string;
  gender: VoiceGender;
  ageRange: VoiceAgeRange;
  energy: VoiceEnergy;
  /** Public URL to a 5-10s sample MP3 the picker plays on hover/click. */
  sampleUrl: string;
  /** One-sentence Hebrew description for the picker tile. */
  description: string;
}

// 16 UGC-tuned voices hand-picked from the ElevenLabs Voice Library
// (curated for social media / advertising / product-review delivery).
// All voiceIds work via the public Shared Voices API on Starter+ plans —
// they don't have to be added to "My Voices" first.
//
// Pre-generated MP3 samples live in apps/web/public/voice-samples/ — run
// `npx tsx scripts/generate-voice-samples.ts --force` after changing this
// list. Each voice gets a 25-char Hebrew sample (~$0.0025 each first time,
// then served from disk forever).
//
// To swap a voice: paste a new voiceId, run the regen script. Slug `id`
// stays stable so nothing else needs to change.
export const VOICE_PRESETS: VoicePreset[] = [
  // ── Female · UGC creators ──────────────────────────────────────────────
  {
    id: 'lea_ugc_creator',
    displayName: 'Lea — UGC creator',
    voiceId: 'KSyQzmsYhFbuOhqj1Xxv',
    gender: 'female',
    ageRange: '25-35',
    energy: 'energetic',
    sampleUrl: '/api/voice/sample/KSyQzmsYhFbuOhqj1Xxv',
    description: 'דינמית ואנרגטית. UGC קלאסי לרילז ואינסטגרם.',
  },
  {
    id: 'meesha_ugc_ad',
    displayName: 'Meesha — UGC Ad Voice',
    voiceId: 'q3Hv0ih6DaXr52fiQyrd',
    gender: 'female',
    ageRange: '25-35',
    energy: 'energetic',
    sampleUrl: '/api/voice/sample/q3Hv0ih6DaXr52fiQyrd',
    description: 'אנרגיה מדבקת, התלהבות אמיתית. הכי טוב למודעות UGC.',
  },
  {
    id: 'avery_influencer',
    displayName: 'Avery — Social Media Influencer',
    voiceId: '7RxgWgwjutaZHWIknJAY',
    gender: 'female',
    ageRange: '18-25',
    energy: 'energetic',
    sampleUrl: '/api/voice/sample/7RxgWgwjutaZHWIknJAY',
    description: 'אינפלואנסרית טיפוסית. מתאים לאופנה, יופי, lifestyle.',
  },
  {
    id: 'riya_rao_pleasant',
    displayName: 'Riya Rao — Energetic and Pleasant',
    voiceId: 'xAmuYLyEOAjjvwszDZPp',
    gender: 'female',
    ageRange: '25-35',
    energy: 'energetic',
    sampleUrl: '/api/voice/sample/xAmuYLyEOAjjvwszDZPp',
    description: 'מותגי רילז + מודעות אינפלואנסר. נעימה ומחזירה לצפייה.',
  },
  {
    id: 'maria_natural_ugc',
    displayName: 'Maria — Natural UGC & Social Media',
    voiceId: 'k1tFw6wFoibtJrwu6GTz',
    gender: 'female',
    ageRange: '25-35',
    energy: 'warm',
    sampleUrl: '/api/voice/sample/k1tFw6wFoibtJrwu6GTz',
    description: 'דיבור טבעי ומחייך. מתאים לעדויות, סיפורי משתמשים.',
  },
  {
    id: 'irene_ugc',
    displayName: 'Irene UGC — Conversational & Optimistic',
    voiceId: 'MOOG1hZESAxDt4UaletY',
    gender: 'female',
    ageRange: '25-35',
    energy: 'warm',
    sampleUrl: '/api/voice/sample/MOOG1hZESAxDt4UaletY',
    description: 'נשמעת כמו חברה אמיתית. אופטימית ומחברת.',
  },
  {
    id: 'chloe_warm',
    displayName: 'Chloé — Warm, Friendly & UGC Ready',
    voiceId: 'Hy28BjVfgieDVMiyQpQe',
    gender: 'female',
    ageRange: '25-35',
    energy: 'warm',
    sampleUrl: '/api/voice/sample/Hy28BjVfgieDVMiyQpQe',
    description: 'רכה ומשכנעת. מצוינת לסקינקייר, בריאות, וולנס.',
  },
  {
    id: 'charlotte_modern',
    displayName: 'Charlotte — Warm, Clear, Modern',
    voiceId: '6fZce9LFNG3iEITDfqZZ',
    gender: 'female',
    ageRange: '18-25',
    energy: 'warm',
    sampleUrl: '/api/voice/sample/6fZce9LFNG3iEITDfqZZ',
    description: 'Gen Z warmth, מודרני וברור. מתאים לקוסמטיקה ומוצרי lifestyle.',
  },
  {
    id: 'ngan_bubbly',
    displayName: 'Ngan — Cute, Bubbly and Authentic',
    voiceId: 'a3AkyqGG4v8Pg7SWQ0Y3',
    gender: 'female',
    ageRange: '18-25',
    energy: 'energetic',
    sampleUrl: '/api/voice/sample/a3AkyqGG4v8Pg7SWQ0Y3',
    description: 'מתוקה, נמרצת ואותנטית. מתאים לחטיפים, fashion, gadgets.',
  },
  {
    id: 'katty_trustworthy',
    displayName: 'Katty — Energetic and Trustworthy',
    voiceId: '7JbZPqJGWUfXXBim0T8U',
    gender: 'female',
    ageRange: '25-35',
    energy: 'authoritative',
    sampleUrl: '/api/voice/sample/7JbZPqJGWUfXXBim0T8U',
    description: 'אנרגטית אבל אמינה. מתאים לטיפים, recommendations, פיננסים.',
  },
  {
    id: 'moonglow_polished',
    displayName: 'Moonglow — Mediative and Polished',
    voiceId: 'vnewfQdVVk9Y9DZWVRNm',
    gender: 'female',
    ageRange: '25-35',
    energy: 'calm',
    sampleUrl: '/api/voice/sample/vnewfQdVVk9Y9DZWVRNm',
    description: 'רגועה ומלוטשת. מתאים למדיטציה, שינה, קוסמטיקה טבעית.',
  },
  // ── Female · Mature voices ────────────────────────────────────────────
  // Older / wiser timbres for product categories where authority +
  // life experience helps (parenting, supplements, finance, wellness).
  // Multilingual v2 handles the Hebrew character even though the source
  // voices are tagged with non-Hebrew accents — same as the rest of
  // this list.
  {
    id: 'loulou_narrator',
    displayName: 'Loulou — Social Media Narrator',
    voiceId: '1T2MOlQA0Xp3hNv1dBxp',
    gender: 'female',
    ageRange: '50+',
    energy: 'warm',
    sampleUrl: '/api/voice/sample/1T2MOlQA0Xp3hNv1dBxp',
    description: 'אישה בוגרת, חמה ואותנטית. מתאים להמלצות אישיות, סיפורי אמא/דודה, פרודוקטים להורים.',
  },
  {
    id: 'azu_soft_melodic',
    displayName: 'Azu — Calm, Soft and Melodic',
    voiceId: 'D3ws14YxTqcjPaXEOehR',
    gender: 'female',
    ageRange: '50+',
    energy: 'calm',
    sampleUrl: '/api/voice/sample/D3ws14YxTqcjPaXEOehR',
    description: 'רכה, איטית ומחושבת. מתאים לסיפורים אינטימיים, וולנס, supplements, מותגים בוגרים.',
  },
  // ── Male · UGC creators ────────────────────────────────────────────────
  {
    id: 'brad_indoor_ugc',
    displayName: 'Brad — Realistic UGC Indoor',
    voiceId: 'T4x5CtnhOiichhcqFzgg',
    gender: 'male',
    ageRange: '25-35',
    energy: 'warm',
    sampleUrl: '/api/voice/sample/T4x5CtnhOiichhcqFzgg',
    description: 'מיקרופון פנימי של סלולרי, אינפלואנסר אמיתי. UGC הכי משכנע.',
  },
  {
    id: 'ryan_product_reviewer',
    displayName: 'Ryan — Product Reviewer',
    voiceId: '4e32WqNVWRquDa1OcRYZ',
    gender: 'male',
    ageRange: '25-35',
    energy: 'warm',
    sampleUrl: '/api/voice/sample/4e32WqNVWRquDa1OcRYZ',
    description: 'real-talk UGC review — נשמע כמו חבר ממליץ על מוצר.',
  },
  {
    id: 'lorenzo_inspiring',
    displayName: 'Lorenzo — Youthful, Expressive',
    voiceId: 'DTGwzA4YLrWB1FAT6Uas',
    gender: 'male',
    ageRange: '18-25',
    energy: 'energetic',
    sampleUrl: '/api/voice/sample/DTGwzA4YLrWB1FAT6Uas',
    description: 'צעיר, אקספרסיבי, מעורר השראה. מתאים לפיטנס, gadgets, מותגים.',
  },
  {
    id: 'blain_ad_voice',
    displayName: 'Blain — Conversational Ad Voice',
    voiceId: 'jHprmvvyQreWpRuutdmV',
    gender: 'male',
    ageRange: '25-35',
    energy: 'authoritative',
    sampleUrl: '/api/voice/sample/jHprmvvyQreWpRuutdmV',
    description: 'רגוע, בטוח, "אנושי". מותאם בדיוק למודעות שיחתיות.',
  },
  {
    id: 'titan_bold',
    displayName: 'Titan — Deep, Bold, and Powerful',
    voiceId: 'dtSEyYGNJqjrtBArPCVZ',
    gender: 'male',
    ageRange: '25-35',
    energy: 'authoritative',
    sampleUrl: '/api/voice/sample/dtSEyYGNJqjrtBArPCVZ',
    description: 'עמוק, נועז וחזק. מתאים לטק, רכב, supplements, B2B.',
  },
];

export function findVoicePreset(id: string | null | undefined): VoicePreset | null {
  if (!id) return null;
  return VOICE_PRESETS.find((v) => v.id === id) ?? null;
}

export const ALL_VOICE_GENDERS: VoiceGender[] = ['female', 'male'];
export const ALL_VOICE_AGE_RANGES: VoiceAgeRange[] = ['18-25', '25-35', '35-50', '50+'];
export const ALL_VOICE_ENERGIES: VoiceEnergy[] = ['calm', 'warm', 'energetic', 'authoritative'];

export const VOICE_ENERGY_LABEL_HE: Record<VoiceEnergy, string> = {
  calm: 'רגוע',
  warm: 'חמים',
  energetic: 'אנרגטי',
  authoritative: 'סמכותי',
};
