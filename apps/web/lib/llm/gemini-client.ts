// V25 — Google Gemini client for structured generation.
//
// Used by `apps/web/lib/llm/scripts.ts` to replace the OpenAI script
// engine with Gemini 3 Pro. Uses the official @google/generative-ai
// SDK with `responseMimeType: "application/json"` + `responseSchema`
// for type-safe structured output.
//
// The existing OpenAI JSON schemas use `additionalProperties: false`
// which Gemini's responseSchema validator rejects on some accounts;
// `stripIncompatibleKeywords()` deep-copies the schema and removes
// the keyword while leaving everything else (type, properties,
// required, enum, items, description) intact.

import { GoogleGenerativeAI, type Schema } from '@google/generative-ai';

// V26.1 — Gemini 3 family models all end with `-preview` (verified via
// `GET /v1beta/models`). The `gemini-3-pro` short alias does NOT resolve;
// using it 404s with "model not found" which is what was crashing the
// 6-script batch. Default to the canonical preview ID. Override via
// GEMINI_SCRIPT_MODEL env (e.g. `gemini-3.1-pro-preview` for the latest,
// or `gemini-3-flash-preview` for a 4× cheaper Flash run).
const DEFAULT_MODEL = 'gemini-3-pro-preview';

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigError';
  }
}

let cachedClient: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError(
      'GEMINI_API_KEY is not set. Add it to .env / Vercel / Railway env vars to enable script generation.',
    );
  }
  if (cachedClient === null) cachedClient = new GoogleGenerativeAI(apiKey);
  return cachedClient;
}

/** Recursively strip OpenAI-specific JSON-Schema keywords that Gemini
 *  rejects. Returns a deep-copied schema safe to pass to
 *  generationConfig.responseSchema. */
export function stripIncompatibleKeywords(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => stripIncompatibleKeywords(item));
  }
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      // Strip the keys Gemini doesn't support.
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
  /** Tokens billed as input (system + user prompt). */
  inputTokens: number;
  /** Tokens billed as output. */
  outputTokens: number;
}

export interface GeminiStructuredCallOptions {
  /** System instruction (prepended above the user prompt — equivalent
   *  to OpenAI's `role: 'system'`). */
  systemInstruction?: string;
  /** User prompt text. */
  userPrompt: string;
  /** Strict JSON schema describing the shape Gemini should return.
   *  `additionalProperties` is stripped automatically before send. */
  responseSchema: unknown;
  /** Override the default model. */
  model?: string;
  /** Optional temperature override. **Do not pass this for Gemini 3
   *  models** — Google explicitly recommends keeping it at the default
   *  (1.0); setting it lower causes looping / degraded performance on
   *  reasoning tasks. Left optional for callers that target older
   *  Gemini families (1.5, 2.0, 2.5) where 0.7 is still safe. */
  temperature?: number;
  /** Optional `thinkingConfig.thinkingLevel` for Gemini 3 models.
   *  Default `'high'` burns the most thought tokens (104+ even on a
   *  trivial reply) and frequently exceeds our 60s Server Action
   *  ceiling on a 6-parallel script batch. We default to `'low'`
   *  for the script-gen path — Hebrew creative writing doesn't need
   *  deep multi-step reasoning, and the latency / cost savings are
   *  significant. Pass `'medium'` or `'high'` for tasks that benefit. */
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
  const sanitized = stripIncompatibleKeywords(responseSchema) as Schema;
  // V26.1 — Gemini 3 introduced `thinkingConfig.thinkingLevel`. The
  // @google/generative-ai v0.24 type doesn't list it (predates Gemini 3),
  // but the request body is JSON-serialized to the REST API, so unknown
  // keys pass through. We cast through `unknown` to attach it.
  const isGemini3 = modelId.startsWith('gemini-3');
  const effectiveThinkingLevel =
    thinkingLevel ?? (isGemini3 ? 'low' : undefined);
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    responseSchema: sanitized,
    ...(temperature !== undefined ? { temperature } : {}),
    ...(effectiveThinkingLevel !== undefined
      ? { thinkingConfig: { thinkingLevel: effectiveThinkingLevel } }
      : {}),
  };
  // The SDK's TypeScript model strips unknown keys at the type layer
  // but serializes the object as-is over the wire — eslint-disable the
  // cast to `unknown as` so future Gemini-3-only fields can ride along
  // without bumping the SDK version.
  const generativeModel = client().getGenerativeModel({
    model: modelId,
    systemInstruction,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    generationConfig: generationConfig as any,
  });
  const result = await generativeModel.generateContent(userPrompt);
  const response = result.response;
  const text = response.text();
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

  // Token accounting from the SDK's usageMetadata. promptTokenCount
  // counts the system + user input; candidatesTokenCount is output.
  const usageMetadata = response.usageMetadata;
  return {
    parsed,
    raw: text,
    usage: {
      model: modelId,
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
    },
  };
}

export const GEMINI_DEFAULT_MODEL = DEFAULT_MODEL;
