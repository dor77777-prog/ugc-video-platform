// V26.8 — OpenAI structured-output wrapper for the script-gen path.
//
// V25 swapped script generation OpenAI → Gemini for cost reasons. Live
// use revealed three problems with Gemini in this specific role:
//   1. Pro at thinkingLevel:low consistently runs at ~$0.30-0.70/batch,
//      which the operator flagged as too expensive.
//   2. Pro at low takes ~60-90s wall-clock for the 6-batch (lots of
//      hidden thoughts tokens; observed 111K output tokens for one run).
//   3. Both Pro:low and Flash:low produced shallower English visual
//      specs in `visualPromptEnglish` than the pre-V25 gpt-5.4-mini
//      baseline, which propagated into weaker downstream image briefs.
//
// V26.8 puts OpenAI back as the DEFAULT script-gen path. Gemini is
// kept behind `LLM_SCRIPT_PROVIDER=gemini` so we can experiment with
// Gemini 4 / a smarter prompt template without re-pulling the dep.
//
// This file mirrors gemini-client.ts exactly so scripts.ts can branch
// on a single env var without other code changes.

import OpenAI from 'openai';
import { withRetry } from '@/lib/utils/retry';

// gpt-5.4-mini is the model the V14 script path was built around.
// Tunable via OPENAI_SCRIPT_MODEL env (e.g. flip to gpt-5.4 for higher
// quality at higher cost; or to gpt-4o-mini for back-compat).
const DEFAULT_MODEL = 'gpt-5.4-mini';

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
  /** OpenAI default 1.0; we used 0.7 in the V14 path for slightly more
   *  determinism in the structured output. Not load-bearing. */
  temperature?: number;
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
  temperature = 0.7,
}: OpenAiStructuredCallOptions): Promise<OpenAiStructuredCallResult<T>> {
  const schemaForCall = passThrough(responseSchema) as Record<string, unknown>;

  // V26.9 — moved from Chat Completions to the Responses API per
  // OpenAI's official migration guide. Two concrete benefits for our
  // use case:
  //   1. 40-80% better cache utilization on repeated identical prompt
  //      prefixes. We fire 6 parallel calls all sharing the same
  //      SCRIPT_SYSTEM_PROMPT — exactly the workload the Responses
  //      API caches well. Real cost cut on the input-token side.
  //   2. Cleaner shape: `instructions` for the system prompt at the
  //      top level, `input` as a plain string, structured output via
  //      `text.format` (not `response_format`). Output text is read
  //      via the SDK's `output_text` helper.
  // V26.11 — transparent single retry on transient (network / 5xx)
  // failures inside the first 15s. No retry on schema/quota/4xx.
  const response = await withRetry(
    () =>
      client().responses.create({
        model: modelId,
        instructions: systemInstruction,
        input: userPrompt,
        temperature,
        text: {
          format: {
            type: 'json_schema',
            name: 'script_payload',
            schema: schemaForCall,
            strict: true,
          },
        },
      }),
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
