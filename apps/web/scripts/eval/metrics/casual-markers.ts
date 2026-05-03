// casual_markers_per_scene — counts canonical Hebrew "spoken Israeli"
// markers per scene's spoken_text_hebrew, averaged across all scenes
// from all expanded scripts.
//
// CTA-style closing scenes (scene_goal === 'decision_push') are
// EXCLUDED from the average — those are short call-to-action beats.
//
// V28.0.ST4 iter 3 — REVERSED gate from "more is better" to a band:
//   - Old gate: avg >= 1.0 (=5 markers per 5-scene script — too many,
//     reads as fake per native-speaker review)
//   - New gate: 0.2 <= avg <= 0.5 (=1-2.5 markers per 5-scene script,
//     matches user-validated "1-2 per WHOLE script, sparse + natural")
// We keep the per-scene metric (compatible with prior eval JSONs) but
// add totalMarkersPerScript + averageMarkersPerScript for the new
// script-level framing.

import { countMarkersInHebrew } from '../lib/canonical-markers';
import type { ExpandedScriptShape } from '../runners/expand-runner';

export interface CasualMarkersResult {
  /** Per-non-CTA-scene average. Kept for backwards compat with prior
   *  baseline JSONs. V28.0.ST4 iter 3 gate uses the band 0.2-0.5. */
  avgMarkersPerScene: number;
  scenesCounted: number;
  scenesWithZero: number;
  /** V28.0.ST4 iter 3 — per-script aggregates. The new framing.
   *  totalMarkersPerScript averaged across all scripts in the sample. */
  avgMarkersPerScript: number;
  /** Distribution of per-script totals. Useful for spotting outliers
   *  (e.g. one script with 8 markers while others have 1-2). */
  perScriptTotals: number[];
  /** V28.0.ST4 iter 3 — count of scripts with stacking violations
   *  (any scene > 1 marker). New post-iter-3 enforcement signal. */
  stackedSceneCount: number;
  perScript: Array<{
    framework: string;
    sceneCount: number;
    excludedCount: number;
    avgPerScene: number;
    /** V28.0.ST4 iter 3 — total markers across all scenes (incl. CTA). */
    totalMarkers: number;
    perScene: Array<{
      sceneOrder: number;
      sceneGoal: string;
      excluded: boolean;
      markerCount: number;
      uniqueMarkers: string[];
    }>;
  }>;
}

export function measureCasualMarkers(
  scripts: ExpandedScriptShape[],
): CasualMarkersResult {
  const perScript: CasualMarkersResult['perScript'] = [];
  let scenesCounted = 0;
  let scenesWithZero = 0;
  let totalMarkers = 0;
  let stackedSceneCount = 0;

  for (const script of scripts) {
    let scriptMarkers = 0;
    let scriptTotalMarkers = 0; // includes CTA scenes
    let scriptCounted = 0;
    let scriptExcluded = 0;
    const perScene: CasualMarkersResult['perScript'][number]['perScene'] = [];
    for (const scene of script.scenes ?? []) {
      const excluded = scene.scene_goal === 'decision_push';
      const counted = countMarkersInHebrew(scene.spoken_text_hebrew ?? '');
      if (counted.total > 1) stackedSceneCount++;
      perScene.push({
        sceneOrder: scene.scene_order,
        sceneGoal: scene.scene_goal,
        excluded,
        markerCount: counted.total,
        uniqueMarkers: counted.unique,
      });
      scriptTotalMarkers += counted.total;
      if (excluded) {
        scriptExcluded++;
        continue;
      }
      scriptCounted++;
      scriptMarkers += counted.total;
      scenesCounted++;
      totalMarkers += counted.total;
      if (counted.total === 0) scenesWithZero++;
    }
    perScript.push({
      framework: script.framework,
      sceneCount: script.scenes?.length ?? 0,
      excludedCount: scriptExcluded,
      avgPerScene: scriptCounted > 0 ? scriptMarkers / scriptCounted : 0,
      totalMarkers: scriptTotalMarkers,
      perScene,
    });
  }

  const perScriptTotals = perScript.map((s) => s.totalMarkers);
  const avgMarkersPerScript =
    perScriptTotals.length > 0
      ? perScriptTotals.reduce((a, b) => a + b, 0) / perScriptTotals.length
      : 0;

  return {
    avgMarkersPerScene: scenesCounted > 0 ? totalMarkers / scenesCounted : 0,
    scenesCounted,
    scenesWithZero,
    avgMarkersPerScript,
    perScriptTotals,
    stackedSceneCount,
    perScript,
  };
}
