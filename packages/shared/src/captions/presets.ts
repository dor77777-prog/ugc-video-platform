// Caption style presets — captions.ai-style modern designs.
//
// Each preset is a complete ASS [V4+ Style] spec plus a few render
// hints (per-word vs phrase, fade timing, optional pop animation).
// The user picks ONE preset on the videos page before final render;
// the worker reads productData.captionsPreset and feeds it to
// buildAssFromChunks.
//
// ASS color format: &H<AA><BB><GG><RR>  (alpha + BGR, hex)
//   00 alpha = fully opaque, FF = fully transparent
//   White:        &H00FFFFFF
//   Hot pink (FF1493 → BGR 9314FF):  &H009314FF
//   Yellow:       &H0000FFFF
//   Cyan accent:  &H00FFE500
//
// borderStyle:
//   1 = outline + shadow (default), text is "floating"
//   3 = opaque box — Outline becomes a solid background block

export type CaptionPresetId =
  | 'classic'
  | 'bold_yellow'
  | 'block_card'
  | 'gradient_pink'
  | 'word_pop';

export interface CaptionPreset {
  id: CaptionPresetId;
  labelHe: string;
  /** Short Hebrew description for the picker tooltip. */
  descriptionHe: string;
  /** ASS font name. Multiple fallbacks supported by libass when the
   *  primary isn't installed. */
  fontFamily: string;
  /** Pixel font size at 1080×1920. The builder scales for other
   *  resolutions in the same proportion. */
  fontSize: number;
  /** ASS Bold flag (1 = bold). */
  bold: 0 | 1;
  primaryColor: string;
  outlineColor: string;
  backColor: string;
  /** ASS BorderStyle: 1 = outline+shadow, 3 = opaque box. */
  borderStyle: 1 | 3;
  outline: number;
  shadow: number;
  /** Bottom margin in source pixels (1920 tall). */
  marginV: number;
  /** Per-word events instead of phrase-level Dialogues. Triggers the
   *  word-by-word "captions.ai" pop look. */
  perWord: boolean;
  /** Pop-in scale animation on each event (ASS \t(0,80,\fscx110\fscy110)). */
  popIn: boolean;
  /** Fade in/out duration in ms. */
  fadeMs: number;
  /** Preview metadata for the picker UI. We use inline `style`
   *  values (not Tailwind classes) so the colors render exactly as
   *  the ASS output regardless of Tailwind purge / theme config. */
  preview: {
    /** Hebrew snippet shown in the tile. */
    sample: string;
    /** Hex color for the text fill (matches preset.primaryColor). */
    color: string;
    /** Whether to render a thick text-shadow stroke (mimicking the
     *  ASS outline). All presets except block_card use this. */
    stroke: boolean;
    /** When true, draw the sample inside a solid block (mimics
     *  borderStyle:3). Used for block_card. */
    block: boolean;
    /** Optional accent color for the active word in word_pop. */
    accent?: string;
  };
}

export const CAPTION_PRESETS: readonly CaptionPreset[] = [
  {
    id: 'classic',
    labelHe: 'קלאסי',
    descriptionHe: 'לבן מודגש עם מתאר שחור — בטוח וקריא בכל רקע',
    fontFamily: 'Heebo',
    fontSize: 64,
    bold: 1,
    primaryColor: '&H00FFFFFF', // white
    outlineColor: '&H00000000', // black outline
    backColor: '&H80000000', // 50% black drop shadow
    borderStyle: 1,
    outline: 4,
    shadow: 1,
    marginV: 210,
    perWord: false,
    popIn: false,
    fadeMs: 100,
    preview: {
      sample: 'מהפך אמיתי תוך שבועיים',
      color: '#FFFFFF',
      stroke: true,
      block: false,
    },
  },
  {
    id: 'bold_yellow',
    labelHe: 'צהוב יוצר',
    descriptionHe: 'צהוב חזק עם מתאר שחור עבה — סטייל TikTok / יוצרי תוכן',
    fontFamily: 'Heebo',
    fontSize: 72,
    bold: 1,
    primaryColor: '&H0000FFFF', // yellow (BGR 00FFFF)
    outlineColor: '&H00000000', // black
    backColor: '&H80000000',
    borderStyle: 1,
    outline: 6,
    shadow: 2,
    marginV: 230,
    perWord: false,
    popIn: false,
    fadeMs: 80,
    preview: {
      sample: 'מהפך אמיתי תוך שבועיים',
      color: '#FFE600',
      stroke: true,
      block: false,
    },
  },
  {
    id: 'block_card',
    labelHe: 'בלוק פרימיום',
    descriptionHe: 'טקסט לבן בתוך כרטיס שחור חצי-שקוף — לוק נקי, מודרני',
    fontFamily: 'Heebo',
    fontSize: 56,
    bold: 1,
    primaryColor: '&H00FFFFFF', // white
    // borderStyle 3 makes outlineColor the BACKGROUND BOX color. We
    // use 65%-opaque black so video shows through subtly.
    outlineColor: '&HA0000000',
    backColor: '&H80000000',
    borderStyle: 3,
    outline: 16, // padding around text inside the block
    shadow: 0,
    marginV: 240,
    perWord: false,
    popIn: false,
    fadeMs: 120,
    preview: {
      sample: 'מהפך אמיתי תוך שבועיים',
      color: '#FFFFFF',
      stroke: false,
      block: true,
    },
  },
  {
    id: 'gradient_pink',
    labelHe: 'ורוד Reels',
    descriptionHe: 'ורוד בוהק עם מתאר שחור — אסתטיקה של Reels / Stories',
    fontFamily: 'Heebo',
    fontSize: 70,
    bold: 1,
    primaryColor: '&H009314FF', // hot pink #FF1493 → BGR 9314FF
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    borderStyle: 1,
    outline: 5,
    shadow: 1,
    marginV: 220,
    perWord: false,
    popIn: true, // small scale-up pop on entry
    fadeMs: 90,
    preview: {
      sample: 'מהפך אמיתי תוך שבועיים',
      color: '#FF1493',
      stroke: true,
      block: false,
    },
  },
  {
    id: 'word_pop',
    labelHe: 'מילה-מילה',
    descriptionHe: 'כל מילה בנפרד עם פופ-אין — סטייל captions.ai / TikTok',
    fontFamily: 'Heebo',
    fontSize: 90,
    bold: 1,
    primaryColor: '&H00FFFFFF', // white
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    borderStyle: 1,
    outline: 6,
    shadow: 2,
    marginV: 280, // higher up — single words are visually heavier
    perWord: true,
    popIn: true,
    fadeMs: 50,
    preview: {
      sample: 'מהפך',
      color: '#FFFFFF',
      stroke: true,
      block: false,
      accent: '#FFE600',
    },
  },
] as const;

export const DEFAULT_CAPTION_PRESET_ID: CaptionPresetId = 'classic';

export function findCaptionPreset(id: string | null | undefined): CaptionPreset {
  return (
    CAPTION_PRESETS.find((p) => p.id === id) ??
    CAPTION_PRESETS.find((p) => p.id === DEFAULT_CAPTION_PRESET_ID)!
  );
}
