// big_idea_diversity — embeds the 6 concept big_idea strings, computes
// pairwise cosine similarity, returns 1 - mean(off-diagonal).
//
// Range: 0..1 (higher = more diverse).
// Target post-Sub-task-3: baseline + 0.15.

import { embedBatch, pairwiseCosine, meanOffDiagonal } from '../lib/embeddings';
import type { RawConceptCard } from '../../../lib/llm/concept-engine';

export interface BigIdeaDiversityResult {
  /** 1 - mean(off-diagonal cosine similarity). Higher = more diverse. */
  score: number;
  /** Mean off-diagonal similarity (debugging signal — diversity = 1 - this). */
  meanSimilarity: number;
  /** Per-pair similarity (i,j) for forensics when score is bad. */
  pairwise: number[][];
}

export async function measureBigIdeaDiversity(
  cards: RawConceptCard[],
): Promise<BigIdeaDiversityResult> {
  if (cards.length < 2) {
    return { score: 0, meanSimilarity: 1, pairwise: [] };
  }
  const texts = cards.map((c) => c.big_idea);
  const vectors = await embedBatch(texts);
  const matrix = pairwiseCosine(vectors);
  const meanSim = meanOffDiagonal(matrix);
  return {
    score: 1 - meanSim,
    meanSimilarity: meanSim,
    pairwise: matrix,
  };
}
