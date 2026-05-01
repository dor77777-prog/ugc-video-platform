// V14 — Anthropic Claude Sonnet 4.6 wrapper for the script-gen path.
//
// Why Sonnet 4.6 over OpenAI gpt-5.4-mini:
//   gpt-5.4-mini is a small model. It produces fluent Hebrew on the
//   surface but trips on subtle issues that 600 lines of system-prompt
//   rules can't reach — calques from English ("אני כבר מפחדת" = "I'm
//   already scared", literally) and verb-noun collocation errors
//   ("לקחתי לתיק" instead of "הכנסתי / שמתי בתיק"). These are
//   contextual semantic errors only a stronger model catches.
//
// Why prompt-based JSON instead of `output_config.format`:
//   Anthropic's structured-outputs grammar compiler rejects our
//   schema as "too large" — 12+ enum types × nested scenes × music
//   profile blow past the compiler's complexity limit. The shared
//   SCRIPT_JSON_SCHEMA still works fine for OpenAI strict mode.
//   Workaround: append the schema as plain text to the system prompt
//   (instead of compiling it) and rely on Sonnet's strong JSON-mode
//   instruction following. Free-form JSON parsing on the response,
//   with a `extractJsonObject` helper that strips code fences /
//   leading commentary if the model adds any.
//
// Cost vs OpenAI baseline: ~3-4× per generation. Mitigated by:
//   - Prompt caching on the system prompt (system + schema). Min
//     cacheable prefix on Sonnet 4.6 is 2048 tokens; ours easily
//     clears that. Within a single 6-call batch all fire in parallel
//     so they all WRITE the cache. Subsequent batches in the same
//     5-min window READ at ~10% input cost.
//   - effort default "medium" (env-tunable) — the doc-recommended
//     balance for Sonnet 4.6 quality vs cost.
//
// This file mirrors openai-script-client.ts / gemini-client.ts so
// scripts.ts can branch on a single env var.

import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from '@/lib/utils/retry';

// V27.10.2 — default flipped Sonnet 4.6 → Haiku 4.5.
//
// Live measurement (V27.9 deployed): Sonnet 4.6 was taking 2m+ per
// framework call against the 700+-line system prompt. Six in parallel
// = ~2m wall-clock minimum, with the long-tail call sometimes pushing
// past 3m. Unacceptable UX even with the streaming "scripts fill in"
// pattern.
//
// Why Haiku 4.5 now:
//   - 3-5x faster decode than Sonnet 4.6 on the same prompt size
//   - Hebrew quality on Haiku 4.5 is strong — the V14 author called
//     Haiku out as the cost-spike fallback, implying it was already
//     evaluated as production-viable
//   - V27.9 added 7 explicit Hebrew QA gates + the narrative through-
//     line + frame_strategy field — these prompt-engineering rails
//     enforce quality regardless of model size. Sonnet's headroom on
//     "subtle calque catching" is no longer the differentiator it was
//     in the unstructured V13 era.
//
// To restore Sonnet 4.6 (quality over speed): set
//   ANTHROPIC_SCRIPT_MODEL=claude-sonnet-4-6
// in Vercel env vars. To go even bigger: claude-opus-4-7.
//
// V27.10.3 — Haiku 4.5 needs the explicit date suffix on Anthropic's
// API. Sonnet 4.6 / Opus 4.7 resolve via the alias-style id; Haiku 4.5
// returns "model not found" without the YYYYMMDD pin. Live failure
// observed: project cmoni5rbq0001ib04udikpi9h saw all 6 framework
// calls fail because of this.
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// Effort default. Sonnet 4.6 defaults to "high" which silently turns
// on adaptive thinking and adds 10-30s thinking-phase latency before
// the first output token. For structured creative generation with a
// 600-line system prompt that already nails down every constraint,
// extra reasoning doesn't lift quality — it just spends tokens and
// wall-clock. The Anthropic docs explicitly recommend `low` + thinking
// disabled for "chat / classification / content generation" workloads,
// which is exactly what this is. Override via ANTHROPIC_SCRIPT_EFFORT
// if you ever want to A/B against `medium`/`high` to measure quality.
const DEFAULT_EFFORT: AnthropicEffort = 'low';

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export class AnthropicConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnthropicConfigError';
  }
}

let cachedClient: Anthropic | null = null;
function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicConfigError(
      'ANTHROPIC_API_KEY is not set. Add it to .env / Vercel / Railway env vars to enable script generation via Claude.',
    );
  }
  if (cachedClient === null) cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

function resolveEffort(): AnthropicEffort {
  const raw = process.env.ANTHROPIC_SCRIPT_EFFORT?.trim().toLowerCase();
  if (
    raw === 'low' ||
    raw === 'medium' ||
    raw === 'high' ||
    raw === 'xhigh' ||
    raw === 'max'
  ) {
    return raw;
  }
  return DEFAULT_EFFORT;
}

export interface AnthropicUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Cache reads — billed at ~10% of input. Useful for telemetry. */
  cacheReadInputTokens: number;
  /** Cache writes — billed at ~125% of input on first write. */
  cacheCreationInputTokens: number;
  /** Anthropic doesn't expose a separate thinking-token field for
   *  billing — adaptive thinking tokens are folded into output_tokens.
   *  Present for shape-parity with the OpenAI/Gemini clients. */
  thoughtsTokens: number;
}

export interface AnthropicStructuredCallOptions {
  systemInstruction?: string;
  userPrompt: string;
  responseSchema: unknown;
  model?: string;
  /** max_tokens for the response. 8192 is enough for one full script
   *  payload (creative_strategy + 5 scenes + quality_score). */
  maxTokens?: number;
  /** Override env-resolved effort. */
  effort?: AnthropicEffort;
}

export interface AnthropicStructuredCallResult<T> {
  parsed: T;
  raw: string;
  usage: AnthropicUsage;
}

export async function anthropicStructuredCall<T>({
  systemInstruction,
  userPrompt,
  responseSchema,
  model: modelId = DEFAULT_MODEL,
  maxTokens = 8192,
  effort,
}: AnthropicStructuredCallOptions): Promise<AnthropicStructuredCallResult<T>> {
  const resolvedEffort = effort ?? resolveEffort();

  // Build the system prompt: original instruction + schema appendix.
  // Putting the schema in `system` (not the user prompt) means it
  // sits in the cached prefix — paid once on first batch, then ~10%
  // on subsequent batches within the 5-min cache window.
  const schemaJson = JSON.stringify(responseSchema, null, 2);
  const systemWithSchema =
    `${systemInstruction ?? ''}\n\n` +
    `══════════════════════════════════════════════\n` +
    `OUTPUT FORMAT — VERY STRICT\n` +
    `══════════════════════════════════════════════\n` +
    `Return ONLY a single valid JSON object that conforms exactly to the schema below.\n` +
    `- Do NOT wrap in markdown code fences (no \`\`\`json, no \`\`\`).\n` +
    `- Do NOT add any preamble, commentary, or explanation before or after the JSON.\n` +
    `- Your entire response must be parseable by JSON.parse().\n` +
    `- All required fields (per the schema) MUST be present.\n` +
    `- All enum-constrained fields MUST use one of the allowed values verbatim.\n\n` +
    `SCHEMA:\n${schemaJson}`;

  const systemBlocks = [
    {
      type: 'text' as const,
      text: systemWithSchema,
      cache_control: { type: 'ephemeral' as const },
    },
  ];

  // V26.11 — transparent single retry on transient (network / 5xx)
  // failures inside the first 15s. Mirrors the openai client's policy.
  const response = await withRetry(
    () =>
      client().messages.create({
        model: modelId,
        max_tokens: maxTokens,
        system: systemBlocks,
        messages: [{ role: 'user', content: userPrompt }],
        // Disable adaptive thinking. With effort:high (the API default
        // when not set), Sonnet 4.6 thinks for 10-30s before emitting
        // any output — overkill for instruction-following on a
        // pre-constrained task and a major source of the 2-min wall
        // clock we hit on the first deploy. See DEFAULT_EFFORT comment.
        thinking: { type: 'disabled' },
        output_config: { effort: resolvedEffort },
      }),
    { label: 'anthropic.messages', earlyFailWindowMs: 15_000 },
  );

  // Anthropic returns ContentBlock[] — a discriminated union. Narrow
  // by .type before reading .text.
  let content = '';
  for (const block of response.content) {
    if (block.type === 'text') content += block.text;
  }
  if (!content) {
    throw new Error('Anthropic returned empty response (no text blocks).');
  }

  const jsonStr = extractJsonObject(content);
  let parsed: T;
  try {
    parsed = JSON.parse(jsonStr) as T;
  } catch (err) {
    throw new Error(
      `Anthropic returned malformed JSON: ${(err as Error).message}. First 200 chars: ${jsonStr.slice(0, 200)}`,
    );
  }

  return {
    parsed,
    raw: content,
    usage: {
      model: modelId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      thoughtsTokens: 0,
    },
  };
}

export const ANTHROPIC_DEFAULT_SCRIPT_MODEL = DEFAULT_MODEL;

// Robust JSON extraction. Sonnet usually obeys "no markdown" but
// occasionally adds a code fence or a leading sentence. We strip
// both — code fence first, then fall back to slicing from the first
// `{` to the last `}`.
function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  // ```json … ``` or ``` … ```
  const fence = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fence && fence[1]) return fence[1].trim();
  // First `{` to last `}` — handles "Here's the JSON:\n{...}" etc.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
