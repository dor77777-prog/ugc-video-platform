// big_idea_diversity — embeds the 6 concept big_idea strings, computes
// pairwise cosine similarity, returns 1 - mean(off-diagonal).
//
// Range: 0..1 (higher = more diverse).
// Target post-Sub-task-3: baseline + 0.15.

import { embedBatch, pairwiseCosine, meanOffDiagonal } from '../lib/embeddings';

export interface BigIdeaDiversityResult {
  /** 1 - mean(off-diagonal cosine similarity). Higher = more diverse. */
  score: number;
  /** Mean off-diagonal similarity (debugging signal — diversity = 1 - this). */
  meanSimilarity: number;
  /** Per-pair similarity (i,j) for forensics when score is bad. */
  pairwise: number[][];
}

/** Measures pairwise diversity across N strings. For concept_interactive
 *  these are the 6 RawConceptCard.big_idea values. For legacy_full_batch
 *  these are the 6 GeneratedScript.creative_strategy.core_insight values
 *  (the closest legacy analog to a "big idea"). */
export async function measureBigIdeaDiversity(
  texts: string[],
): Promise<BigIdeaDiversityResult> {
  if (texts.length < 2) {
    return { score: 0, meanSimilarity: 1, pairwise: [] };
  }
  const vectors = await embedBatch(texts);
  const matrix = pairwiseCosine(vectors);
  const meanSim = meanOffDiagonal(matrix);
  return {
    score: 1 - meanSim,
    meanSimilarity: meanSim,
    pairwise: matrix,
  };
}
