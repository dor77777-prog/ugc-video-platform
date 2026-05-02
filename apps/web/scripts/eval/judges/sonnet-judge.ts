// Thin Anthropic structured-output wrapper for the eval's LLM judge.
// Used by:
//   - framework_signal_match metric (closed-set classification)
//   - register_authenticity_score metric (1-10 rating with anchors)
//
// We use Sonnet 4.6 here even though scripts.ts currently defaults to
// OpenAI gpt-5.4-mini for SCRIPT GENERATION. The judge is a separate
// concern: we want a strong, consistent rater that doesn't share a
// distribution with the model under test (avoids "model rates its own
// output favorably" bias).
//
// Override via EVAL_JUDGE_MODEL env var if you want to A/B the judge.

import {
  anthropicStructuredCall,
  AnthropicConfigError,
} from '../../../lib/llm/anthropic-script-client';

const DEFAULT_JUDGE_MODEL =
  process.env.EVAL_JUDGE_MODEL?.trim() || 'claude-sonnet-4-6';

export interface JudgeCallOptions {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: unknown;
  /** Override per-call. Defaults to EVAL_JUDGE_MODEL or claude-sonnet-4-6. */
  model?: string;
}

export interface JudgeCallResult<T> {
  parsed: T;
  raw: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export async function judgeCall<T>(
  options: JudgeCallOptions,
): Promise<JudgeCallResult<T>> {
  const model = options.model ?? DEFAULT_JUDGE_MODEL;
  try {
    const r = await anthropicStructuredCall<T>({
      systemInstruction: options.systemInstruction,
      userPrompt: options.userPrompt,
      responseSchema: options.responseSchema,
      model,
      // Judge calls are short — no need for the 6500-token cap.
      maxTokens: 1500,
      // Low effort is fine for classification + rating; saves cost.
      effort: 'low',
    });
    return {
      parsed: r.parsed,
      raw: r.raw,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      model: r.usage.model,
    };
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      throw new Error(
        `Eval judge unavailable — Anthropic config error: ${err.message}. ` +
          'The eval requires ANTHROPIC_API_KEY for the framework_signal and ' +
          'register_authenticity metrics. Set the env var or override with ' +
          'EVAL_JUDGE_MODEL pointing at a different provider.',
      );
    }
    throw err;
  }
}
