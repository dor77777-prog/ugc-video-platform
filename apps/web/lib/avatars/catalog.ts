// Static avatar catalog — 16 profiles spanning gender, age range, and look.
// Image URLs point to randomuser.me, a free portrait API used widely for demos
// (commercial-use friendly, no key needed). When we wire HeyGen we'll replace
// this with a DB-backed catalog pulled from their API.

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

// randomuser.me serves consistent portraits via /api/portraits/{gender}/{n}.jpg.
// Pinned indices keep the catalog stable across reloads.
const port = (gender: 'men' | 'women', n: number) =>
  `https://randomuser.me/api/portraits/${gender}/${n}.jpg`;

export const AVATAR_CATALOG: AvatarProfile[] = [
  // Female · 20-30
  { id: 'noa', name: 'נועה', gender: 'female', ageRange: '20-25', style: 'casual', region: 'Tel Aviv', imageUrl: port('women', 44) },
  { id: 'shira', name: 'שירה', gender: 'female', ageRange: '20-25', style: 'sporty', region: 'Tel Aviv', imageUrl: port('women', 65) },
  { id: 'tamar', name: 'תמר', gender: 'female', ageRange: '25-30', style: 'casual', region: 'Tel Aviv', imageUrl: port('women', 12) },
  { id: 'maya', name: 'מאיה', gender: 'female', ageRange: '25-30', style: 'lifestyle', region: 'Haifa', imageUrl: port('women', 33) },
  // Female · 30-50
  { id: 'liat', name: 'ליאת', gender: 'female', ageRange: '30-40', style: 'professional', region: 'Tel Aviv', imageUrl: port('women', 79) },
  { id: 'ortal', name: 'אורטל', gender: 'female', ageRange: '30-40', style: 'casual', region: 'Ramat Gan', imageUrl: port('women', 22) },
  { id: 'einat', name: 'עינת', gender: 'female', ageRange: '40-50', style: 'professional', region: 'Tel Aviv', imageUrl: port('women', 50) },
  { id: 'galit', name: 'גלית', gender: 'female', ageRange: '50+', style: 'lifestyle', region: 'Jerusalem', imageUrl: port('women', 90) },
  // Male · 20-30
  { id: 'yoav', name: 'יואב', gender: 'male', ageRange: '20-25', style: 'casual', region: 'Tel Aviv', imageUrl: port('men', 32) },
  { id: 'omri', name: 'עומרי', gender: 'male', ageRange: '20-25', style: 'sporty', region: 'Tel Aviv', imageUrl: port('men', 11) },
  { id: 'ron', name: 'רון', gender: 'male', ageRange: '25-30', style: 'casual', region: 'Tel Aviv', imageUrl: port('men', 56) },
  { id: 'ido', name: 'עידו', gender: 'male', ageRange: '25-30', style: 'lifestyle', region: 'Haifa', imageUrl: port('men', 78) },
  // Male · 30-50
  { id: 'eran', name: 'ערן', gender: 'male', ageRange: '30-40', style: 'professional', region: 'Tel Aviv', imageUrl: port('men', 41) },
  { id: 'avi', name: 'אבי', gender: 'male', ageRange: '30-40', style: 'casual', region: 'Ramat Gan', imageUrl: port('men', 27) },
  { id: 'gil', name: 'גיל', gender: 'male', ageRange: '40-50', style: 'professional', region: 'Tel Aviv', imageUrl: port('men', 64) },
  { id: 'moshe', name: 'משה', gender: 'male', ageRange: '50+', style: 'lifestyle', region: 'Jerusalem', imageUrl: port('men', 83) },
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
