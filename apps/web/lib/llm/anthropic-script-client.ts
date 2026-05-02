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

// V27.10.7 — back to Haiku 4.5 with a conditional drop of
// `output_config.effort` (Haiku doesn't accept it).
//
// Story:
//   V14            Sonnet 4.6 default. ~2m+ per call (decode-bound on
//                  6-7k output tokens at ~50 tok/s).
//   V27.10.2       Flipped Sonnet → Haiku for 3-4x faster decode.
//                  Forgot to drop output_config.effort → 400.
//   V27.10.3-5b    Diag work proved the 400 was effort-only.
//   V27.10.6       Flipped back to Sonnet to "fix" the 400. Live: 1m 39s
//                  per call observed in admin/costs in-flight panel.
//                  Confirmed Sonnet's decode is the bottleneck —
//                  cache_control / effort:low / thinking:disabled are
//                  already optimal for Sonnet.
//   V27.10.7       Haiku 4.5 + conditional drop of effort. 6000 output
//                  tokens at ~175 tok/s ≈ 35s per call, 6 in parallel
//                  ≈ 35-40s wall clock. Quality is sustained by V27.9's
//                  Hebrew QA gates / narrative through-line / frame_
//                  strategy locked in the 700-line system prompt — no
//                  "subtle calque catching" headroom needed from a
//                  bigger model when prompt-engineering rails are this
//                  tight.
//
// Cost recap: Haiku 4.5 = $1/$5 per MTok vs Sonnet's $3/$15 — 3x
// cheaper at the same workload.
//
// To go bigger (quality > speed): set
//   ANTHROPIC_SCRIPT_MODEL=claude-sonnet-4-6  (or claude-opus-4-7)
// in Vercel env. The wrapper will detect the non-Haiku id and re-emit
// output_config.effort automatically.
//
// V27.10.3 — Haiku 4.5 needs the explicit YYYYMMDD pin on Anthropic's
// API; the alias-style `claude-haiku-4-5` returns "model not found".
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

// Effort default. Sonnet 4.6 defaults to "high" which silently turns
// on adaptive thinking and adds 10-30s thinking-phase latency before
// the first output token. For structured creative generation with a
// 700-line system prompt that already nails down every constraint,
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
  // V27.10.4 — defensive validation. Vercel env vars can be set to:
  //   • undefined  (variable not declared)
  //   • ""         (variable declared, empty value — common when user
  //                clicks "Save" on an empty input box)
  //   • '""'       (literal two-quote string — common copy-paste mistake)
  //   • short stub (some users paste partial keys)
  // Anthropic keys are >40 chars and start with `sk-ant-`. Anything
  // else is invalid; throw early with an actionable message instead
  // of letting the SDK send an empty header and surface a generic
  // "auth error" 6× in parallel that bubbles up as
  // "All 6 framework generations failed".
  const raw = process.env.ANTHROPIC_API_KEY;
  const apiKey = raw?.trim().replace(/^"+|"+$/g, ''); // strip wrapping quotes
  if (!apiKey || apiKey.length < 20 || !apiKey.startsWith('sk-ant-')) {
    throw new AnthropicConfigError(
      apiKey === undefined || apiKey === ''
        ? 'ANTHROPIC_API_KEY is empty in the production env. Open Vercel → Settings → Environment Variables, paste the real key (starts with sk-ant-) for Production, save. No redeploy needed.'
        : `ANTHROPIC_API_KEY appears malformed (${apiKey.length} chars, prefix "${apiKey.slice(0, 8)}"). Real keys start with sk-ant- and are 80+ chars. Check Vercel env vars — likely a copy-paste mistake.`,
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
  /** max_tokens for the response. V27.10.9 — lowered 8192 → 6500.
   *  After the V27.10.9 schema trim (12 quality dim scores + hook_
   *  alternatives + diversity_notes + creative_strategy.assumptions
   *  removed), a typical full payload runs ~4500-5500 output tokens.
   *  6500 leaves headroom for the longest scripts and caps any
   *  long-tail call that would otherwise burn extra decode time. */
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
  maxTokens = 6500,
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
  //
  // V27.10.7 — `output_config.effort` is reasoning-capable-models only
  // (Sonnet 4.6 / Opus 4.7). Haiku 4.5 returns 400 invalid_request_error
  // if it's present. Detect by id prefix and drop the field for Haiku.
  // `thinking: disabled` IS accepted by Haiku (the field exists but the
  // model has no extended-thinking phase to disable).
  const isHaikuModel = modelId.startsWith('claude-haiku');
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
        // pre-constrained task. See DEFAULT_EFFORT comment.
        thinking: { type: 'disabled' },
        ...(isHaikuModel ? {} : { output_config: { effort: resolvedEffort } }),
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
