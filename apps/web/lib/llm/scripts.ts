import {
  SCRIPT_SYSTEM_PROMPT,
  SINGLE_SCRIPT_JSON_SCHEMA,
} from '@ugc-video/prompts';
import { resolveVideoMode } from '@/lib/video-mode';
import {
  geminiStructuredCall,
  GeminiConfigError,
  GEMINI_DEFAULT_MODEL,
} from './gemini-client';
import {
  openaiStructuredCall,
  OpenAiConfigError,
  OPENAI_DEFAULT_SCRIPT_MODEL,
} from './openai-script-client';
import {
  anthropicStructuredCall,
  AnthropicConfigError,
  ANTHROPIC_DEFAULT_SCRIPT_MODEL,
} from './anthropic-script-client';
import {
  resolveScriptEngineMode,
  type ScriptEngineMode,
} from './concept-engine';
import {
  validateScriptRegister,
  buildRegisterRetryPrompt,
  type RegisterValidatorScript,
} from './register-validator';

// V27.11.PR6 — generateScripts() handles legacy_full_batch only.
// concept_interactive flow lives in apps/web/lib/llm/concept-actions.ts
// (4 dedicated server actions: generateConcepts, regenerateSelected,
// regenerateAll, expandPicked). The PR5 concept_first auto-pick branch
// in this file was removed to avoid the broken "backend gives 3 / UI
// expects 6" state.
export type { ScriptEngineMode } from './concept-engine';

// V27.10.12 — default flipped Anthropic Sonnet 4.6 → OpenAI gpt-5.4-mini.
//
// Why: live measurement on Sonnet was 90-100s per call (5000 output
// tokens at ~50 tok/s decode), pushing the 6-parallel batch to 100-
// 200s when retry-once fired. Architecture-level math wins this:
//   gpt-5.4-mini: ~200-300 tok/s, ~25s per call, ~25s wall clock
//   Sonnet 4.6:   ~50 tok/s,      ~100s per call, ~100s wall clock
//
// V14's calque concern ("אני כבר מפחדת" pattern) was mitigated by
// V27.9's 7 Hebrew QA gates + register lock + V27.10.11's HARD-RULE
// FEATURE FOCUS block. The prompt rails do most of the lift now.
//
// Cost win compounds: gpt-5.4-mini is $0.15 / $0.60 per MTok vs
// Sonnet's $3 / $15. ~20x cheaper at the same workload.
//
// Operator overrides (no redeploy):
//   LLM_SCRIPT_PROVIDER=anthropic  (V14 path, kept for quality A/B)
//   LLM_SCRIPT_PROVIDER=openai     (default — V27.10.12)
//   LLM_SCRIPT_PROVIDER=gemini     (V25-V26.7 path, kept for experiments)
type ScriptProvider = 'anthropic' | 'openai' | 'gemini';
function resolveScriptProvider(): ScriptProvider {
  const raw = process.env.LLM_SCRIPT_PROVIDER?.trim().toLowerCase();
  if (raw === 'anthropic') return 'anthropic';
  if (raw === 'gemini') return 'gemini';
  return 'openai';
}

// Script Engine V2 — wrapper.
//
// 1. Builds a structured user prompt from product data + chosen avatar +
//    optional category guidance.
// 2. Asks gpt-4o-mini (or whatever OPENAI_SCRIPT_MODEL points to) to return
//    six scripts that match SCRIPT_JSON_SCHEMA, including a creative_strategy
//    block, 3 hook options, and a self-rated quality_score per script.
// 3. Selectively regenerates any script whose quality_score.overall < 8,
//    feeding the model the original strategy + the weakness_note as a critique.
//    Capped at REGEN_BUDGET total retry calls so a uniformly weak first batch
//    doesn't run up the bill.
// 4. Returns camelCase scripts plus a usage block (model + tokens + duration
//    + how many regen calls fired) so server actions can record the cost
//    accurately and decide whether to surface a "low quality" warning.

const QUALITY_THRESHOLD = 8;

export interface ProductInput {
  productName: string;
  description: string;
  brand?: string | null;
  targetAudience?: string | null;
  durationSeconds: number;
  price?: string | null;
  currency?: string | null;
  /**
   * V26.18 — selected feature focus from the new wizard step. When
   * present, the script LLM treats these as the ONLY angles the ad
   * should hit. Eliminates the "industrial enumerative" feel that
   * came from the LLM trying to cover everything in the description.
   */
  selectedFeatures?: Array<{ id: string; title: string; hook: string; source: 'llm' | 'custom' }> | null;
  /** V11 Product Intelligence bundle. When present, the script engine
   *  uses dossier + visual analysis + audience inference as the
   *  authoritative source of truth for hooks, scene order, mustShow,
   *  mustAvoid, and audience tone. Falls back to the lean ProductInput
   *  fields above when null (legacy projects pre-V11). */
  intelligence?: import('@/lib/product-intelligence').ProductIntelligence | null;
  // The avatar the user already picked (from step 2).
  avatarDescription?: string | null;
  /**
   * Avatar's grammatical gender — drives the Hebrew binyan + adjective
   * + verb-suffix the LLM uses for spoken_text and on_screen_caption.
   * Hebrew is heavily gendered ("עשיתי" vs "עשיתי"... ok same here, but
   * "מנסה" vs "מנסה" → no, but "טועה" vs "טועה"... actually "אני טועה"
   * (m) vs "אני טועה" (f) is the same pronunciation, BUT verb forms
   * like "הזמנתי" (m) / "הזמנתי" (f) differ in past, and
   * adjectives differ throughout). Mismatched gender is the #1
   * uncanny-valley bug for Hebrew TTS. Default 'female' if unset.
   */
  avatarGender?: 'male' | 'female' | null;
  // Product category id (e.g. "skincare", "fashion", "fitness").
  categoryId?: string | null;
  categoryLabel?: string | null;
  categoryGuidance?: string | null;
}

// Snake_case shapes returned by the LLM (match the JSON schemas).
// V27.10.9 — `assumptions` removed from creative_strategy (output trim).
// V27.10.9 — quality_score's 12 dimension scores removed; only
// `overall` + `weakness_note` remain. Old fields kept optional so
// scripts persisted before the trim still parse.
interface LlmCreativeStrategy {
  core_insight: string;
  audience_pain: string;
  emotional_trigger: string;
  product_mechanism: string;
  main_objection: string;
  persuasion_angle: string;
  why_this_would_stop_scroll: string;
  ugc_situation: string;
  hook_type: string;
  script_promise: string;
  conversion_goal: string;
  /** V27.10.9 — removed from schema. Kept optional for back-compat. */
  assumptions?: string[];
}
interface LlmQualityScore {
  overall: number;
  weakness_note: string;
  /** V27.10.9 — 12 sub-scores no longer requested from the model.
   *  Kept optional so scripts saved before the trim still parse. */
  hook_strength?: number;
  specificity?: number;
  israeli_authenticity?: number;
  emotional_pull?: number;
  visual_clarity?: number;
  conversion_potential?: number;
  tts_naturalness?: number;
  no_generic_cliches?: number;
}
interface LlmScene {
  scene_order: number;
  scene_goal: SceneGoalSlug;
  spoken_text_hebrew: string;
  on_screen_caption_hebrew: string;
  visual_prompt_english: string;
  camera_direction: string;
  performance_note: string;
  duration_seconds: number;
  // Visual-routing + product-first metadata. The structured-output
  // schema requires these, so for any newly-generated script they are
  // guaranteed present. Vocabularies enforced by the JSON schema.
  scene_generation_type: string;
  face_visibility: string;
  requires_lip_sync: boolean;
  primary_subject: string;
  must_show_product: boolean;
  product_visibility_priority: string;
  camera_focus: string;
  show_face: boolean;
}
interface LlmScript {
  framework: ScriptFrameworkSlug;
  creative_strategy: LlmCreativeStrategy;
  hook_options: string[];
  selected_hook: string;
  hook_reason: string;
  cta: string;
  target_audience: string;
  estimated_duration_seconds: number;
  scenes: LlmScene[];
  quality_score: LlmQualityScore;
  // V8 (2026-04-29) — background-music intent. Required by the schema
  // so the LLM always commits to a mood/energy/style combination; the
  // selector in lib/music/select-music.ts maps it to a local track.
  music_profile?: LlmMusicProfile;
}

export interface LlmMusicProfile {
  enabled_by_default: boolean;
  mood:
    | 'warm_lifestyle'
    | 'clean_premium'
    | 'playful_family'
    | 'tech_minimal'
    | 'energetic_demo'
    | 'soft_beauty'
    | 'calm_wellness'
    | 'direct_response_light'
    | 'luxury_elegant'
    | 'general_ugc';
  energy: 'low' | 'medium' | 'high';
  style:
    | 'soft_pop'
    | 'ambient'
    | 'minimal_electronic'
    | 'playful'
    | 'premium'
    | 'acoustic'
    | 'cinematic_light'
    | 'upbeat'
    | 'general_ugc';
  reason: string;
  target_volume: number;
  duck_under_voice: boolean;
}
interface LlmRegenResponse {
  script: LlmScript;
}

export type ScriptFrameworkSlug =
  | 'problem_agitation_solution'
  | 'skeptical_testimonial'
  | 'demonstration_proof'
  | 'price_alternative_anchor'
  | 'relatable_israeli_moment'
  | 'fast_direct_response';

export type SceneGoalSlug =
  | 'stop_scroll'
  | 'establish_pain'
  | 'introduce_product'
  | 'prove_it_works'
  | 'decision_push'
  | 'other';

// Legacy slugs kept for the Prisma enum columns. Mapped from V2 framework /
// scene_goal so existing readers (worker, admin views) keep working.
export type LegacyAngleSlug =
  | 'problem_solution'
  | 'testimonial'
  | 'product_demo'
  | 'before_after'
  | 'price_anchor'
  | 'fast_benefit';

export type LegacySceneTypeSlug =
  | 'hook'
  | 'problem'
  | 'product_demo'
  | 'benefit'
  | 'cta'
  | 'other';

const FRAMEWORK_TO_LEGACY_ANGLE: Record<ScriptFrameworkSlug, LegacyAngleSlug> = {
  problem_agitation_solution: 'problem_solution',
  skeptical_testimonial: 'testimonial',
  demonstration_proof: 'product_demo',
  price_alternative_anchor: 'price_anchor',
  // No exact legacy match — we tag relatable_israeli_moment as testimonial because
  // both are first-person creator stories, the closest legacy semantic.
  relatable_israeli_moment: 'testimonial',
  fast_direct_response: 'fast_benefit',
};

const SCENE_GOAL_TO_LEGACY_TYPE: Record<SceneGoalSlug, LegacySceneTypeSlug> = {
  stop_scroll: 'hook',
  establish_pain: 'problem',
  introduce_product: 'product_demo',
  prove_it_works: 'benefit',
  decision_push: 'cta',
  other: 'other',
};

// Camel-case shape used everywhere else (Prisma, frontend).
export interface GeneratedCreativeStrategy {
  coreInsight: string;
  audiencePain: string;
  emotionalTrigger: string;
  productMechanism: string;
  mainObjection: string;
  persuasionAngle: string;
  whyThisWouldStopScroll: string;
  ugcSituation: string;
  hookType: string;
  scriptPromise: string;
  conversionGoal: string;
  assumptions: string[];
}
export interface GeneratedQualityScore {
  hookStrength: number;
  specificity: number;
  israeliAuthenticity: number;
  emotionalPull: number;
  visualClarity: number;
  conversionPotential: number;
  ttsNaturalness: number;
  noGenericCliches: number;
  overall: number;
  weaknessNote: string;
}
export interface GeneratedScene {
  sceneOrder: number;
  sceneGoal: SceneGoalSlug;
  textHebrew: string; // = spoken_text_hebrew
  onScreenCaptionHebrew: string;
  visualPromptEnglish: string;
  cameraDirection: string;
  performanceNote: string;
  durationSeconds: number;
  // Derived for the legacy Prisma enum.
  sceneType: LegacySceneTypeSlug;
  // V3/V4 visual routing + product-first metadata. Mirrored from the
  // structured-output fields onto camelCase Prisma columns. Optional in
  // the type to keep older script JSON parseable, but the JSON schema
  // makes them required for new generations.
  sceneGenerationType?: string;
  faceVisibility?: string;
  requiresLipSync?: boolean;
  primarySubject?: string;
  mustShowProduct?: boolean;
  productVisibilityPriority?: string;
  cameraFocus?: string;
  showFace?: boolean;
}
export interface GeneratedScript {
  framework: ScriptFrameworkSlug;
  creativeStrategy: GeneratedCreativeStrategy;
  hookOptions: string[];
  selectedHook: string;
  hookReason: string;
  hook: string; // alias for selectedHook (legacy DB column)
  cta: string;
  targetAudience: string;
  estimatedDurationSeconds: number;
  scenes: GeneratedScene[];
  qualityScore: GeneratedQualityScore;
  /** Background-music intent. Null when the LLM didn't return it. */
  musicProfile: LlmMusicProfile | null;
  regenerated: boolean; // true if this script went through one regen pass
  raw: LlmScript; // preserve original for audit
  // Derived for the legacy Prisma enum.
  angle: LegacyAngleSlug;
}

export class LlmConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmConfigError';
  }
}

export interface ScriptGenerationOutput {
  scripts: GeneratedScript[];
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    regenCalls: number;
    scriptsBelowThreshold: number; // count after retries — should be 0 ideally
  };
  /** V13 hardening — number of onScriptReady callbacks that threw.
   *  Callers SHOULD treat persistFailures > 0 as a partial-success at
   *  best and `persistFailures === scripts.length` as a hard failure
   *  to surface to the user (otherwise an empty UI is shown without
   *  any error message — see the prod incident where the v13_scene_state_log
   *  migration hadn't been applied yet). */
  persistFailures: number;
}

// V6: per-framework parallel generation (Apr 2026). The previous version
// sent ONE big call returning all 6 scripts (60-90s wall-clock, no
// progressive disclosure — the user stared at a spinner). Now we fire
// 6 independent calls in parallel, each pinned to ONE framework, and
// expose an onScriptReady callback so the action can persist + stream
// scripts to the UI as they arrive. Total wall-clock = max(6 calls)
// ≈ 15-30s, with the first card visible to the user in ~5-15s.
const FRAMEWORK_ORDER: ScriptFrameworkSlug[] = [
  'problem_agitation_solution',
  'skeptical_testimonial',
  'demonstration_proof',
  'price_alternative_anchor',
  'relatable_israeli_moment',
  'fast_direct_response',
];

export interface GenerateScriptsOptions {
  /**
   * Fires the moment a single script's promise resolves successfully.
   * The action wires this to a Prisma create() so the script appears
   * in the DB (and the polling /api/.../scripts/list endpoint) without
   * waiting for the slowest sibling. `index` is the framework's position
   * in FRAMEWORK_ORDER. Throwing here is logged but doesn't fail the
   * generation.
   */
  onScriptReady?: (script: GeneratedScript, index: number) => void | Promise<void>;
}

export async function generateScripts(
  input: ProductInput,
  options?: GenerateScriptsOptions,
): Promise<ScriptGenerationOutput> {
  // V14 — provider branch. Default Anthropic (Claude Sonnet 4.6). Flip
  // to OpenAI / Gemini for experiments via `LLM_SCRIPT_PROVIDER`. The
  // same SCRIPT_SYSTEM_PROMPT + SINGLE_SCRIPT_JSON_SCHEMA flow drives
  // all three paths.
  const provider = resolveScriptProvider();
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    throw new LlmConfigError(
      'ANTHROPIC_API_KEY is not set. Add it to .env / Vercel / Railway to enable script generation, or set LLM_SCRIPT_PROVIDER=openai to fall back to gpt-5.4-mini.',
    );
  }
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    throw new LlmConfigError(
      'LLM_SCRIPT_PROVIDER=gemini but GEMINI_API_KEY is not set. Either set the key or unset LLM_SCRIPT_PROVIDER to fall back to Anthropic.',
    );
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new LlmConfigError(
      'LLM_SCRIPT_PROVIDER=openai but OPENAI_API_KEY is not set.',
    );
  }

  const model =
    provider === 'anthropic'
      ? process.env.ANTHROPIC_SCRIPT_MODEL || ANTHROPIC_DEFAULT_SCRIPT_MODEL
      : provider === 'gemini'
        ? process.env.GEMINI_SCRIPT_MODEL || GEMINI_DEFAULT_MODEL
        : process.env.OPENAI_SCRIPT_MODEL || OPENAI_DEFAULT_SCRIPT_MODEL;

  const startedAt = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  // V13 hardening: count onScriptReady (typically persist-to-Prisma)
  // failures so the caller can surface "scripts generated but none
  // persisted" to the user instead of pretending success.
  let persistFailures = 0;

  // V27.11.PR2 — Product Intelligence MOVED into systemInstruction so
  // it lands in the provider's prefix-cached prefix instead of the
  // per-call user prompt. Pre-PR2: PI block (~6-10K chars / ~2-3K
  // tokens) was rebuilt into every framework's user prompt, defeating
  // the cache 6 times per batch. Post-PR2: PI is built ONCE here and
  // passed identically to all 6 parallel calls — same shared prefix
  // string → cache hit on calls 2-6 (writes on call 1; reads at ~10%
  // of input rate after).
  //
  // Anthropic + Gemini cache the system block; OpenAI Responses API
  // caches `instructions`. All three accept whatever string we put in
  // the systemInstruction param. The exact dispatch is below.
  //
  // The PI block is hard-grounded ("USE THIS, NOT THE LEAN FIELDS
  // ABOVE") so even though it's in `system`, the model treats it as
  // authoritative project context for all 6 framework calls.
  const sharedSystemInstruction = buildSystemInstructionWithIntelligence(
    input.intelligence ?? null,
  );

  // V27.10.1 — REVERTED V27.10's warmup-first dispatch.
  //
  // The theory: cold-cache contention when 6 calls fire parallel,
  // serializing the first call would prime the cache for the rest.
  // The reality (live test): warmup-first added ~30s of pure serial
  // wall-clock on top of the 6-parallel time, instead of saving it.
  // Anthropic's cache write isn't actually serialized by the provider
  // when 6 identical-prefix calls fire together — they each write
  // their own slot, and the per-call wall-clock stays bounded by the
  // model's actual decode time.
  //
  // With V14's Sonnet 4.6 + V27.9's longer prompt (700+ lines), each
  // call IS slower than V26's gpt-5.4-mini regardless of cache state.
  // That's a model-quality tradeoff, not a dispatch issue. Real
  // latency wins live elsewhere (smaller model, smaller prompt,
  // streaming). Restoring parallel dispatch.
  //
  // Per-call timing log preserved so future regressions surface.
  // V28.0.ST4 — extracted so it can be called twice (initial + register
  // retry). Returns the structured-output payload.
  const dispatchScriptCall = async (
    promptForThisCall: string,
  ): Promise<{
    parsed: LlmRegenResponse;
    usage: { inputTokens: number; outputTokens: number };
  }> => {
    if (provider === 'anthropic') {
      return anthropicStructuredCall<LlmRegenResponse>({
        systemInstruction: sharedSystemInstruction,
        userPrompt: promptForThisCall,
        responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
        model,
      });
    }
    if (provider === 'gemini') {
      return geminiStructuredCall<LlmRegenResponse>({
        systemInstruction: sharedSystemInstruction,
        userPrompt: promptForThisCall,
        responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
        model,
      });
    }
    return openaiStructuredCall<LlmRegenResponse>({
      systemInstruction: sharedSystemInstruction,
      userPrompt: promptForThisCall,
      responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
      model,
      temperature: 0.7,
    });
  };

  const buildOneCall = async (
    framework: ScriptFrameworkSlug,
    index: number,
    customUserPrompt?: string,
  ) => {
      // V27.11.PR5 — concept-first phase-2 calls pass a customUserPrompt
      // built from buildSingleFrameworkPrompt + buildExpansionPromptFragment.
      // legacy_full_batch keeps using the per-framework prompt directly.
      const userPrompt = customUserPrompt ?? buildSingleFrameworkPrompt(input, framework);
      const callStartedAt = Date.now();
      try {
        let { parsed: parsedRegen, usage } = await dispatchScriptCall(userPrompt);

        // V28.0.ST4 — register validator + 1 retry on failure. Mirrors
        // the concept-actions pattern. Catches LLM lying about
        // casual_markers_used or producing low-marker spoken text the
        // schema's minItems: 1 didn't fully prevent.
        if (parsedRegen.script) {
          try {
            const draftScript =
              parsedRegen.script as unknown as RegisterValidatorScript;
            const v1 = validateScriptRegister(draftScript);
            if (!v1.pass || v1.liedSceneOrders.length > 0) {
              const retryPrompt = buildRegisterRetryPrompt(
                userPrompt,
                v1,
                draftScript,
              );
              const retry = await dispatchScriptCall(retryPrompt);
              if (retry.parsed.script) {
                parsedRegen = retry.parsed;
                usage = {
                  inputTokens: usage.inputTokens + retry.usage.inputTokens,
                  outputTokens: usage.outputTokens + retry.usage.outputTokens,
                };
              }
            }
          } catch (err) {
            console.warn(
              `[scripts] register validator threw on framework ${framework}, shipping draft as-is:`,
              (err as Error).message,
            );
          }
        }

        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        if (!parsedRegen.script) return null;
        // Force the framework slug — defensive: a model occasionally
        // hallucinates a different slug despite the prompt pinning.
        parsedRegen.script.framework = framework;
        const generated = toGenerated(parsedRegen.script, false);
        // Fire the streaming callback. Errors here are logged AND
        // counted (V13 hardening — see ScriptGenerationOutput.persistFailures)
        // so one persist failure doesn't poison the batch but the
        // caller can still tell whether persistence succeeded. The
        // earlier silent-swallow masked a missing-column migration in
        // prod for hours.
        if (options?.onScriptReady) {
          try {
            await options.onScriptReady(generated, index);
          } catch (err) {
            console.error(
              `[scripts] onScriptReady for framework=${framework} threw:`,
              (err as Error).message,
            );
            persistFailures++;
          }
        }
        return generated;
      } catch (err) {
        if (
          err instanceof GeminiConfigError ||
          err instanceof OpenAiConfigError ||
          err instanceof AnthropicConfigError
        ) {
          // Re-throw config errors — caller decides whether to surface
          // a specific "configure {ANTHROPIC,GEMINI,OPENAI}_API_KEY" message.
          throw err;
        }
        console.warn(
          `[scripts] framework=${framework} ${provider} call failed in ${Date.now() - callStartedAt}ms:`,
          (err as Error).message,
        );
        return null;
      }
  };

  // V27.11.PR6 — generateScripts() handles ONLY legacy_full_batch now.
  // The concept_interactive flow has its own dedicated server actions
  // in lib/llm/concept-actions.ts (generateConcepts, regenerateSelected,
  // regenerateAll, expandPicked) — not routed through this function.
  // The PR5 backend-only auto-pick branch was removed because it
  // returned a count that didn't match the UI's expectation, leaving
  // 3 concept cards forever-spinning. Don't reintroduce.
  const engineMode = resolveScriptEngineMode();
  if (engineMode !== 'legacy_full_batch') {
    // Defensive: a non-legacy mode reaching here means scripts/page.tsx
    // didn't branch correctly. We'd rather log loud than serve a
    // half-broken UI.
    console.warn(
      `[scripts] generateScripts called with engineMode=${engineMode} — falling through to legacy_full_batch. concept_interactive should route via concept-actions.ts.`,
    );
  }
  // V27.10.1 — restored parallel dispatch. See comment block above
  // for why the V27.10 warmup-first approach was reverted.
  const results: (GeneratedScript | null)[] = await Promise.all(
    FRAMEWORK_ORDER.map((framework, index) => buildOneCall(framework, index)),
  );

  // V27.10.11 — single-shot retry of any framework that returned null
  // in the first batch. Live observation: roughly 1 of 6 Anthropic
  // calls fails per project (timeout, transient 429, etc.), so users
  // saw 5/6 scripts. The wrapper's withRetry only retries within the
  // first 15s — a slow framework that errors at 60s gets no retry.
  // Here we re-issue ONLY the failed indexes; runs in parallel; one
  // round, no recursive retries (avoids tail-latency runaway).
  //
  // V27.10.11 — single-shot retry of any framework that returned null
  // in the first batch.
  {
    const failedIndexes = results
      .map((r, i) => (r === null ? i : -1))
      .filter((i) => i !== -1);
    if (failedIndexes.length > 0 && failedIndexes.length < FRAMEWORK_ORDER.length) {
      console.warn(
        `[scripts] ${failedIndexes.length}/${FRAMEWORK_ORDER.length} frameworks failed in first batch, retrying once: ${failedIndexes
          .map((i) => FRAMEWORK_ORDER[i])
          .join(', ')}`,
      );
      const retryResults = await Promise.all(
        failedIndexes.map((i) => {
          const fw = FRAMEWORK_ORDER[i];
          return fw ? buildOneCall(fw, i) : Promise.resolve(null);
        }),
      );
      for (let r = 0; r < failedIndexes.length; r++) {
        const idx = failedIndexes[r];
        if (idx !== undefined && retryResults[r] !== null && retryResults[r] !== undefined) {
          results[idx] = retryResults[r] ?? null;
        }
      }
    }
  }

  const successful = results.filter((r): r is GeneratedScript => r !== null);
  if (successful.length === 0) {
    throw new Error(
      'All 6 framework generations failed — check the LLM logs for details.',
    );
  }

  const durationMs = Date.now() - startedAt;
  const scriptsBelowThreshold = successful.filter(
    (s) => (s.qualityScore?.overall ?? 0) < QUALITY_THRESHOLD,
  ).length;

  return {
    scripts: successful,
    usage: {
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      durationMs,
      regenCalls: 0, // V6: regen folded into per-framework retry inside generateSingleFrameworkScript
      scriptsBelowThreshold,
    },
    persistFailures,
  };
}

// Per-framework user prompt — V6 streaming generation. Each of the 6
// parallel calls receives the same product context but is pinned to
// ONE framework, with a short framework-specific reminder so the model
// commits to that ad concept instead of drifting toward whichever
// archetype it finds easiest.
const FRAMEWORK_BRIEF_HEBREW: Record<ScriptFrameworkSlug, string> = {
  problem_agitation_solution:
    'בעיה יומיומית ספציפית → להעצים את הכאב לרגע → המוצר נכנס באופן טבעי. לא "ה-X המהפכני", לא "פתרון מושלם".',
  skeptical_testimonial:
    'הקריין/ית מתחיל ספקני: "תכל\'ס, חשבתי שזה עוד גימיק". מנסה. מסביר מה הפתיע אותו. תהליך פסיכולוגי, לא רשימת תועלות.',
  demonstration_proof:
    'הוכחה ויזואלית, צעד-אחרי-צעד, של המוצר פותר את הבעיה. דיבור קצר — הוויזואל מספר את הסיפור. לפחות 2 סצנות hands_only / product_demo.',
  price_alternative_anchor:
    'השוואה לפתרון יקר/מסובך/מעצבן יותר. "במקום לשלם X / להתקשר ל-Y / להזמין Z, אני עושה את זה ב-30 שניות".',
  relatable_israeli_moment:
    'רגע ישראלי מאוד מקומי — ערב שישי, ילד שלא נרדם, ויכוח עם בן זוג על המקלחת, פקק בנתיבי איילון, מטבח אחרי ארוחה. המוצר מתערב כפתרון אנושי.',
  fast_direct_response:
    'קצר, חד, בנוי לביצועים במטא/טיקטוק. 18-22 שניות. Hook חזק → תועלת אחת → CTA. ללא סיפור.',
};

// V27.11.PR5 — phase-1 user prompt for concept_first mode. Carries
// product context + mode constraints + avatar lock + feature focus,
// but tells the LLM to produce 6 lightweight CONCEPT CARDS (one per
// framework) instead of one full script. The concept system prompt
// (CONCEPT_SYSTEM_PROMPT) handles the per-framework brief + the
// concept-card schema rules; this user prompt is just the project-
// specific data.
//
// The PI block is NOT included here — it's already in the shared
// systemInstruction passed via generateConceptCards(), which strips
// SCRIPT_SYSTEM_PROMPT and prepends CONCEPT_SYSTEM_PROMPT instead.
// V27.11.PR6 — exported so the new concept-actions.ts server action
// can build a phase-1 prompt with the same project/mode/avatar context
// the legacy generateScripts path uses.
export function buildConceptBatchUserPrompt(p: ProductInput): string {
  const mode = resolveVideoMode(p.durationSeconds);
  const modeBlock = [
    `אורך הסרטון הסופי: ${mode.targetTotalDurationMs / 1000} שניות (mode = ${mode.mode}).`,
    `יעד סצנות: ${mode.preferredSceneCount} (מקסימום ${mode.maxSceneCount}).`,
  ].join('\n');

  const featureFocusBlock =
    p.selectedFeatures && p.selectedFeatures.length > 0
      ? [
          '═══════════════════════════════════════════',
          '🎯 FEATURE FOCUS — חוק קשיח (HARD RULE)',
          '═══════════════════════════════════════════',
          'המשתמש בחר את התכונות הבאות. **כל 6 הקונספטים חייבים להיות מעוגנים רק בהן.** אל תזכיר תכונות אחרות מהתיאור גם אם הן נראות אטרקטיביות.',
          '',
          ...p.selectedFeatures.map(
            (f, i) =>
              `${i + 1}. **${f.title}**${f.hook ? `\n   זווית/הוק: ${f.hook}` : ''}`,
          ),
          '',
          'דרישות אכיפה לכל קונספט:',
          '• ה-selected_hook חייב לצטט במפורש לפחות אחת מהתכונות (במילים שלך).',
          '• ה-big_idea חייב להבהיר איזו תכונה מבין הנבחרות מובילה את הקונספט הזה.',
          '• אסור לכתוב קונספטים שמדברים על "מוצר באופן כללי" / "פתרון מהפכני".',
          '═══════════════════════════════════════════',
          '',
        ].join('\n')
      : null;

  const lines: (string | null)[] = [
    featureFocusBlock,
    `שם המוצר: ${p.productName}`,
    p.brand ? `מותג: ${p.brand}` : null,
    p.targetAudience ? `קהל יעד עיקרי: ${p.targetAudience}` : null,
    p.price ? `מחיר: ${p.price}${p.currency ? ' ' + p.currency : ''}` : null,
    modeBlock,
    '',
    'תיאור המוצר:',
    p.description,
    '',
    p.categoryLabel || p.categoryGuidance
      ? [
          `קטגוריה: ${p.categoryLabel ?? p.categoryId ?? 'unknown'}`,
          p.categoryGuidance ? `הנחיות per-category: ${p.categoryGuidance}` : null,
          '',
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    p.avatarDescription
      ? [
          `דמות הקריינות שכבר נבחרה: ${p.avatarDescription}.`,
          p.avatarGender === 'male'
            ? '⚠ **מגדר הקריין: זכר**. selected_hook + big_idea חייבים להיכתב ב-spoken Hebrew של זכר.'
            : '⚠ **מגדר הקריינית: נקבה**. selected_hook + big_idea חייבים להיכתב ב-spoken Hebrew של נקבה.',
          '',
        ].join('\n')
      : null,
    'הפק עכשיו 6 כרטיסי קונספט בפורמט { "concepts": [...] } תואם לסכמה. כל אחד עם framework שונה (בסדר FRAMEWORK_ORDER). כל אחד עם estimated_quality כן.',
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

function buildSingleFrameworkPrompt(
  p: ProductInput,
  framework: ScriptFrameworkSlug,
): string {
  const mode = resolveVideoMode(p.durationSeconds);
  // Render the per-mode constraints inline so the model sees the
  // exact targets it has to hit (scene count, talking caps, word
  // budget). Without this block the system prompt's "default 5 scenes"
  // wins over a 15s project and the script bloats.
  const modeBlock = [
    `אורך הסרטון הסופי: ${mode.targetTotalDurationMs / 1000} שניות (mode = ${mode.mode}).`,
    `יעד סצנות: ${mode.preferredSceneCount} (מקסימום ${mode.maxSceneCount}).`,
    `מקסימום סצנות עם requires_lip_sync=true: ${mode.maxLipSyncScenes}.`,
    `מקסימום סצנת talking-head בודדת: ${mode.maxTalkingSceneDurationMs / 1000}s.`,
    `תקציב מילים בעברית לכל הסקריפט: יעד ${mode.totalSpokenWordsTarget} מילים, hard max ${mode.totalSpokenWordsHardMax}.`,
    `אסור לחרוג מ-${mode.maxTotalDurationMs / 1000}s — הסכום של duration_seconds לכל הסצנות חייב להיות ב-[${mode.minTotalDurationMs / 1000}, ${mode.maxTotalDurationMs / 1000}]s.`,
  ].join('\n');
  // V27.11.PR2 — Product Intelligence is no longer rebuilt per-call.
  // It now lives in the shared `systemInstruction` (built once at the
  // top of `generateScripts` and re-used across all 6 parallel calls)
  // so providers' prefix-cache fires on calls 2-6. See the
  // `sharedSystemInstruction` comment in `generateScripts` and
  // `buildSystemInstructionWithIntelligence` below.

  // V27.10.11 — FEATURE FOCUS block PROMOTED to the top of the prompt
  // and reformatted as a HARD RULE. Old position (mid-prompt, soft
  // sentence) was being ignored — Haiku live results showed scripts
  // that mentioned "the product" generically without citing any of
  // the user-picked features. Sonnet should follow this stricter form.
  // Per-scene requirement + final-checklist line forces feature recall
  // through the whole creative process.
  const featureFocusBlock =
    p.selectedFeatures && p.selectedFeatures.length > 0
      ? [
          '═══════════════════════════════════════════',
          '🎯 FEATURE FOCUS — חוק קשיח (HARD RULE)',
          '═══════════════════════════════════════════',
          'המשתמש בחר את התכונות הבאות בשלב הקודם של ה-wizard. **הסרטון כולו חייב להיות מעוגן רק בהן.** אל תזכיר תכונות אחרות מהתיאור גם אם הן נראות אטרקטיביות.',
          '',
          ...p.selectedFeatures.map(
            (f, i) =>
              `${i + 1}. **${f.title}**${f.hook ? `\n   זווית/הוק: ${f.hook}` : ''}`,
          ),
          '',
          'דרישות אכיפה:',
          `• ה-selected_hook חייב לצטט במפורש לפחות אחת מהתכונות (במילים שלך) — לא ביטוי גנרי כמו "המוצר הזה".`,
          `• ב-creative_strategy.product_role: לכתוב איזו תכונה מבין הנבחרות מובילה את התסריט הזה ולמה.`,
          `• לפחות 2 סצנות (מתוך 4-5) חייבות לצטט תכונה ספציפית מהרשימה ב-spoken_text_hebrew או ב-on_screen_caption_hebrew.`,
          `• visual_prompt_english של סצנת ה-product_demo / hands_only / closeup_product צריכה להראות בויזואלית את התכונה הספציפית בפעולה.`,
          `• ה-CTA יכול להיות "סגור 30%" או "מלאי אחרון" אבל הוא חייב להכיל רמיזה לתכונה ראשית מבין הנבחרות.`,
          `• אל תכתוב סצנות שמדברות על "מוצר באופן כללי" / "פתרון מהפכני" / "אני אוהבת את זה". כל מילה חייבת לעבוד את אחת מהתכונות שלמעלה.`,
          '═══════════════════════════════════════════',
          '',
        ].join('\n')
      : null;

  const lines: (string | null)[] = [
    // V27.10.11 — feature focus opens the prompt so it's the first
    // thing the model sees, not buried mid-context.
    featureFocusBlock,
    `שם המוצר: ${p.productName}`,
    p.brand ? `מותג: ${p.brand}` : null,
    p.targetAudience ? `קהל יעד עיקרי: ${p.targetAudience}` : null,
    p.price ? `מחיר: ${p.price}${p.currency ? ' ' + p.currency : ''}` : null,
    modeBlock,
    '',
    'תיאור המוצר:',
    p.description,
    '',
    p.categoryLabel || p.categoryGuidance
      ? [
          `קטגוריה: ${p.categoryLabel ?? p.categoryId ?? 'unknown'}`,
          p.categoryGuidance ? `הנחיות per-category: ${p.categoryGuidance}` : null,
          '',
        ]
          .filter(Boolean)
          .join('\n')
      : null,
    p.avatarDescription
      ? [
          `דמות הקריינות שכבר נבחרה: ${p.avatarDescription}.`,
          // Hard gender lock — every spoken_text_hebrew + on_screen_caption_hebrew
          // must use the matching grammatical gender. Mismatched verbs/
          // adjectives are the #1 reason a Hebrew UGC ad sounds wrong.
          p.avatarGender === 'male'
            ? '⚠ **המגדר של הקריין: זכר**. כל הטקסט המדובר (spoken_text_hebrew) וכל הכתוביות (on_screen_caption_hebrew) חייבים להיות בלשון **זכר** — פעלים בעבר/הווה/עתיד, שמות תואר, וכינויי גוף. אסור על "הזמנתי / טעיתי / חשבתי" בלשון נקבה. דוגמאות: "אני בטוח" (לא "בטוחה"), "ראיתי" — בלשון זכר, "הזמנתי / ניסיתי / גיליתי" — בלשון זכר.'
            : '⚠ **המגדר של הקריינית: נקבה**. כל הטקסט המדובר (spoken_text_hebrew) וכל הכתוביות (on_screen_caption_hebrew) חייבים להיות בלשון **נקבה** — פעלים בעבר/הווה/עתיד, שמות תואר, וכינויי גוף. דוגמאות: "ראיתי" (נקבה), "אני בטוחה" (לא "בטוח"), "הזמנתי, ניסיתי, גיליתי" (כולם בלשון נקבה).',
          '⚠ אל תכתוב את תיאור הדמות בתוך visual_prompt_english — תמונת הרפרנס תטופל ע"י ה-image model. ב-visual_prompt_english תכתוב רק setting / action / camera framing / lighting / outfit (אם רלוונטי).',
          '',
        ].join('\n')
      : null,
    `🎯 **ה-framework לתסריט הזה: ${framework}**`,
    `הנחיה לפריימוורק: ${FRAMEWORK_BRIEF_HEBREW[framework]}`,
    '',
    p.selectedFeatures && p.selectedFeatures.length > 0
      ? '🔁 **תזכורת אחרונה לפני שאתה כותב**: כל מילה בתסריט הזה חייבת לעבוד את ה-FEATURE FOCUS שבראש הפרומפט. אם הסצנה הראשונה שלך לא רומזת לאחת מהתכונות הנבחרות — תכתוב אותה מחדש לפני שתמשיך לסצנה הבאה.'
      : null,
    '',
    'הפק עכשיו תסריט אחד בודד בפורמט { "script": {...} } תואם לסכמה — לפי ה-framework שצוין. creative_strategy מלא, 5 hook_options, quality_score (overall + weakness_note), וכל סצנה עם המטא-דאטה (environment_type / environment_style / primary_subject / וכו\').',
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

// Hebrew TTS at natural pace ≈ 14 chars/sec (matches the estimate in
// elevenlabs.ts). Reconcile the LLM's stated duration with the duration
// the spoken text will actually take, so the clip and voice line up.
//
// Algorithm: take whichever is longer (LLM intent vs text reality), then
// snap into Kling's allowed window. We bias toward the audio-derived
// value because audio is the source of truth — if it doesn't fit, the
// scene gets cut. Better to have a small visual tail than a chopped
// sentence.
function reconcileSceneDuration(spokenText: string, llmDuration: number): number {
  const HEBREW_CHARS_PER_SEC = 14;
  const KLING_MIN = 4;
  const KLING_MAX = 10;
  const audioDerived = Math.ceil((spokenText?.length ?? 0) / HEBREW_CHARS_PER_SEC);
  const llmClamped = Math.max(KLING_MIN, Math.min(KLING_MAX, Math.round(llmDuration ?? KLING_MIN)));
  const reconciled = Math.max(llmClamped, audioDerived);
  return Math.max(KLING_MIN, Math.min(KLING_MAX, reconciled));
}

function toGenerated(s: LlmScript, regenerated: boolean): GeneratedScript {
  return {
    framework: s.framework,
    creativeStrategy: {
      coreInsight: s.creative_strategy.core_insight,
      audiencePain: s.creative_strategy.audience_pain,
      emotionalTrigger: s.creative_strategy.emotional_trigger,
      productMechanism: s.creative_strategy.product_mechanism,
      mainObjection: s.creative_strategy.main_objection,
      persuasionAngle: s.creative_strategy.persuasion_angle,
      whyThisWouldStopScroll: s.creative_strategy.why_this_would_stop_scroll,
      ugcSituation: s.creative_strategy.ugc_situation,
      hookType: s.creative_strategy.hook_type,
      scriptPromise: s.creative_strategy.script_promise,
      conversionGoal: s.creative_strategy.conversion_goal,
      // V27.10.9 — assumptions removed from schema. Defaulted to []
      // so the GeneratedCreativeStrategy shape stays stable for the UI.
      assumptions: s.creative_strategy.assumptions ?? [],
    },
    hookOptions: s.hook_options,
    selectedHook: s.selected_hook,
    hookReason: s.hook_reason,
    hook: s.selected_hook,
    cta: s.cta,
    targetAudience: s.target_audience,
    estimatedDurationSeconds: s.estimated_duration_seconds,
    scenes: s.scenes
      .map((sc) => ({
        sceneOrder: sc.scene_order,
        sceneGoal: sc.scene_goal,
        textHebrew: sc.spoken_text_hebrew,
        onScreenCaptionHebrew: sc.on_screen_caption_hebrew,
        visualPromptEnglish: sc.visual_prompt_english,
        cameraDirection: sc.camera_direction,
        performanceNote: sc.performance_note,
        // Trust audio-derived duration over the LLM's claim. Hebrew TTS at
        // natural pace ≈ 14 chars/sec — if the LLM said 4s but wrote 90
        // chars, the voice will actually take ~6.4s and the clip will be
        // out-of-sync. Pick whichever is larger so the clip is at least
        // long enough to fit the voice. Clamped to Kling's [4-10] window.
        durationSeconds: reconcileSceneDuration(sc.spoken_text_hebrew, sc.duration_seconds),
        sceneType: SCENE_GOAL_TO_LEGACY_TYPE[sc.scene_goal] ?? 'other',
        // V3 routing + V4 product-first metadata mirrored 1:1 onto the
        // camelCase fields the Prisma `Scene.create` reads.
        sceneGenerationType: sc.scene_generation_type,
        faceVisibility: sc.face_visibility,
        requiresLipSync: sc.requires_lip_sync,
        primarySubject: sc.primary_subject,
        mustShowProduct: sc.must_show_product,
        productVisibilityPriority: sc.product_visibility_priority,
        cameraFocus: sc.camera_focus,
        showFace: sc.show_face,
      }))
      .sort((a, b) => a.sceneOrder - b.sceneOrder),
    qualityScore: {
      // V27.10.9 — only overall + weakness_note are now requested from
      // the LLM (the 12 sub-scores were dead weight, never UI-consumed).
      // Sub-scores default to 0 so the GeneratedQualityScore shape stays
      // stable for the dashboard / DB writers.
      hookStrength: s.quality_score.hook_strength ?? 0,
      specificity: s.quality_score.specificity ?? 0,
      israeliAuthenticity: s.quality_score.israeli_authenticity ?? 0,
      emotionalPull: s.quality_score.emotional_pull ?? 0,
      visualClarity: s.quality_score.visual_clarity ?? 0,
      conversionPotential: s.quality_score.conversion_potential ?? 0,
      ttsNaturalness: s.quality_score.tts_naturalness ?? 0,
      noGenericCliches: s.quality_score.no_generic_cliches ?? 0,
      overall: s.quality_score.overall,
      weaknessNote: s.quality_score.weakness_note,
    },
    musicProfile: s.music_profile ?? null,
    regenerated,
    raw: s,
    angle: FRAMEWORK_TO_LEGACY_ANGLE[s.framework] ?? 'problem_solution',
  };
}

// V27.11.PR2 — build the systemInstruction string shared by all 6
// parallel framework calls. PRE-PR2 the system was just
// SCRIPT_SYSTEM_PROMPT and the per-call user prompt carried the PI
// block (~6-10K chars per call × 6 calls = ~36-60K chars of duplicated
// context fighting prefix-cache 6x per batch). POST-PR2 the system
// is `SCRIPT_SYSTEM_PROMPT + PI block` once, and per-call user prompts
// only carry the framework / mode / avatar / category / feature focus
// — small, framework-specific, and intentionally diff per call.
//
// The PI block is gated on `intel != null` so legacy projects without
// V11 intelligence still get a clean SCRIPT_SYSTEM_PROMPT only.
//
// Important: the resulting string MUST be byte-identical across the 6
// parallel calls in one batch. That's what gives the prefix cache its
// hit. The function is pure of `framework` etc — by design.
export function buildSystemInstructionWithIntelligence(
  intel: import('@/lib/product-intelligence').ProductIntelligence | null,
): string {
  if (!intel) return SCRIPT_SYSTEM_PROMPT;
  return `${SCRIPT_SYSTEM_PROMPT}\n\n${buildIntelligencePromptBlock(intel)}`;
}

// V11 — render the Product Intelligence bundle into a structured
// prompt block. PRE-V27.11.PR2 this lived in the per-call user
// prompt; POST-PR2 it's appended to SCRIPT_SYSTEM_PROMPT (via
// `buildSystemInstructionWithIntelligence` above) so it lands in the
// provider's prefix cache.
function buildIntelligencePromptBlock(
  intel: import('@/lib/product-intelligence').ProductIntelligence,
): string {
  const d = intel.dossier;
  const v = intel.visualAnalysis;
  const a = intel.audience;
  const list = (xs: string[]) => (xs.length === 0 ? '(none)' : xs.map((x) => `  - ${x}`).join('\n'));
  const visualBlock =
    v && v.activePart
      ? [
          '',
          '🎥 PRODUCT VISUAL ANALYSIS (vision pass on hero image):',
          `objectDescription: ${v.objectDescription}`,
          `activePart: ${v.activePart}`,
          `howToHold: ${v.howToHold}`,
          `howToUseVisually: ${v.howToUseVisually}`,
          `contactPoint: ${v.contactPoint}`,
          `substanceVisualType: ${v.substanceVisualType || '(no substance / N/A)'}`,
          `textureAndMaterial: ${v.textureAndMaterial}`,
          `bestDemoAngles:`,
          list(v.bestDemoAngles),
          `mustShowForDemo:`,
          list(v.mustShowForDemo),
          `mustAvoidForDemo:`,
          list(v.mustAvoidForDemo),
          `likelyModelMistakes (the image model WILL produce these unless we explicitly forbid them):`,
          list(v.likelyModelMistakes),
        ].join('\n')
      : '';
  return [
    '',
    '═══════════════════════════════════════════',
    '🧠 PRODUCT INTELLIGENCE — USE THIS, NOT THE LEAN FIELDS ABOVE.',
    '═══════════════════════════════════════════',
    'Every script you write must be grounded in the dossier + visual analysis + audience inference below. Do NOT generate a generic UGC ad. Every spoken line must reflect a specific painPoint or daily moment from the dossier; every product/demo scene must visually prove a visualEvidenceRequirement.',
    '',
    '📦 PRODUCT DOSSIER:',
    `category: ${d.category} / subcategory: ${d.subcategory} / productType: ${d.productType}`,
    `productMechanism: ${d.productMechanism}`,
    `applicationMethod: ${d.applicationMethod}`,
    `applicatorType: ${d.applicatorType} / packaging: ${d.packagingType} / texture: ${d.textureType} / outputSubstance: ${d.outputSubstance}`,
    'painPoints:',
    list(d.painPoints),
    'desiredOutcomes:',
    list(d.desiredOutcomes),
    'purchaseTriggers:',
    list(d.purchaseTriggers),
    'mainObjections:',
    list(d.mainObjections),
    'usageSteps:',
    list(d.usageSteps),
    'mustShowVisuals (camera MUST capture these in product/demo scenes):',
    list(d.mustShowVisuals),
    'mustAvoidVisuals (camera MUST NOT show these even if the model defaults to them):',
    list(d.mustAvoidVisuals),
    'visualEvidenceRequirements (the audience NEEDS to see these to believe the product):',
    list(d.visualEvidenceRequirements),
    'visualFailureModes (cheap fakes a generic image model loves to produce):',
    list(d.visualFailureModes),
    'israeliRealismCues:',
    list(d.israeliRealismCues),
    'conservativeAssumptions (treat as soft, never as hard claims in spoken text):',
    list(d.conservativeAssumptions),
    visualBlock,
    '',
    '👥 AUDIENCE INFERENCE:',
    'primaryAudience:',
    list(a.primaryAudience),
    'dailyUseMoments (specific Israeli moments — drive specific_situation in creative_strategy):',
    list(a.dailyUseMoments),
    'problemContext:',
    list(a.problemContext),
    'emotionalTriggers:',
    list(a.emotionalTriggers),
    'purchaseObjections:',
    list(a.purchaseObjections),
    'realisticIsraeliSettings (use ONLY these for environment_type / scene location):',
    list(a.realisticIsraeliSettings),
    `toneRecommendation: ${a.toneRecommendation}`,
    `visualStrategyRecommendation: ${a.visualStrategyRecommendation}`,
    '',
    '⚠ Hard rules:',
    '- creative_strategy.product_mechanism MUST mirror dossier.productMechanism — don\'t invent a different mechanism.',
    '- creative_strategy.audience_pain MUST come from dossier.painPoints OR audience.problemContext (paraphrase to Hebrew is fine, but do not invent a new pain).',
    '- specific_situation in creative_strategy MUST anchor in audience.dailyUseMoments — concrete, local, specific.',
    '- product_demo / closeup_product / hands_only scenes MUST cite at least one mustShowVisuals item in visual_prompt_english.',
    '- Never describe a scene that contradicts mustAvoidVisuals (e.g. white cream when substanceVisualType is transparent serum).',
    '- environment_type MUST come from audience.realisticIsraeliSettings or dossier.likelyUseEnvironments — no foreign suburban kitchens.',
    '═══════════════════════════════════════════',
    '',
  ].join('\n');
}
