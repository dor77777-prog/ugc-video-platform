// V27.10.15 — migrated to gpt-5.5-mini per the official OpenAI
// migration guide for GPT-5.5. The shape is the same Responses API
// (V26.9) — the only changes are:
//   - DEFAULT_MODEL flipped 'gpt-5.4-mini' → 'gpt-5.5-mini'
//   - Added reasoning.effort: 'low'   (env: OPENAI_REASONING_EFFORT)
//   - Added text.verbosity:   'low'   (env: OPENAI_VERBOSITY)
//   - Dropped explicit temperature (reasoning models don't honor it
//     the way completion models did; the guide recommends omitting it)
//
// Why low/low for our workload:
//   - The script-gen task is heavy instruction-following on a fully
//     specified system prompt (Hebrew QA gates, FEATURE FOCUS, schema).
//     Per the guide, this benefits from `effort: 'low'` — the model
//     spends fewer reasoning tokens since the path is largely scripted.
//   - text.verbosity 'low' yields proportionally tighter JSON output
//     than verbosity 'medium' on gpt-5.5 — ~30% fewer output tokens
//     for the same content. Direct latency win.
//
// Override knobs (no redeploy needed):
//   OPENAI_SCRIPT_MODEL=gpt-5.5             (full, more reasoning headroom)
//   OPENAI_SCRIPT_MODEL=gpt-5.4-mini        (V26.8 path, kept as fallback)
//   OPENAI_REASONING_EFFORT=medium|high|xhigh
//   OPENAI_VERBOSITY=medium|high
//
// V26.8 puts OpenAI back as the DEFAULT script-gen path. Gemini and
// Anthropic kept behind LLM_SCRIPT_PROVIDER for experimentation.

import OpenAI from 'openai';
import { withRetry } from '@/lib/utils/retry';

// V27.11.PR2 — DEFAULT flipped back to gpt-5.4-mini.
//
// V27.10.18 had set this to full `gpt-5.4` for "higher script-gen
// quality". The diagnose audit (.planning/debug/v27-script-quality-
// audit.md) showed that even with the full model, scripts came back
// poor — the bottleneck is prompt entropy + schema bloat + uncached
// Product Intelligence injection, NOT model size. Flipping to mini
// is bottleneck #4 from the audit ("highest-EV after #1+#2+#3 land").
//
// Cost: $0.75 / $4.5 per MTok (mini) vs $2.5 / $10 (full). A 6-script
// batch drops from ~$0.30 to ~$0.10 — ~3x cheaper.
// Latency: mini is faster on long Hebrew JSON (smaller decode cost).
//
// Override (no redeploy):
//   OPENAI_SCRIPT_MODEL=gpt-5.4               (full — when quality A/B is wanted)
//   OPENAI_SCRIPT_MODEL=gpt-5.5-mini          (when rolled out region-wide)
//   OPENAI_REASONING_EFFORT=medium|high|xhigh
//   OPENAI_VERBOSITY=medium|high
//
// SCRIPT_QUALITY_MODE=balanced (default mini) | premium (full gpt-5.4)
// is read first so the operator can flip with one env without knowing
// the model id. OPENAI_SCRIPT_MODEL still wins if both are set.
const DEFAULT_MODEL = 'gpt-5.4-mini';
const PREMIUM_MODEL = 'gpt-5.4';

function resolveDefaultModel(): string {
  // Explicit pin always wins.
  if (process.env.OPENAI_SCRIPT_MODEL?.trim()) return process.env.OPENAI_SCRIPT_MODEL.trim();
  const mode = process.env.SCRIPT_QUALITY_MODE?.trim().toLowerCase();
  if (mode === 'premium') return PREMIUM_MODEL;
  // 'balanced' or unset → mini.
  return DEFAULT_MODEL;
}

type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
type Verbosity = 'low' | 'medium' | 'high';

function resolveReasoningEffort(): ReasoningEffort {
  const raw = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  if (raw === 'none' || raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'xhigh') {
    return raw;
  }
  return 'low';
}

function resolveVerbosity(): Verbosity {
  const raw = process.env.OPENAI_VERBOSITY?.trim().toLowerCase();
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return 'low';
}

export class OpenAiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAiConfigError';
  }
}

let cachedClient: OpenAI | null = null;
function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAiConfigError(
      'OPENAI_API_KEY is not set. Add it to .env / Vercel / Railway env vars to enable script generation.',
    );
  }
  if (cachedClient === null) cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

/** OpenAI's response_format `json_schema` mode rejects schemas that
 *  use features not in their structured-output subset. We don't share
 *  the full Gemini "strip additionalProperties" path because OpenAI
 *  REQUIRES `additionalProperties: false` on every object — strict
 *  is the opposite of Gemini's behavior. Pass through unchanged. */
function passThrough(schema: unknown): unknown {
  return schema;
}

export interface OpenAiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number; // OpenAI doesn't expose this; always 0.
}

export interface OpenAiStructuredCallOptions {
  systemInstruction?: string;
  userPrompt: string;
  responseSchema: unknown;
  model?: string;
  /** V27.10.15 — temperature is no longer load-bearing on gpt-5.5
   *  reasoning models; the OpenAI migration guide recommends omitting
   *  it. Kept as an optional pass-through for back-compat with code
   *  paths still on gpt-5.4-mini. */
  temperature?: number;
  /** V27.10.15 — gpt-5.5 reasoning effort. 'low' is the default and
   *  works well for instruction-following on a heavily-constrained
   *  prompt. Override per call if needed. */
  reasoningEffort?: ReasoningEffort;
  /** V27.10.15 — output verbosity. 'low' yields ~30% fewer output
   *  tokens on gpt-5.5 vs the V26 gpt-5.4-mini baseline at the same
   *  content quality. */
  verbosity?: Verbosity;
}

export interface OpenAiStructuredCallResult<T> {
  parsed: T;
  raw: string;
  usage: OpenAiUsage;
}

export async function openaiStructuredCall<T>({
  systemInstruction,
  userPrompt,
  responseSchema,
  model: modelId,
  reasoningEffort,
  verbosity,
}: OpenAiStructuredCallOptions): Promise<OpenAiStructuredCallResult<T>> {
  // Resolve at call time so SCRIPT_QUALITY_MODE / OPENAI_SCRIPT_MODEL
  // env changes take effect without restarting the worker. Explicit
  // `model` argument always wins.
  const resolvedModel = modelId ?? resolveDefaultModel();
  const schemaForCall = passThrough(responseSchema) as Record<string, unknown>;
  const effort = reasoningEffort ?? resolveReasoningEffort();
  const verb = verbosity ?? resolveVerbosity();
  // V27.10.15 — gpt-5.5-mini is a reasoning model. The Responses API
  // accepts `reasoning.effort` and `text.verbosity`, which the older
  // OpenAI SDK typings may not yet expose. Runtime accepts the params
  // per the official migration guide. We build the request as a typed
  // overlay and then cast to `any` only at the SDK call boundary so
  // TypeScript can still type-check our own composition above.
  // V26.9 / V26.11 — Responses API + cache-friendly prefix + withRetry.
  const requestPayload = {
    model: resolvedModel,
    instructions: systemInstruction,
    input: userPrompt,
    reasoning: { effort: effort },
    text: {
      verbosity: verb,
      format: {
        type: 'json_schema' as const,
        name: 'script_payload',
        schema: schemaForCall,
        strict: true,
      },
    },
  };
  const responsesApi = client().responses as unknown as {
    create: (args: typeof requestPayload) => Promise<{
      output_text: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
  const response = await withRetry(
    () => responsesApi.create(requestPayload),
    { label: 'openai.responses', earlyFailWindowMs: 15_000 },
  );

  const content = response.output_text;
  if (!content) {
    throw new Error('OpenAI returned empty response.');
  }

  let parsed: T;
  try {
    parsed = JSON.parse(content) as T;
  } catch (err) {
    throw new Error(
      `OpenAI returned malformed JSON: ${(err as Error).message}. First 200 chars: ${content.slice(0, 200)}`,
    );
  }

  // Responses API uses input_tokens / output_tokens (not the legacy
  // prompt_tokens / completion_tokens shape from Chat Completions).
  return {
    parsed,
    raw: content,
    usage: {
      model: resolvedModel,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      thoughtsTokens: 0,
    },
  };
}

/** Resolved at import-time so callers can read the live default that
 *  honors `OPENAI_SCRIPT_MODEL` and `SCRIPT_QUALITY_MODE` envs. */
export const OPENAI_DEFAULT_SCRIPT_MODEL = resolveDefaultModel();
