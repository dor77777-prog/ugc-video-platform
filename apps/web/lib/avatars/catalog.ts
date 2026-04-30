// Static avatar catalog — 25 distinct AI-generated Israeli portraits.
// The image files are produced by scripts/generate-avatar-portraits.ts (one-time
// gpt-image-2 generation) and saved to apps/web/public/avatars/{id}.png.
// gpt-image-2 preserves identity reliably when references are AI-generated
// (unlike real-people stock photos, where its safety policies cause drift).

import type {
  PersonaArchetype,
  ReligiousRegister,
} from '@/lib/scene-planning/israeli-realism-rules';

export type AvatarGender = 'male' | 'female';
export type AvatarAgeRange = '18-20' | '20-25' | '25-30' | '30-40' | '40-50' | '50+';
export type AvatarStyle = 'casual' | 'sporty' | 'professional' | 'lifestyle';

export interface AvatarProfile {
  id: string;
  name: string;
  gender: AvatarGender;
  ageRange: AvatarAgeRange;
  style: AvatarStyle;
  imageUrl: string;
  region: string; // descriptor used by the prompt builder
  // V14 PR1 — the avatar IS the character. Persona archetype + religious
  // register are the two CueContext inputs that downstream scene planning
  // (chooseIsraeliCues) needs and can't infer from {gender, age, region}
  // alone. Required + explicit for all 25 entries; never nullable.
  archetype: PersonaArchetype;
  religiousRegister: ReligiousRegister;
}

// V12.2 — avatars are served from Cloudflare R2 in production (the
// Vercel serverless function bundle excludes public/ to keep cold-start
// fast). The R2 public URL is not a secret — it's a hard-coded CDN
// endpoint. To re-upload after changing the catalog, run:
//   npx tsx apps/web/scripts/upload-static-assets-to-r2.ts
const R2_PUBLIC = 'https://pub-eb116bdbeab8486f96ecf7c4fbc1014a.r2.dev';
const local = (id: string) => `${R2_PUBLIC}/avatars/${id}.png`;

export const AVATAR_CATALOG: AvatarProfile[] = [
  // Female · 20-30
  { id: 'noa', name: 'נועה', gender: 'female', ageRange: '20-25', style: 'casual', region: 'Tel Aviv', imageUrl: local('noa'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'shira', name: 'שירה', gender: 'female', ageRange: '20-25', style: 'sporty', region: 'Tel Aviv', imageUrl: local('shira'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'tamar', name: 'תמר', gender: 'female', ageRange: '25-30', style: 'casual', region: 'Tel Aviv', imageUrl: local('tamar'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'maya', name: 'מאיה', gender: 'female', ageRange: '25-30', style: 'lifestyle', region: 'Haifa', imageUrl: local('maya'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  // Female · 30-50
  { id: 'liat', name: 'ליאת', gender: 'female', ageRange: '30-40', style: 'professional', region: 'Tel Aviv', imageUrl: local('liat'), archetype: 'aspirational_modern', religiousRegister: 'secular' },
  { id: 'ortal', name: 'אורטל', gender: 'female', ageRange: '30-40', style: 'casual', region: 'Ramat Gan', imageUrl: local('ortal'), archetype: 'family_suburban', religiousRegister: 'secular' },
  { id: 'einat', name: 'עינת', gender: 'female', ageRange: '40-50', style: 'professional', region: 'Tel Aviv', imageUrl: local('einat'), archetype: 'aspirational_modern', religiousRegister: 'secular' },
  { id: 'galit', name: 'גלית', gender: 'female', ageRange: '50+', style: 'lifestyle', region: 'Jerusalem', imageUrl: local('galit'), archetype: 'mature_traditional', religiousRegister: 'traditional' },
  // Male · 20-30
  { id: 'yoav', name: 'יואב', gender: 'male', ageRange: '20-25', style: 'casual', region: 'Tel Aviv', imageUrl: local('yoav'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'omri', name: 'עומרי', gender: 'male', ageRange: '20-25', style: 'sporty', region: 'Tel Aviv', imageUrl: local('omri'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'ron', name: 'רון', gender: 'male', ageRange: '25-30', style: 'casual', region: 'Tel Aviv', imageUrl: local('ron'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'ido', name: 'עידו', gender: 'male', ageRange: '25-30', style: 'lifestyle', region: 'Haifa', imageUrl: local('ido'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  // Male · 30-50
  { id: 'eran', name: 'ערן', gender: 'male', ageRange: '30-40', style: 'professional', region: 'Tel Aviv', imageUrl: local('eran'), archetype: 'aspirational_modern', religiousRegister: 'secular' },
  { id: 'avi', name: 'אבי', gender: 'male', ageRange: '30-40', style: 'casual', region: 'Ramat Gan', imageUrl: local('avi'), archetype: 'family_suburban', religiousRegister: 'secular' },
  { id: 'gil', name: 'גיל', gender: 'male', ageRange: '40-50', style: 'professional', region: 'Tel Aviv', imageUrl: local('gil'), archetype: 'aspirational_modern', religiousRegister: 'secular' },
  { id: 'moshe', name: 'משה', gender: 'male', ageRange: '50+', style: 'lifestyle', region: 'Jerusalem', imageUrl: local('moshe'), archetype: 'mature_traditional', religiousRegister: 'traditional' },

  // ── New diverse Israeli additions ──────────────────────────────────────────
  // Female · 18-30
  { id: 'yael', name: 'יעל', gender: 'female', ageRange: '18-20', style: 'casual', region: 'Be\'er Sheva', imageUrl: local('yael'), archetype: 'periphery_practical', religiousRegister: 'secular' },
  { id: 'adi', name: 'עדי', gender: 'female', ageRange: '20-25', style: 'sporty', region: 'Tel Aviv', imageUrl: local('adi'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'inbar', name: 'ענבר', gender: 'female', ageRange: '20-25', style: 'lifestyle', region: 'Tel Aviv', imageUrl: local('inbar'), archetype: 'young_tel_aviv', religiousRegister: 'secular' },
  { id: 'avigail', name: 'אביגיל', gender: 'female', ageRange: '25-30', style: 'professional', region: 'Modi\'in', imageUrl: local('avigail'), archetype: 'family_suburban', religiousRegister: 'traditional' },
  // Female · 30-50
  { id: 'sapir', name: 'ספיר', gender: 'female', ageRange: '30-40', style: 'casual', region: 'Tel Aviv', imageUrl: local('sapir'), archetype: 'family_suburban', religiousRegister: 'secular' },
  { id: 'hila', name: 'הילה', gender: 'female', ageRange: '40-50', style: 'lifestyle', region: 'Galilee', imageUrl: local('hila'), archetype: 'outdoorsy', religiousRegister: 'secular' },
  // Male · 18-50
  { id: 'tomer', name: 'תומר', gender: 'male', ageRange: '18-20', style: 'casual', region: 'Eilat', imageUrl: local('tomer'), archetype: 'outdoorsy', religiousRegister: 'secular' },
  { id: 'itay', name: 'איתי', gender: 'male', ageRange: '30-40', style: 'casual', region: 'Haifa', imageUrl: local('itay'), archetype: 'family_suburban', religiousRegister: 'secular' },
  { id: 'yosef', name: 'יוסף', gender: 'male', ageRange: '50+', style: 'lifestyle', region: 'Jerusalem', imageUrl: local('yosef'), archetype: 'mature_traditional', religiousRegister: 'traditional' },
];

export function findAvatar(id: string | null | undefined): AvatarProfile | null {
  if (!id) return null;
  return AVATAR_CATALOG.find((a) => a.id === id) ?? null;
}

// Used by image-prompt builder to instruct gpt-image-2 about the chosen avatar.
export function describeAvatar(a: AvatarProfile): string {
  const gender = a.gender === 'female' ? 'woman' : 'man';
  const age = ageDescriptor(a.ageRange);
  return `${age} Israeli ${gender} (region: ${a.region}, style: ${a.style})`;
}

function ageDescriptor(r: AvatarAgeRange): string {
  switch (r) {
    case '18-20': return 'late-teens';
    case '20-25': return 'early-twenties';
    case '25-30': return 'late-twenties';
    case '30-40': return 'thirties';
    case '40-50': return 'forties';
    case '50+': return 'fifties';
  }
}

// Filter helpers used by the UI.
export const ALL_GENDERS: AvatarGender[] = ['female', 'male'];
export const ALL_AGE_RANGES: AvatarAgeRange[] = ['18-20', '20-25', '25-30', '30-40', '40-50', '50+'];
