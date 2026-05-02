// Eval LLM judge — defaults to Anthropic Sonnet, auto-falls-back to
// OpenAI when ANTHROPIC_API_KEY isn't configured.
//
// Why Sonnet by default: cross-provider bias hygiene. The script under
// test uses gpt-5.4-mini (OpenAI default); a Sonnet judge keeps the
// rater outside that distribution.
//
// Why fall back to OpenAI: ANTHROPIC_API_KEY is opt-in in this stack
// (behind LLM_SCRIPT_PROVIDER=anthropic). The eval should still work
// when only OPENAI_API_KEY is configured. The fallback is announced
// loudly at the first judge call so it's visible in baseline runs.
//
// Override: EVAL_JUDGE_PROVIDER=openai|anthropic to force, or
// EVAL_JUDGE_MODEL to pick a specific model id.

import {
  anthropicStructuredCall,
  AnthropicConfigError,
} from '../../../lib/llm/anthropic-script-client';
import {
  openaiStructuredCall,
  OpenAiConfigError,
} from '../../../lib/llm/openai-script-client';

type JudgeProvider = 'anthropic' | 'openai';

const DEFAULT_ANTHROPIC_MODEL =
  process.env.EVAL_JUDGE_MODEL?.trim() || 'claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL =
  process.env.EVAL_JUDGE_MODEL?.trim() || 'gpt-5.4-mini';

let _resolvedProvider: JudgeProvider | null = null;

function resolveProvider(): JudgeProvider {
  if (_resolvedProvider) return _resolvedProvider;
  const forced = process.env.EVAL_JUDGE_PROVIDER?.toLowerCase().trim();
  if (forced === 'openai') {
    _resolvedProvider = 'openai';
    console.log('[eval-judge] EVAL_JUDGE_PROVIDER=openai forced.');
    return 'openai';
  }
  if (forced === 'anthropic') {
    _resolvedProvider = 'anthropic';
    return 'anthropic';
  }
  // Auto-detect: prefer Anthropic for cross-provider bias hygiene,
  // fall back to OpenAI when the key isn't present. Without this the
  // judge silently fails every call and metrics return 0 — the bug
  // that broke the first baseline run before this fix.
  const anthropicRaw = process.env.ANTHROPIC_API_KEY?.trim().replace(
    /^"+|"+$/g,
    '',
  );
  if (
    anthropicRaw &&
    anthropicRaw.length >= 20 &&
    anthropicRaw.startsWith('sk-ant-')
  ) {
    _resolvedProvider = 'anthropic';
    return 'anthropic';
  }
  _resolvedProvider = 'openai';
  console.warn(
    '[eval-judge] ANTHROPIC_API_KEY not configured — falling back to OpenAI ' +
      `(${DEFAULT_OPENAI_MODEL}) as the judge. Cross-provider bias hygiene is ` +
      'reduced. Set ANTHROPIC_API_KEY in .env or export EVAL_JUDGE_PROVIDER=openai ' +
      'to silence this warning.',
  );
  return 'openai';
}

export interface JudgeCallOptions {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: unknown;
  /** Override per-call. Defaults to the resolved provider's default model. */
  model?: string;
}

export interface JudgeCallResult<T> {
  parsed: T;
  raw: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: JudgeProvider;
}

export async function judgeCall<T>(
  options: JudgeCallOptions,
): Promise<JudgeCallResult<T>> {
  const provider = resolveProvider();
  if (provider === 'anthropic') {
    const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;
    try {
      const r = await anthropicStructuredCall<T>({
        systemInstruction: options.systemInstruction,
        userPrompt: options.userPrompt,
        responseSchema: options.responseSchema,
        model,
        maxTokens: 1500,
        effort: 'low',
      });
      return {
        parsed: r.parsed,
        raw: r.raw,
        inputTokens: r.usage.inputTokens,
        outputTokens: r.usage.outputTokens,
        model: r.usage.model,
        provider: 'anthropic',
      };
    } catch (err) {
      if (err instanceof AnthropicConfigError) {
        throw new Error(
          `Eval judge: Anthropic config error: ${err.message}. ` +
            'Set ANTHROPIC_API_KEY in .env or export EVAL_JUDGE_PROVIDER=openai.',
        );
      }
      throw err;
    }
  }

  // OpenAI path
  const model = options.model ?? DEFAULT_OPENAI_MODEL;
  try {
    const r = await openaiStructuredCall<T>({
      systemInstruction: options.systemInstruction,
      userPrompt: options.userPrompt,
      responseSchema: options.responseSchema,
      model,
      reasoningEffort: 'low',
      verbosity: 'low',
    });
    return {
      parsed: r.parsed,
      raw: r.raw,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      model: r.usage.model,
      provider: 'openai',
    };
  } catch (err) {
    if (err instanceof OpenAiConfigError) {
      throw new Error(
        `Eval judge: OpenAI config error: ${err.message}. ` +
          'Set OPENAI_API_KEY in .env.',
      );
    }
    throw err;
  }
}

/** One-shot health check the orchestrator runs at startup. Costs ~$0.001
 *  on either provider. If this fails, the orchestrator aborts BEFORE
 *  burning the full baseline cost on script gen. */
export async function judgeHealthCheck(): Promise<{
  provider: JudgeProvider;
  model: string;
  ok: boolean;
  error: string | null;
}> {
  const provider = resolveProvider();
  const model =
    provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL;
  const PING_SCHEMA = {
    type: 'object',
    required: ['ok'],
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean', description: 'Always return true.' },
    },
  } as const;
  try {
    const r = await judgeCall<{ ok: boolean }>({
      systemInstruction: 'You are an integration test. Return { "ok": true }.',
      userPrompt: 'ping',
      responseSchema: PING_SCHEMA,
    });
    return { provider, model, ok: r.parsed.ok === true, error: null };
  } catch (err) {
    return { provider, model, ok: false, error: (err as Error).message };
  }
}
