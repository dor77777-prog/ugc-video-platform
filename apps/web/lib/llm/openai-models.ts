// OpenAI model-family helpers. Centralized so every vision/text
// callsite (face-gate, motion-analysis, product-visual-analysis,
// script-gen) decides identically whether to send reasoning-model
// params like `reasoning.effort` and `text.verbosity`.
//
// V27.10.20 — added because face-gate was sending `reasoning.effort:
// 'low'` to whatever model OPENAI_FACE_GATE_MODEL pointed at. With
// the env override `gpt-4o-mini` set in prod, every call returned
// HTTP 400 and lipsync got silently skipped. The Responses API only
// accepts `reasoning` on gpt-5.* and the o-series; gpt-4o family
// rejects it.

/**
 * Returns true when the model accepts the Responses-API
 * `reasoning.effort` and `text.verbosity` parameters.
 *
 * gpt-5.x family + o-series (o1, o3) are reasoning models that
 * accept these params. gpt-4o family does not. Anything unknown is
 * treated as non-reasoning to fail safe.
 */
export function isOpenAiReasoningModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  if (m.startsWith('gpt-5')) return true;
  if (/^o[13](-|$)/.test(m)) return true;
  return false;
}
