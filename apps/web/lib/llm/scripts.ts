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

// V26.8 — provider switch. Default `openai` reverts the V25-V26.7
// Gemini experiment after live use showed it was both more expensive
// and produced weaker `visualPromptEnglish` than the pre-V25
// gpt-5.4-mini baseline. Operator can flip via env without redeploy:
//   LLM_SCRIPT_PROVIDER=openai   (default)
//   LLM_SCRIPT_PROVIDER=gemini   (V25-V26.7 path, kept for experiments)
function resolveScriptProvider(): 'openai' | 'gemini' {
  const raw = process.env.LLM_SCRIPT_PROVIDER?.trim().toLowerCase();
  return raw === 'gemini' ? 'gemini' : 'openai';
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
  assumptions: string[];
}
interface LlmQualityScore {
  hook_strength: number;
  specificity: number;
  israeli_authenticity: number;
  emotional_pull: number;
  visual_clarity: number;
  conversion_potential: number;
  tts_naturalness: number;
  no_generic_cliches: number;
  overall: number;
  weakness_note: string;
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
  // V26.8 — provider branch. Default OpenAI (gpt-5.4-mini, the
  // pre-V25 baseline). Flip to Gemini for experiments via the env
  // var `LLM_SCRIPT_PROVIDER=gemini`. The same SCRIPT_SYSTEM_PROMPT
  // + SINGLE_SCRIPT_JSON_SCHEMA flow drives both paths.
  const provider = resolveScriptProvider();
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) {
    throw new LlmConfigError(
      'LLM_SCRIPT_PROVIDER=gemini but GEMINI_API_KEY is not set. Either set the key or unset LLM_SCRIPT_PROVIDER to fall back to OpenAI.',
    );
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new LlmConfigError(
      'OPENAI_API_KEY is not set. Add it to .env / Vercel / Railway to enable script generation.',
    );
  }

  const model =
    provider === 'gemini'
      ? process.env.GEMINI_SCRIPT_MODEL || GEMINI_DEFAULT_MODEL
      : process.env.OPENAI_SCRIPT_MODEL || OPENAI_DEFAULT_SCRIPT_MODEL;

  const startedAt = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  // V13 hardening: count onScriptReady (typically persist-to-Prisma)
  // failures so the caller can surface "scripts generated but none
  // persisted" to the user instead of pretending success.
  let persistFailures = 0;

  // Fire all 6 framework-pinned calls in parallel. Each call uses
  // SINGLE_SCRIPT_JSON_SCHEMA so the response is one well-typed script;
  // we then forward the result to onScriptReady (best-effort) so the
  // caller can persist immediately.
  const results = await Promise.all(
    FRAMEWORK_ORDER.map(async (framework, index) => {
      const userPrompt = buildSingleFrameworkPrompt(input, framework);
      try {
        // V26.8 — dispatch on the env-driven provider. Same prompt +
        // schema feeds both paths; usage shape is identical.
        const { parsed: parsedRegen, usage } =
          provider === 'gemini'
            ? await geminiStructuredCall<LlmRegenResponse>({
                // V26.1 — no `temperature` override on Gemini 3.
                systemInstruction: SCRIPT_SYSTEM_PROMPT,
                userPrompt,
                responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
                model,
              })
            : await openaiStructuredCall<LlmRegenResponse>({
                systemInstruction: SCRIPT_SYSTEM_PROMPT,
                userPrompt,
                responseSchema: SINGLE_SCRIPT_JSON_SCHEMA,
                model,
                temperature: 0.7, // V14 baseline determinism
              });
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
        if (err instanceof GeminiConfigError || err instanceof OpenAiConfigError) {
          // Re-throw config errors — caller decides whether to surface
          // a specific "configure {GEMINI,OPENAI}_API_KEY" message.
          throw err;
        }
        console.warn(
          `[scripts] framework=${framework} ${provider} call failed:`,
          (err as Error).message,
        );
        return null;
      }
    }),
  );

  const successful = results.filter((r): r is GeneratedScript => r !== null);
  if (successful.length === 0) {
    throw new Error('All 6 framework generations failed — check the LLM logs for details.');
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
  // V11 — Product Intelligence block. When present, this is the
  // authoritative input the LLM grounds every script in: dossier,
  // visual analysis, audience inference. The lean ProductInput
  // fields below are kept for back-compat but the LLM is told to
  // PREFER the intelligence block when both are present.
  const intelligenceBlock = p.intelligence
    ? buildIntelligencePromptBlock(p.intelligence)
    : null;

  const lines: (string | null)[] = [
    `שם המוצר: ${p.productName}`,
    p.brand ? `מותג: ${p.brand}` : null,
    p.targetAudience ? `קהל יעד עיקרי: ${p.targetAudience}` : null,
    p.price ? `מחיר: ${p.price}${p.currency ? ' ' + p.currency : ''}` : null,
    modeBlock,
    '',
    'תיאור המוצר:',
    p.description,
    '',
    intelligenceBlock,
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
    // V26.18 — FEATURE FOCUS block. The user picked these in the new
    // wizard step (between Avatar and Script). The LLM is instructed
    // to anchor the ad on them — NOT to enumerate everything from
    // the description. This is the load-bearing fix for "scripts
    // feel industrial / non-human / very AI-y".
    p.selectedFeatures && p.selectedFeatures.length > 0
      ? [
          '',
          '🎯 **תכונות מוצר שעליהן הסרטון חייב להתמקד (FEATURE FOCUS):**',
          ...p.selectedFeatures.map(
            (f, i) => `${i + 1}. ${f.title}${f.hook ? ` — ${f.hook}` : ''}`,
          ),
          '',
          'אל תכלול תכונות אחרות מהמוצר. הסרטון בנוי סביב התכונות שלמעלה בלבד. כל hook, כל סצנה, וה-CTA — חייבים לחזור לתכונות האלו, ספציפית. אל תפזר את התשומת לב על "המוצר באופן כללי".',
          '',
        ].join('\n')
      : null,
    `🎯 **ה-framework לתסריט הזה: ${framework}**`,
    `הנחיה לפריימוורק: ${FRAMEWORK_BRIEF_HEBREW[framework]}`,
    '',
    'הפק עכשיו תסריט אחד בודד בפורמט { "script": {...} } תואם לסכמה — לפי ה-framework שצוין. creative_strategy מלא, 5 hook_options, quality_score עם 12 צירים, וכל סצנה עם המטא-דאטה החדש (environment_type / environment_style / primary_subject / וכו\').',
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
      assumptions: s.creative_strategy.assumptions,
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
      hookStrength: s.quality_score.hook_strength,
      specificity: s.quality_score.specificity,
      israeliAuthenticity: s.quality_score.israeli_authenticity,
      emotionalPull: s.quality_score.emotional_pull,
      visualClarity: s.quality_score.visual_clarity,
      conversionPotential: s.quality_score.conversion_potential,
      ttsNaturalness: s.quality_score.tts_naturalness,
      noGenericCliches: s.quality_score.no_generic_cliches,
      overall: s.quality_score.overall,
      weaknessNote: s.quality_score.weakness_note,
    },
    musicProfile: s.music_profile ?? null,
    regenerated,
    raw: s,
    angle: FRAMEWORK_TO_LEGACY_ANGLE[s.framework] ?? 'problem_solution',
  };
}

// V11 — render the Product Intelligence bundle into a structured user
// prompt block. This is the single biggest creative-quality lever:
// the LLM grounds every script in dossier.painPoints,
// audience.dailyUseMoments, visualAnalysis.activePart, and the
// must-show / must-avoid lists. Scenes that contradict the dossier's
// proof requirements are now visible to the model up front.
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
