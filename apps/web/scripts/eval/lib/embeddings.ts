// OpenAI text-embedding-3-small wrapper + cosine similarity helpers
// for the big_idea_diversity metric.
//
// Cost: ~$0.02 / MTok input. A typical run encodes 6 concepts × 9
// products × ~30 tokens each = ~1.6K tokens = $0.00003. Negligible
// next to the LLM judge cost — kept here for completeness.

import OpenAI from 'openai';

const EMBED_MODEL = process.env.EVAL_EMBEDDING_MODEL ?? 'text-embedding-3-small';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY missing — required for embeddings (big_idea_diversity metric)',
    );
  }
  _client = new OpenAI({ apiKey: key });
  return _client;
}

/** Embed a batch of strings in one API call. Returns one vector per input. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  });
  // Sort by index to be defensive — OpenAI returns sorted today, but the
  // contract doesn't guarantee it forever.
  return res.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

/** Cosine similarity between two equal-length vectors. Defensive: returns
 *  0 if either vector is all-zero (degenerate, shouldn't happen for valid
 *  embeddings but easier to debug than NaN). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Pairwise cosine similarity matrix for a list of vectors. Diagonal is 1. */
export function pairwiseCosine(vectors: number[][]): number[][] {
  const n = vectors.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) row.push(1);
      else if (j < i) row.push(out[j]?.[i] ?? 0); // symmetric
      else row.push(cosineSimilarity(vectors[i] ?? [], vectors[j] ?? []));
    }
    out.push(row);
  }
  return out;
}

/** Mean of off-diagonal entries in a square matrix. Used to compute
 *  diversity = 1 - meanOffDiagonal. Higher result = more diverse. */
export function meanOffDiagonal(m: number[][]): number {
  const n = m.length;
  if (n < 2) return 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        sum += m[i]?.[j] ?? 0;
        count++;
      }
    }
  }
  return sum / count;
}
