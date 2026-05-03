// V28.0.ST4 — re-export from packages/shared so the eval and the
// production register validator share a single source of truth.
//
// Original implementation moved to packages/shared/src/register/markers.ts
// in Sub-task 4. Existing call sites that import from this path keep
// working unchanged.

export {
  CANONICAL_MARKERS,
  countMarkersInHebrew,
  CANONICAL_MARKERS_DISPLAY_HEBREW,
} from '@ugc-video/shared';
export type {
  CanonicalMarker,
  MarkerCount,
} from '@ugc-video/shared';
