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
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });
  messages.push({ role: 'user', content: userPrompt });

  const response = await client().chat.completions.create({
    model: modelId,
    messages,
    temperature,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'script_payload',
        schema: schemaForCall,
        strict: true,
      },
    },
  });

  const content = response.choices[0]?.message?.content;
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

  return {
    parsed,
    raw: content,
    usage: {
      model: modelId,
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      thoughtsTokens: 0,
    },
  };
}

export const OPENAI_DEFAULT_SCRIPT_MODEL = DEFAULT_MODEL;
