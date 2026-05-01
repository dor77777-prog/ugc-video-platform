// V25 / V26.2 — Google Gemini client for structured generation.
//
// Used by `apps/web/lib/llm/scripts.ts` to drive the 6-framework Hebrew
// script batch through Gemini 3. Built on the **new** `@google/genai`
// SDK (the legacy `@google/generative-ai` package was removed in V26.2
// — it doesn't know about Gemini 3 fields like `thinkingConfig` and the
// docs explicitly call out this rename).
//
// The flow:
//   1. Caller passes a JSON Schema (the same OpenAI-style schemas that
//      lib/llm/scripts.ts already maintains).
//   2. We deep-copy and strip `additionalProperties` (Gemini's
//      validator rejects it, even though it's part of standard JSON
//      Schema) — see stripIncompatibleKeywords().
//   3. We hand the schema to the SDK via the modern `responseJsonSchema`
//      field (preferred over `responseSchema` per the SDK release
//      notes — accepts any JSON Schema, not just SchemaUnion).
//   4. For Gemini 3 models we pin `thinkingConfig.thinkingLevel: 'low'`
//      by default. Gemini 3's default `'high'` burns 100+ thought
//      tokens even on trivial replies and routinely overran our 60s
//      Server Action ceiling on 6 parallel calls. Hebrew creative
//      scriptwriting doesn't need deep multi-step reasoning.
//   5. We DO NOT pass `temperature`. Gemini 3 docs explicitly warn that
//      values below 1.0 cause looping / degraded reasoning.
//
// Reference: gemini-api-docs.md (sections "Gemini 3 Guide" + "Structured
// Output" + "OpenAI Compatibility / thinking"). When debugging a 6-batch
// failure check the docs for the latest model IDs and `thinkingLevel`
// support matrix per model.

import { GoogleGenAI, ThinkingLevel } from '@google/genai';

// The SDK's ThinkingLevel enum uses UPPERCASE values (MINIMAL / LOW /
// MEDIUM / HIGH); the docs show callers passing lowercase strings.
// Both the wire format and the SDK accept the enum, so we map our
// public lowercase API to the enum at the call site.
const THINKING_LEVEL_MAP: Record<
  'minimal' | 'low' | 'medium' | 'high',
  ThinkingLevel
> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

// V26.3 — default to Flash, not Pro. Google's docs explicitly position
// gemini-3-flash-preview as "Pro-level intelligence at the speed and
// pricing of Flash" — 4× cheaper input ($0.50/M vs $2/M) and 4× cheaper
// output ($3/M vs $12/M). Critically, Flash also supports
// `thinkingLevel: 'minimal'` (Pro does not), so on the script-gen path
// we use minimal thinking → near-zero thoughts tokens → another big
// cost drop. A V26.2 6-batch on Pro at low thinking cost ~$0.70;
// the same batch on Flash at minimal thinking costs ~$0.05-0.10.
//
// Override via GEMINI_SCRIPT_MODEL env:
//   - `gemini-3-flash-preview`        — DEFAULT, 4× cheaper than Pro
//   - `gemini-3.1-flash-lite-preview` — 8× cheaper, may sacrifice
//                                       Hebrew creative quality
//   - `gemini-3-pro-preview`          — when reasoning depth matters
//   - `gemini-3.1-pro-preview`        — current canonical Pro alias
const DEFAULT_MODEL = 'gemini-3-flash-preview';

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

let cachedClient: GoogleGenAI | null = null;
function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not set. Add it to .env / Vercel / Railway env vars to enable script generation.',
    );
  }
  if (cachedClient === null) cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/** Recursively strip JSON-Schema keywords that Gemini rejects. Returns
 *  a deep-copied schema safe to pass to config.responseJsonSchema.
 *  `additionalProperties: false` is part of standard JSON Schema but
 *  Gemini's validator rejects it — and we use it on every OpenAI-shape
 *  schema we already have. Stripping it is the cheapest fix. */
export function stripIncompatibleKeywords(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => stripIncompatibleKeywords(item));
  }
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === 'additionalProperties') continue;
      out[key] = stripIncompatibleKeywords(value);
    }
    return out;
  }
  return schema;
}

export interface GeminiUsage {
  /** Resolved model id (e.g. 'gemini-3-pro-preview'). */
  model: string;
  /** Tokens billed as input (system + user prompt + cached content). */
  inputTokens: number;
  /** Tokens billed as output. Includes thoughts — Google's published
   *  Pro pricing line item is "Output (incl. thinking)". We sum
   *  candidatesTokenCount + thoughtsTokenCount so cost attribution
   *  matches the actual bill. */
  outputTokens: number;
  /** Raw thoughts-only count, for telemetry. */
  thoughtsTokens: number;
}

export interface GeminiStructuredCallOptions {
  /** System instruction (equivalent to OpenAI's `role: 'system'`). */
  systemInstruction?: string;
  /** User prompt text. */
  userPrompt: string;
  /** Strict JSON schema describing the shape Gemini should return.
   *  `additionalProperties` is stripped automatically before send. */
  responseSchema: unknown;
  /** Override the default model. Default is GEMINI_SCRIPT_MODEL env or
   *  DEFAULT_MODEL. */
  model?: string;
  /** Optional temperature override. **Do not pass this for Gemini 3
   *  models** — Google explicitly recommends keeping it at the default
   *  (1.0); setting it lower causes looping / degraded performance on
   *  reasoning tasks. Left optional for callers that target older
   *  Gemini families (1.5 / 2.0 / 2.5) where 0.7 is still safe. */
  temperature?: number;
  /** Optional `thinkingConfig.thinkingLevel` for Gemini 3 models.
   *  When the resolved model id starts with `gemini-3` and this is
   *  unset, we default to `'low'` to bound thinking-token burn (the
   *  model's own default `'high'` is dynamic and routinely overruns
   *  our 60s Server Action ceiling on a 6-parallel batch). Pass
   *  `'medium'` or `'high'` for tasks that genuinely need deeper
   *  reasoning. Pass `'minimal'` only on Flash / Flash-Lite — Pro
   *  doesn't support it and rejects with 400. */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
}

export interface GeminiStructuredCallResult<T> {
  parsed: T;
  raw: string;
  usage: GeminiUsage;
}

/** Run a single structured-output call against Gemini. Throws on
 *  config error / network failure / JSON parse failure. The caller
 *  is expected to wrap in try/catch and decide whether to retry. */
export async function geminiStructuredCall<T>({
  systemInstruction,
  userPrompt,
  responseSchema,
  model: modelId = DEFAULT_MODEL,
  temperature,
  thinkingLevel,
}: GeminiStructuredCallOptions): Promise<GeminiStructuredCallResult<T>> {
  const sanitized = stripIncompatibleKeywords(responseSchema);
  const isGemini3 = modelId.startsWith('gemini-3');
  // V26.6 — default thinking level is now `low` for ALL Gemini 3
  // models. V26.3 had Flash on `minimal` which cut thoughts tokens
  // to near-zero (great for cost) but observably degraded the quality
  // of strategic enum choices in the structured-output schema —
  // cameraFocus / sceneGenerationType / israeli_setting_cue / etc.
  // would lean toward generic defaults. The downstream image-brief
  // builder is deterministic and reads those fields, so weaker
  // metadata directly produced weaker scene images. Bumping to `low`
  // adds ~200-400 thoughts tokens per call (~12× cost vs minimal,
  // but still ~10× cheaper than Pro:high). Override per-call via the
  // `thinkingLevel` option when a caller actually doesn't need
  // strategic reasoning.
  const effectiveThinkingLevel =
    thinkingLevel ?? (isGemini3 ? 'low' : undefined);

  const response = await client().models.generateContent({
    model: modelId,
    contents: userPrompt,
    config: {
      ...(systemInstruction ? { systemInstruction } : {}),
      responseMimeType: 'application/json',
      // The new SDK's `responseJsonSchema` field accepts arbitrary JSON
      // Schema (including the OpenAI-flavored ones we emit). Strict typing
      // would require porting every schema to the SDK's `Schema` type;
      // instead we cast through `unknown` — the wire format is identical.
      responseJsonSchema: sanitized,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(effectiveThinkingLevel !== undefined
        ? {
            thinkingConfig: {
              thinkingLevel: THINKING_LEVEL_MAP[effectiveThinkingLevel],
            },
          }
        : {}),
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned empty response.');
  }

  let parsed: T;
  try {
    parsed = JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `Gemini returned malformed JSON: ${(err as Error).message}. First 200 chars: ${text.slice(0, 200)}`,
    );
  }

  const usageMetadata = response.usageMetadata;
  const candidates = usageMetadata?.candidatesTokenCount ?? 0;
  const thoughts = usageMetadata?.thoughtsTokenCount ?? 0;
  return {
    parsed,
    raw: text,
    usage: {
      model: modelId,
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      // Pro pricing is "Output (incl. thinking)" — sum both so the
      // cost ledger matches the bill.
      outputTokens: candidates + thoughts,
      thoughtsTokens: thoughts,
    },
  };
}

export const GEMINI_DEFAULT_MODEL = DEFAULT_MODEL;
