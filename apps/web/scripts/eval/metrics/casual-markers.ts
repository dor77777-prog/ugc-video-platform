// casual_markers_per_scene — counts canonical Hebrew "spoken Israeli"
// markers per scene's spoken_text_hebrew, averaged across all scenes
// from all expanded scripts.
//
// CTA-style closing scenes (scene_goal === 'decision_push') are
// EXCLUDED from the average — those are short call-to-action beats
// where casual markers would feel out of place.
//
// Target post-Sub-task-4: avg >= 1.0 (every non-CTA scene contains at
// least one marker on average).

import { countMarkersInHebrew } from '../lib/canonical-markers';
import type { ExpandedScriptShape } from '../runners/expand-runner';

export interface CasualMarkersResult {
  avgMarkersPerScene: number;
  scenesCounted: number;
  scenesWithZero: number;
  perScript: Array<{
    framework: string;
    sceneCount: number;
    excludedCount: number;
    avgPerScene: number;
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

  for (const script of scripts) {
    let scriptMarkers = 0;
    let scriptCounted = 0;
    let scriptExcluded = 0;
    const perScene: CasualMarkersResult['perScript'][number]['perScene'] = [];
    for (const scene of script.scenes ?? []) {
      const excluded = scene.scene_goal === 'decision_push';
      const counted = countMarkersInHebrew(scene.spoken_text_hebrew ?? '');
      perScene.push({
        sceneOrder: scene.scene_order,
        sceneGoal: scene.scene_goal,
        excluded,
        markerCount: counted.total,
        uniqueMarkers: counted.unique,
      });
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
      perScene,
    });
  }

  return {
    avgMarkersPerScene: scenesCounted > 0 ? totalMarkers / scenesCounted : 0,
    scenesCounted,
    scenesWithZero,
    perScript,
  };
}
