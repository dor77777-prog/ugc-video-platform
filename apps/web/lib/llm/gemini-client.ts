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

const DEFAULT_MODEL = 'gemini-3-pro';

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
  /** Resolved model id (e.g. 'gemini-3-pro'). */
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
  /** Optional temperature (default 0.7 to match the prior OpenAI
   *  behavior; lower for deterministic generations). */
  temperature?: number;
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
}: GeminiStructuredCallOptions): Promise<GeminiStructuredCallResult<T>> {
  const sanitized = stripIncompatibleKeywords(responseSchema) as Schema;
  const generativeModel = client().getGenerativeModel({
    model: modelId,
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: sanitized,
      ...(temperature !== undefined ? { temperature } : {}),
    },
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
