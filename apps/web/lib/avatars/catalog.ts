// Static avatar catalog — 16 distinct AI-generated Israeli portraits.
// The image files are produced by scripts/generate-avatar-portraits.ts (one-time
// gpt-image-2 generation) and saved to apps/web/public/avatars/{id}.png.
// gpt-image-2 preserves identity reliably when references are AI-generated
// (unlike real-people stock photos, where its safety policies cause drift).

export type AvatarGender = 'male' | 'female';
export type AvatarAgeRange = '20-25' | '25-30' | '30-40' | '40-50' | '50+';
export type AvatarStyle = 'casual' | 'sporty' | 'professional' | 'lifestyle';

export interface AvatarProfile {
  id: string;
  name: string;
  gender: AvatarGender;
  ageRange: AvatarAgeRange;
  style: AvatarStyle;
  imageUrl: string;
  region: string; // descriptor used by the prompt builder
}

const local = (id: string) => `/avatars/${id}.png`;

export const AVATAR_CATALOG: AvatarProfile[] = [
  // Female · 20-30
  { id: 'noa', name: 'נועה', gender: 'female', ageRange: '20-25', style: 'casual', region: 'Tel Aviv', imageUrl: local('noa') },
  { id: 'shira', name: 'שירה', gender: 'female', ageRange: '20-25', style: 'sporty', region: 'Tel Aviv', imageUrl: local('shira') },
  { id: 'tamar', name: 'תמר', gender: 'female', ageRange: '25-30', style: 'casual', region: 'Tel Aviv', imageUrl: local('tamar') },
  { id: 'maya', name: 'מאיה', gender: 'female', ageRange: '25-30', style: 'lifestyle', region: 'Haifa', imageUrl: local('maya') },
  // Female · 30-50
  { id: 'liat', name: 'ליאת', gender: 'female', ageRange: '30-40', style: 'professional', region: 'Tel Aviv', imageUrl: local('liat') },
  { id: 'ortal', name: 'אורטל', gender: 'female', ageRange: '30-40', style: 'casual', region: 'Ramat Gan', imageUrl: local('ortal') },
  { id: 'einat', name: 'עינת', gender: 'female', ageRange: '40-50', style: 'professional', region: 'Tel Aviv', imageUrl: local('einat') },
  { id: 'galit', name: 'גלית', gender: 'female', ageRange: '50+', style: 'lifestyle', region: 'Jerusalem', imageUrl: local('galit') },
  // Male · 20-30
  { id: 'yoav', name: 'יואב', gender: 'male', ageRange: '20-25', style: 'casual', region: 'Tel Aviv', imageUrl: local('yoav') },
  { id: 'omri', name: 'עומרי', gender: 'male', ageRange: '20-25', style: 'sporty', region: 'Tel Aviv', imageUrl: local('omri') },
  { id: 'ron', name: 'רון', gender: 'male', ageRange: '25-30', style: 'casual', region: 'Tel Aviv', imageUrl: local('ron') },
  { id: 'ido', name: 'עידו', gender: 'male', ageRange: '25-30', style: 'lifestyle', region: 'Haifa', imageUrl: local('ido') },
  // Male · 30-50
  { id: 'eran', name: 'ערן', gender: 'male', ageRange: '30-40', style: 'professional', region: 'Tel Aviv', imageUrl: local('eran') },
  { id: 'avi', name: 'אבי', gender: 'male', ageRange: '30-40', style: 'casual', region: 'Ramat Gan', imageUrl: local('avi') },
  { id: 'gil', name: 'גיל', gender: 'male', ageRange: '40-50', style: 'professional', region: 'Tel Aviv', imageUrl: local('gil') },
  { id: 'moshe', name: 'משה', gender: 'male', ageRange: '50+', style: 'lifestyle', region: 'Jerusalem', imageUrl: local('moshe') },
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
    case '20-25': return 'early-twenties';
    case '25-30': return 'late-twenties';
    case '30-40': return 'thirties';
    case '40-50': return 'forties';
    case '50+': return 'fifties';
  }
}

// Filter helpers used by the UI.
export const ALL_GENDERS: AvatarGender[] = ['female', 'male'];
export const ALL_AGE_RANGES: AvatarAgeRange[] = ['20-25', '25-30', '30-40', '40-50', '50+'];
