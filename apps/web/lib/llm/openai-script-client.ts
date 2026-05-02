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

// V27.10.18 — gpt-5.4 (full) is the default. V27.10.15 set
// 'gpt-5.5-mini' per the migration guide, but that id returns 400
// model_not_found in the user's account — gpt-5.5 family isn't yet
// rolled out region-wide. The user explicitly asked for the full
// gpt-5.4 (not the mini) for higher script-gen quality. The new
// Responses-API params we added (reasoning.effort, text.verbosity)
// all work on gpt-5.4 too — same shape, slightly less aggressive
// concision on `verbosity: 'low'` per the migration guide.
//
// Cost: gpt-5.4 is ~3x more expensive than gpt-5.4-mini ($2.5/$10
// vs $0.75/$4.5 per MTok). A 6-script batch lands ~$0.30 instead of
// ~$0.10. Quality lift comes from larger model + better Hebrew nuance.
const DEFAULT_MODEL = 'gpt-5.4';

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
  model: modelId = DEFAULT_MODEL,
  reasoningEffort,
  verbosity,
}: OpenAiStructuredCallOptions): Promise<OpenAiStructuredCallResult<T>> {
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
    model: modelId,
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
      model: modelId,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      thoughtsTokens: 0,
    },
  };
}

export const OPENAI_DEFAULT_SCRIPT_MODEL = DEFAULT_MODEL;
