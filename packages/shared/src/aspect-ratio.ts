// V26.16 — single source of truth for output aspect ratio handling.
//
// The platform supports three aspect ratios end-to-end:
//
//   9:16  — vertical, default (TikTok / Reels / Shorts / WhatsApp Status)
//   1:1   — square (Instagram feed, Facebook feed, LinkedIn)
//   16:9  — horizontal (YouTube, Twitter / X timeline, embedded video)
//
// The user picks the aspect ratio in the new-project wizard. The choice
// flows from `Project.productData.aspectRatio` → image generation
// (gpt-image-2 size mapping) → clip i2v provider (Kling/Grok aspect
// param) → worker composition (ffmpeg scale + ASS playRes).
//
// Pre-V26.16 the choice was stored but only the image-gen path
// honored it; everything downstream hardcoded 9:16 / 1080×1920. V26.16
// wires this helper through all stages so a 1:1 / 16:9 selection
// produces a real square / horizontal MP4.

// AspectRatio type is defined in ./types/render.ts (legacy location);
// re-import here so the rest of the helpers compile cleanly without
// duplicating the union.
import type { AspectRatio } from './types/render';

export const ASPECT_RATIOS: AspectRatio[] = ['9:16', '1:1', '16:9'];

/** Output pixel dimensions for the final composition. Picked at
 *  1080-on-the-short-side so quality stays high on every platform. */
export const ASPECT_RATIO_DIMENSIONS: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 },
};

/** Source size emitted by gpt-image-2 (medium quality). 1024 on the
 *  short side keeps the per-image cost in the medium tier. */
export const ASPECT_RATIO_IMAGE_SIZE: Record<AspectRatio, string> = {
  '9:16': '1024x1792',
  '1:1': '1024x1024',
  '16:9': '1792x1024',
};

/** Hebrew label for UI selectors. */
export const ASPECT_RATIO_LABEL_HE: Record<AspectRatio, string> = {
  '9:16': 'אנכי 9:16',
  '1:1': 'ריבוע 1:1',
  '16:9': 'אופקי 16:9',
};

/** Where this aspect typically ships — shown to the user under the
 *  aspect-ratio picker as platform guidance. */
export const ASPECT_RATIO_TARGETS_HE: Record<AspectRatio, string> = {
  '9:16': 'TikTok · Reels · Shorts · WhatsApp Status',
  '1:1': 'Instagram Feed · Facebook Feed · LinkedIn',
  '16:9': 'YouTube · Twitter · אתר / מצגת',
};

/** Read aspectRatio off `Project.productData`, defaulting to 9:16
 *  for legacy projects that pre-date the field. */
export function aspectRatioFromProductData(
  productData: unknown,
): AspectRatio {
  if (productData && typeof productData === 'object') {
    const ar = (productData as Record<string, unknown>).aspectRatio;
    if (ar === '1:1' || ar === '16:9') return ar;
  }
  return '9:16';
}

export function isAspectRatio(v: unknown): v is AspectRatio {
  return v === '9:16' || v === '1:1' || v === '16:9';
}
