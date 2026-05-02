---
slug: v27-script-quality-audit
status: diagnosed
trigger: |
  Current script generation is too slow, too expensive, and low quality. Diagnose
  the current V27 script pipeline after the Gemini→OpenAI revert and Responses API
  migration. Inspect apps/web/lib/llm/scripts.ts, apps/web/lib/llm/openai-script-client.ts,
  packages/prompts/src/script-system-prompt.ts, packages/prompts/src/script-json-schema.ts,
  V14 script fields, Product Intelligence payload size, 6-framework parallel generation,
  selective regen, token usage, prefix-cache behavior, latency, cost attribution, and
  script cohesion. Also diagnose why scene/image prompts sometimes create collage-like
  or multi-panel frames despite the V14 Image Brief and frame-technique system. Do not
  implement yet. Produce evidence-backed bottlenecks and recommended fixes.
created: 2026-05-02
updated: 2026-05-02
goal: find_root_cause_only
diagnose_only: true
---

# Debug Session: V27 Script Pipeline Quality Audit

## Symptoms (prefilled from user)

- **Expected:** Script generation is fast (~5s wall per call after V26.9 Responses API migration), cheap (prefix-cache hits drop input cost ~10x on the 6-batch shared system block), and produces high-quality, cohesive Hebrew UGC scripts that match V5/V6 creative_strategy intent. Scene image generation honors the V14 Image Brief contract and produces single-frame, single-subject 9:16 stills (no collages, no multi-panel comics, no contact-sheet artifacts).
- **Actual:** Script gen feels slow + expensive + low quality. Some scene images come back as collage-like / multi-panel grids despite V14 Image Brief + frame-technique system being in place.
- **Errors:** No hard error reported — quality / latency / cost regression. Likely manifests as: long wall-clock for 6-batch, higher-than-expected token bills on /admin/costs (or vice-versa: under-attribution), repetitive or generic Hebrew copy, scripts that don't honor V6 register lock, scenes returning gpt-image-2 outputs with multi-panel layouts.
- **Timeline:** Suspected since V26.8 (Gemini→OpenAI revert) + V26.9 (Responses API migration). Not isolated to a single commit; user wants a holistic audit of the V27 state.
- **Reproduction:** Generate a script for a project (any URL → /api/projects/[id]/scripts/generate). Observe the 6-framework parallel batch latency in Vercel logs ([TIMING] / [SLOW]). Inspect /admin/costs operation-stats for `openai_script_batch` rows. Read script.rawJson — check creative_strategy, V6 fields (genre, voice_profile, hook_alternatives, israeli_setting_cue), scene Hebrew text quality. For collage issue: generate scene images and check for multi-panel layouts.

## Scope of Investigation

### Script generation (V27 state)
- `apps/web/lib/llm/scripts.ts` — 6-framework parallel batch orchestration, FRAMEWORK_ORDER, selective regen logic
- `apps/web/lib/llm/openai-script-client.ts` — Responses API wrapper (`client.responses.create`, instructions param, `text.format.json_schema`, `output_text` helper, `usage.input_tokens` / `usage.output_tokens`, prefix-cache via cache_control on system block)
- `apps/web/lib/llm/anthropic-script-client.ts` — alternative provider behind `LLM_SCRIPT_PROVIDER` flag (V27.10.6 default Sonnet 4.6 + effort:low + thinking:disabled + prompt caching)
- `apps/web/lib/llm/gemini-client.ts` — preserved Gemini path
- `packages/prompts/src/script-system-prompt.ts` — V6 system prompt (Hebrew + REGISTER LOCK + V5 creative_strategy + V6 structural fields + Israeli realism + Product Intelligence)
- `packages/prompts/src/script-json-schema.ts` — structured-output schema (V5 + V6 nullable fields)
- V14 PR5 fields: genre, voice_profile, hook_alternatives, israeli_setting_cue (8 enum values matching SCENE_PRESETS keys)
- Product Intelligence payload — `lib/product-intelligence/dossier.ts` + `visual-analysis.ts` + `audience-inference.ts`. Need to measure injected token size.
- Selective regen — quality_score < 8 trigger
- Pricing — `lib/usage/pricing.ts` `priceOpenAIText` / `priceAnthropicText` / `priceGeminiText`
- Cost attribution — `lib/usage/cost-attribution.ts` `attributeOpenAITextCost` / `attributeAnthropicTextCost` / `attributeGeminiTextCost`
- Two-phase ApiCall logging — `lib/usage/log.ts`
- Prefix cache — system block `cache_control` (Anthropic), Responses API prompt-cache (OpenAI)

### Scene/image collage problem
- `packages/prompts/src/scene-image-prompts.ts` — avatar + product ref wrapper, PRODUCT_REFERENCE_LOCK paragraph, problem-scene gating
- `apps/web/lib/image-briefs/` — deterministic Image Brief Builder, frame-technique snippets (V14 PR2: mirror_selfie, selfie_handheld, product_hand_hold, safe_reflection, consistency_anchor)
- `apps/web/lib/scene-planning/` — Israeli realism cues (V14 PR1, 794-line library, 51 atomic cues), scene-rules.ts (hands-physics + mirror-safety detectors), israeli-realism-rules.ts
- `apps/web/lib/animation/scene-routing.ts` (if exists) — sceneGenerationType routing
- `apps/web/lib/scenes/generate-impl.ts` — single-pass image gen (V13 PR1 removed the QA loop)
- gpt-image-2 medium 1024×1792 default — known failure modes for multi-panel/collage outputs
- Scene safety — `packages/prompts/src/scene-safety.ts` (23 risky→safe rewrites + modesty tokens)

## Current Focus

```yaml
hypothesis: |
  Multiple compounding factors are degrading the script pipeline simultaneously
  (system prompt bloat from V14 PR5 additions, Product Intelligence dossier injected
  per-call instead of shared via prompt cache, OpenAI Responses API may not be hitting
  prefix cache because instructions/system block varies per-call, structured output
  schema with all the V5+V6 nullable fields is forcing more output tokens than
  necessary, selective-regen threshold may be triggering unnecessarily). The collage
  issue is most likely a missing explicit "single frame, no panels, no comic, no
  contact sheet" negative in the gpt-image-2 prompt OR the V14 frame-technique
  snippets are concatenating into prose that the image model interprets as
  storyboard/multi-shot intent. Will validate each hypothesis with file-level
  evidence (line-counted prompt size, schema field count, real ApiCall costUsd
  samples if accessible, prompt assembly trace for image gen).
test: |
  1. Read each of the listed files and measure: system prompt token estimate (chars/4),
     schema field count, Product Intelligence payload assembly point, whether dossier is
     stuffed into per-call user message vs system block, whether OpenAI Responses API
     `instructions` field actually receives a stable prefix.
  2. Trace one full script-gen call path: actions.ts → scripts.ts → openai-script-client.ts
     → recordApiCallStart → buildSystemPrompt → buildUserMessage → responses.create →
     attributeOpenAITextCost → log success.
  3. Measure realized vs intended prefix cache: identify any per-call mutation in the
     instructions string (timestamps, project-specific data, randomized framework order).
  4. For collage: read scene-image-prompts.ts buildScenePrompt() output for a representative
     scene_generation_type, count the negative-prompt entries that explicitly forbid
     multi-panel / collage / split-screen / comic-strip / contact-sheet / storyboard,
     and measure the assembled prompt length (gpt-image-2 has known degradation past ~4000 chars).
expecting: |
  At least 3 evidence-backed bottlenecks with file:line citations, ranked by impact,
  with concrete recommended fixes. For the collage issue: a specific prompt-assembly
  trace showing where the multi-panel risk enters and the missing negative.
next_action: diagnose only — write Root Cause Report
```

## Evidence

### File-size baseline (measured)
- `packages/prompts/src/script-system-prompt.ts` — 661 lines / 61,913 bytes total. Pure prompt string content (excluding TS wrapper) = **40,308 characters ≈ 10,077 tokens (chars/4) or ~11,517 (chars/3.5 for Hebrew)**.
- `packages/prompts/src/script-json-schema.ts` — 626 lines / 25,684 bytes. JSON.stringify of schema is appended to Anthropic system block (lines 191–203 of `anthropic-script-client.ts`); rough size ~6,000 tokens added.
- `packages/prompts/src/scene-image-prompts.ts` — 308 lines / 19,974 bytes.
- `apps/web/lib/llm/scripts.ts` — 898 lines (note: 41KB / 898 LOC for one orchestrator file is itself a smell).
- `apps/web/lib/scene-planning/israeli-realism-rules.ts` — 923 lines / 40,143 bytes.

### Provider defaults (the actual code path today)
- `apps/web/lib/llm/scripts.ts:42–47` — `resolveScriptProvider()` returns `'openai'` by default; respects `LLM_SCRIPT_PROVIDER=anthropic|gemini` override.
- `apps/web/lib/llm/openai-script-client.ts:43` — `DEFAULT_MODEL = 'gpt-5.4'` (full, not mini). V27.10.18 comment confirms: "gpt-5.4 is ~3x more expensive than gpt-5.4-mini ($2.5/$10 vs $0.75/$4.5 per MTok). A 6-script batch lands ~$0.30 instead of ~$0.10."
- `apps/web/lib/llm/openai-script-client.ts:48–60` — `reasoning.effort = 'low'` and `text.verbosity = 'low'` defaults; both env-overridable.
- `apps/web/lib/llm/anthropic-script-client.ts:79` — `DEFAULT_MODEL = 'claude-sonnet-4-6'` (kept as alternative path; not the primary anymore per V27.10.12).
- `apps/web/lib/usage/pricing.ts:19–43` — pricing table: `gpt-5.4 = $2.5 / $10` per MTok; `gpt-5.4-mini = $0.75 / $4.5`. Numbers consistent with the comment in openai-script-client.ts.

### Prompt-cache behavior — actual vs intended
- `apps/web/lib/llm/openai-script-client.ts:140–156` — Responses API call: `instructions: systemInstruction` (constant module-level `SCRIPT_SYSTEM_PROMPT`), `input: userPrompt` (per-call FRAMEWORK_BRIEF + intelligence + features). The `instructions` field is identical across all 6 batch calls → eligible for OpenAI's automatic prompt caching (~90% input-token discount on cache hits after the first call writes the cache). **WORKS AS INTENDED.**
- `apps/web/lib/llm/anthropic-script-client.ts:191–211` — Anthropic system block built as `${systemInstruction}\n\nOUTPUT FORMAT…\nSCHEMA:\n${JSON.stringify(responseSchema)}` and tagged `cache_control: { type: 'ephemeral' }`. This means Anthropic caches both the system prompt AND the appended JSON-stringified schema — adding ~6K tokens to the cached prefix unnecessarily. The schema doesn't need to live in the cached block; it could be a separate cache_control block (Anthropic supports up to 4 blocks). Inefficient but functional.
- `apps/web/lib/llm/scripts.ts:447–522` — `buildOneCall()` fires 6 calls in `Promise.all`. **The 6 parallel calls all WRITE the cache simultaneously on the first batch**, so the first batch pays full price for all 6. Only subsequent batches within the 5-min window benefit. V27.10.1 comment block (lines 429–446) confirms a "warmup-first" experiment was tried and reverted — there's no architectural way to avoid 6 parallel cache-writes on a fresh batch.

### Actual selective-regen behavior (NOT what the docs say)
- `apps/web/lib/llm/scripts.ts:64` — `const QUALITY_THRESHOLD = 8;` exists.
- `apps/web/lib/llm/scripts.ts:561–574` — `scriptsBelowThreshold` is **only counted, never acted on**. Line 572: `regenCalls: 0, // V6: regen folded into per-framework retry inside generateSingleFrameworkScript`. There is NO branch that re-issues a call when overall < 8. The doc-comment at lines 56–59 ("Selectively regenerates any script whose quality_score.overall < 8") is **stale** since V6 / V27.
- The retry loop at lines 532–553 is only for **null-returning failed calls** (timeout / 5xx), not for low-quality results.
- **Hypothesis 3 (selective regen doubling cost) is ELIMINATED.** Self-rated overall<8 scripts are kept verbatim. The 12 sub-scores were also removed in V27.10.9 (schema trim); see `script-json-schema.ts:512–528` and `scripts.ts:108–139`.

### V6 system prompt size — quantified bloat
- ~10,000–11,500 input tokens per call from `SCRIPT_SYSTEM_PROMPT` alone.
- Sections in the V6 prompt (line ranges from `script-system-prompt.ts`):
  - V6 REGISTER LOCK (Hebrew DO/DON'T) — lines 21–41 (~750 chars)
  - Grammatical gender lock — lines 43–54 (~700 chars)
  - Israeli visual realism — lines 56–83 (~2,000 chars)
  - Creative-strategy 17 fields explanation — lines 85–113 (~3,500 chars)
  - 6 frameworks — lines 115–126 (~2,000 chars)
  - 5 hook archetypes — lines 128–152 (~2,000 chars)
  - Cliché blacklist — lines 154–173 (~1,200 chars)
  - Tone rules — lines 175–191 (~1,000 chars)
  - Specificity quota — lines 193–207 (~1,000 chars)
  - Scene structure narrative — lines 209–223 (~700 chars)
  - 15s vs 30s mode tables — lines 225–267 (~3,500 chars)
  - Product-ad-not-influencer-feed rules — lines 269–301 (~2,000 chars)
  - Per-scene metadata table — lines 303–332 (~3,000 chars)
  - Forbidden / required scene patterns — lines 334–372 (~2,500 chars)
  - TTS rules — lines 374–409 (~3,000 chars)
  - Per-category visual_prompt_english rules — lines 411–456 (~2,500 chars)
  - 2 full example scripts (skincare + cleaning) — lines 458–493 (~3,000 chars)
  - quality_score — lines 495–503 (~700 chars)
  - music_profile rules — lines 505–521 (~1,500 chars)
  - V6 genre / voice_profile / israeli_setting_cue — lines 523–559 (~3,000 chars)
  - **V27.9 NARRATIVE THROUGH-LINE** — lines 561–586 (~2,500 chars; this entire section is fighting a bug that emerged in the same V27.x line)
  - **V27.9 Hebrew correctness** — lines 588–604 (~2,500 chars)
  - **V27.9 frame_strategy** — lines 606–626 (~2,500 chars)
  - Final 30-item self-checklist — lines 628–660 (~3,000 chars)

The prompt accumulated 18 layers of "do this / don't do that". By V27.9 the prompt is patching the prompt — the narrative-link, Hebrew correctness, and frame_strategy sections are responses to *the prior version's* failures.

### V6 schema footprint
- `script-json-schema.ts` defines 6 enums (FRAMEWORKS×6, SCENE_GOALS×6, SCENE_GENERATION_TYPES×12, FACE_VISIBILITY×4, PRIMARY_SUBJECTS×5, PRODUCT_VISIBILITY_PRIORITY×3, CAMERA_FOCUS×5, ENVIRONMENT_TYPES×12, ENVIRONMENT_STYLES×10, GENRES×6, VOICE_PROFILES×8, ISRAELI_SETTING_CUES×8, FRAME_STRATEGIES×7).
- `SCENE_ITEM_SCHEMA` requires **22 fields per scene**, of which:
  - 9 are core narrative (scene_order, scene_goal, spoken_text_hebrew, on_screen_caption_hebrew, visual_prompt_english, camera_direction, performance_note, duration_seconds, narrative_link_from_previous)
  - 8 are structured-routing metadata (scene_generation_type, face_visibility, requires_lip_sync, primary_subject, must_show_product, product_visibility_priority, camera_focus, show_face)
  - 5 are Israeli-realism boilerplate (environment_type, environment_style, israeli_environment_required, local_realism_notes, why_this_scene_exists, israeli_setting_cue, frame_strategy) — 7 actually
- `SCRIPT_ITEM_SCHEMA` requires the script-level fields plus `creative_strategy` (16 sub-fields), `quality_score` (2 fields), `music_profile` (7 fields), `genre`, `voice_profile`. ~30 top-level + nested fields per script.
- For a 5-scene script, that's: 30 (script-level) + 5 × 22 (scenes) = ~140 required fields per script. Multiplied by 6 frameworks in batch = **840 mandatory output fields per generation**. This forces large output token counts; the V27.10.9 trim (12 sub-scores + hook_alternatives + diversity_notes + assumptions) only removed ~5–10% of output tokens.

### Product Intelligence injection — per-call user prompt bloat
- `apps/web/lib/llm/scripts.ts:807–897` — `buildIntelligencePromptBlock()` is rendered into the **user prompt** (NOT into `instructions` / cached system block) on every one of the 6 parallel calls.
- Block contents (lines 836–895):
  - 4 dossier scalar fields rendered inline
  - 11 dossier array fields rendered as bulleted lists (painPoints, desiredOutcomes, purchaseTriggers, mainObjections, usageSteps, mustShowVisuals, mustAvoidVisuals, visualEvidenceRequirements, visualFailureModes, israeliRealismCues, conservativeAssumptions)
  - Visual analysis block (10 fields, 3 of them array)
  - Audience block (6 array fields + 2 scalar)
  - Trailing 7 hard-rule sentences
- Conservative size estimate: a typical product dossier produces 5–15 items per array × 11 arrays × ~80 chars/item ≈ 6,000–10,000 chars per intelligence block.
- **This block is identical across all 6 framework calls but is sent uncached every time.** Multiplying: 6 calls × ~7,500 cached-eligible chars ≈ 45,000 unnecessarily-uncached input chars per batch.
- `apps/web/lib/llm/scripts.ts:599–702` — `buildSingleFrameworkPrompt()` order: featureFocusBlock → productName/brand/audience/price → modeBlock → description → **intelligenceBlock** → category → avatar/gender → framework hint. The intelligence block sits in the middle, defeating any naive prefix-cache attempt on the user prompt.

### V14 PR2 frame-technique snippets — fire conditions
- `apps/web/lib/image-briefs/frame-technique-snippets.ts` — 401 lines / 20,448 bytes. 5 builders (mirror_selfie, selfie_handheld, product_hand_hold, safe_reflection, consistency_anchor).
- `apps/web/lib/image-briefs/image-brief-builder.ts:355–377` — `chooseFrameTechniqueSnippets()` is dispatched and snippet `.positive` strings are appended to `ruleBlocks`; `.negativeLines` are merged into `mustAvoid`.
- These snippets do NOT include any "single frame / no panels / no comic / no collage" negatives. None of the 5 builders mention multi-panel layouts.

### Image-prompt collage negatives — exhaustive search
- Grep for `collage`, `multi-panel`, `multi panel`, `split-screen`, `split screen`, `comic strip`, `contact-sheet`, `grid layout`, `storyboard`, `montage`, `mosaic`, `side-by-side`, `before/after panel`, `panel` (standalone) across `packages/prompts/`, `apps/web/lib/image-briefs/`, `apps/web/lib/scene-planning/`:
  - **Zero results in the image-prompt pipeline.** The only "panel" mentions are about Israeli electric panels (`israeli-realism-rules.ts:140,161,169,233,290`) and the admin debug UI.
- `packages/prompts/src/scene-image-prompts.ts` lines 153–204 — guards exist for: PRODUCT_LED_HERO, NO_FACE_COMPOSITION, HIGH_PRODUCT_VISIBILITY, PRODUCT_REFERENCE_LOCK, ISRAELI_REALISM_BOILERPLATE, REALISM_CHECK, SILENT_TALKING_PLATE. **None of them forbid multi-panel/comic/storyboard layouts.**

### Schema enums that prime collage outputs
- `script-json-schema.ts:47–60` — `SCENE_GENERATION_TYPES` includes `'before_after'` (a layout that, by name, suggests two-state / two-panel imagery).
- `script-json-schema.ts:174–183` — `FRAME_STRATEGIES` includes `'comparison_split'` (literally split-frame language).
- `script-system-prompt.ts:622` — comparison_split row: `"השוואה לקטגוריה אלטרנטיבית | true | high | המוצר חייב לדומיננטי. אם רואים גם את ה'אחר' — שלנו גדול יותר, מואר יותר, חד יותר."` — the system prompt **actively encourages** rendering the alternative product alongside ours, "but make ours bigger / brighter / sharper". For an image model, this is a side-by-side comparison brief.
- `script-system-prompt.ts:141` — hook archetype example: `"before_after: 'תראה את העגבנייה הזאת. יום ראשון מול יום חמישי.'"` (look at this tomato. day 1 vs day 5). When this archetype fires, the LLM writes a `visual_prompt_english` describing a two-state visual — and `buildScenePrompt()` passes it through as `rawVisualBrief` with no negative defending against multi-panel rendering.
- `script-system-prompt.ts:255` — 30s mode table row 3: `"prove_benefit | closeup_product / lifestyle_product / before_after | product | false | 5-7s"` — directly nominates `before_after` as a normal scene type for 30s ads.
- `script-system-prompt.ts:435` — per-category rule: `"home / cleaning — מטבח / סלון / אמבטיה. before/after הוא הסיפור."` (before/after IS the story).
- **Conclusion:** the collage failure mode is not a leak — it's the deterministic outcome of (a) the schema offering `before_after` + `comparison_split` as first-class options, (b) the system prompt actively encouraging them for several frameworks/categories, (c) the LLM transcribing this into English visual prompts ("split shot of the kitchen before and after", "side-by-side: generic shampoo vs our bottle"), and (d) `buildScenePrompt()` having zero defense against multi-panel layouts.

### V13 PR1 removed the post-gen QA loop
- `apps/web/lib/scenes/generate-impl.ts:341–354` — the comment "the post-generation QA evaluator + auto-regen loop has been removed from the active path" confirms there's no second-pass detection of collage outputs. If a collage frame is generated, it persists.

### Scene-prompt assembly is layered without a single-frame guarantee
- `apps/web/lib/scenes/generate-impl.ts:374–408` — `generateSceneImage()` receives `sceneVisualBrief: brief.finalImagePrompt` (the deterministic V11 brief) and the wrapper at `packages/prompts/src/scene-image-prompts.ts:206–303` then prepends `ASPECT_OPENER` ("Raw high-fidelity vertical phone photo, 9:16…"), framing-hint detection, IDENTITY LOCK, productLine, PRODUCT_REFERENCE_LOCK, PRODUCT_LED_GUARD, NO_FACE, HIGH_VISIBILITY, ISRAELI_REALISM_BOILERPLATE, REALISM_CHECK, SILENT_TALKING_PLATE, style line, safety. **None of these layers say "single continuous frame, not a collage / not a multi-panel / not a comic strip / not a contact sheet".** The model receives a vertical-phone-photo opener but no explicit prohibition on multi-panel layouts when the brief uses comparison/before-after language.
- `packages/prompts/src/scene-image-prompts.ts:56–63` — ASPECT_OPENER ('9:16') reads "Raw high-fidelity vertical phone photo" — implies single-frame, but doesn't forbid panels. gpt-image-2 will produce a 9:16 vertical canvas containing multiple panels if the brief asks for two states.

### Latency observations from in-code comments
- `apps/web/lib/llm/scripts.ts:24–35` — V27.10.12 comment block: "gpt-5.4-mini: ~200-300 tok/s, ~25s per call, ~25s wall clock; Sonnet 4.6: ~50 tok/s, ~100s per call, ~100s wall clock". So the **expected** wall-clock for OpenAI default is ~25s, but the user feedback is "too slow".
- `apps/web/lib/llm/anthropic-script-client.ts:50–66` — V27.10.6 live measurement: 1m 39s per call on Sonnet 4.6 (ANTHROPIC path). This was the trigger for V27.10.12's flip back to OpenAI default.
- The full gpt-5.4 model (V27.10.18 default, NOT mini) is meaningfully slower and 3x more expensive than gpt-5.4-mini. Outside the comment block at `openai-script-client.ts:40–43`, no measurement of full-gpt-5.4 latency is in the code.

### Cost-attribution accuracy — verified
- `apps/web/lib/usage/cost-attribution.ts:45–75` — `attributeOpenAiTextCost()` reads `inputTokens` and `outputTokens` from the OpenAI response and computes `priceOpenAiText(model, inputTokens, outputTokens)`. Path is correct: `openai-script-client.ts:188–189` reads `response.usage?.input_tokens` and `response.usage?.output_tokens` from the Responses API and threads them into the same shape `attributeOpenAiTextCost` expects. ✅ accurate.
- `apps/web/lib/usage/pricing.ts:19–43` — pricing table contains `gpt-5.4 = $2.5/$10`, `gpt-5.4-mini = $0.75/$4.5`, `claude-sonnet-4-6 = $3/$15`, `gemini-3-pro-preview = $2/$12`. These match published rates as of 2026-04. ✅ no mis-attribution risk.
- `apps/web/lib/usage/pricing.ts:38–45` — fallback to `gpt-5.4-mini` pricing when an unknown model id leaks through. Conservative; fine.
- `apps/web/lib/usage/cost-attribution.ts:81–109` — Anthropic helper does NOT distinguish cache-read tokens from regular input tokens. `apps/web/lib/llm/anthropic-script-client.ts:264–267` exposes `cacheReadInputTokens` + `cacheCreationInputTokens` from the SDK, but the attribution helper at `cost-attribution.ts:81–109` doesn't read them — it just uses the raw `inputTokens`. **Cost is OVER-attributed for Anthropic** when prompt-caching kicks in (cache reads bill at ~10% of input, cache writes at ~125% — neither matches the flat `priceAnthropicText` formula). Magnitude depends on cache-hit rate but is likely 50–80% over-attribution on warm batches.
- `apps/web/lib/usage/cost-attribution.ts:114–142` — Gemini path is similarly cache-blind (Gemini doesn't expose cache tokens to consumers anyway, so fine).

## Eliminated Hypotheses

1. **HYPOTHESIS 3 — Selective regen doubling cost.** ELIMINATED. `apps/web/lib/llm/scripts.ts:561–574` only *counts* sub-threshold scripts; never re-issues. `regenCalls` is hard-coded `0`. The doc-comment at lines 56–59 is stale.

2. **HYPOTHESIS 5 — Responses API instructions field is mutated per-call.** ELIMINATED. `apps/web/lib/llm/openai-script-client.ts:143` passes the imported module-level constant `SCRIPT_SYSTEM_PROMPT` verbatim. Identical across all 6 calls. OpenAI prompt-caching IS eligible.

3. **HYPOTHESIS 7 — Cost attribution mis-priced.** PARTIALLY ELIMINATED. OpenAI / Gemini paths are accurate. Anthropic path **does** over-attribute on cached calls (ignores cache_read_input_tokens), but Anthropic isn't the active default.

## Resolution

```
# Root Cause Report — V27 Script Pipeline + Collage Audit

## TL;DR

- **Most expensive:** Default model is `gpt-5.4` (full, not mini) — 3.3x cost vs gpt-5.4-mini at the same prompt size. Combined with a 10K-token system prompt (~$0.025/call uncached, ~$0.0025/call cache-hit) and a 6-call cold batch where all 6 calls write the cache simultaneously, a fresh batch costs ~$0.30 instead of ~$0.04. ([apps/web/lib/llm/openai-script-client.ts:43](apps/web/lib/llm/openai-script-client.ts#L43); [apps/web/lib/usage/pricing.ts:27](apps/web/lib/usage/pricing.ts#L27))
- **Most slow:** Per-call output tokens. The schema demands ~30+ top-level + nested fields per script × 5 scenes × 22 mandatory fields per scene → ~140 required fields per script. The V27.9 patches (narrative_link_from_previous + frame_strategy + extra Israeli realism fields) added more required output without removing anything. Output decode is the binding cost on a reasoning model. ([packages/prompts/src/script-json-schema.ts:193–366](packages/prompts/src/script-json-schema.ts#L193); [packages/prompts/src/script-json-schema.ts:368–601](packages/prompts/src/script-json-schema.ts#L368))
- **Most quality-impacting:** The system prompt has accumulated 18 don't-do-this layers over V5–V27.9 and now patches itself (V27.9 narrative_link, Hebrew correctness, frame_strategy are all corrections of regressions the same prompt is causing). Hebrew register loss + non-cohesive scenes are the symptoms; the cause is *prompt entropy* — too many conflicting rails dilute every individual instruction. ([packages/prompts/src/script-system-prompt.ts:561–626](packages/prompts/src/script-system-prompt.ts#L561))

---

## Bottleneck #1: Per-call user prompt bloat — Product Intelligence injected uncached × 6

- **Severity:** critical
- **Impact:** cost, cache-miss, latency
- **Evidence:**
  - `apps/web/lib/llm/scripts.ts:621–622` — `intelligenceBlock = p.intelligence ? buildIntelligencePromptBlock(p.intelligence) : null` is built once per project but inserted into every per-framework user prompt.
  - `apps/web/lib/llm/scripts.ts:807–898` — `buildIntelligencePromptBlock` renders the dossier (32 fields, 11 of them array), visual analysis (10 fields, 3 array), and audience inference (8 fields, 6 array) into bullet lists. Conservative size: 6,000–10,000 chars per intelligence block.
  - `apps/web/lib/llm/scripts.ts:670` — the block lands in the middle of `lines[]`, between `description` and `categoryLabel`. So the leading prefix of the user message differs per framework call (FRAMEWORK_ORDER[i] is shown earlier in the message via featureFocusBlock paths), defeating any user-prompt prefix cache.
  - Net: 6 calls × ~7,500 chars × shared prefix-cache miss = ~12,000 input tokens uncached repeatedly per fresh batch.
- **Recommended fix:** Move the Product Intelligence block out of the per-call user prompt and into a **second cache_control block** (Anthropic) or a **second `instructions` segment** (OpenAI Responses API also caches `instructions`; the field accepts long strings). Concretely:
  - Build the assembled string `[SCRIPT_SYSTEM_PROMPT, '\n\n══ PROJECT INTELLIGENCE ══\n', buildIntelligencePromptBlock(intel)].join('')` ONCE per project (or per `generateScripts()` call) and pass that as `instructions` (OpenAI) / as the cached system block (Anthropic). The per-call user prompt then only contains framework, mode, feature focus, avatar — ~500 tokens instead of ~8,000.
  - Result: cache hit covers ~18K tokens (system + intelligence) instead of ~10K. After warm-up, every batch saves ~$0.10–0.15 in input cost on a typical 12K-intelligence project.
- **Estimated effort:** small (1 file change in `scripts.ts`; the intelligence block builder already exists; just stop concatenating it into the user prompt and concatenate it into `systemInstruction` instead, plumbed through `openaiStructuredCall` / `anthropicStructuredCall` / `geminiStructuredCall`).

---

## Bottleneck #2: System prompt entropy — 18 layered "don't do this" rails

- **Severity:** high
- **Impact:** quality (Hebrew register, scene cohesion), output token bloat (the model now over-explains every commitment to satisfy the 30-item self-checklist), latency
- **Evidence:**
  - `packages/prompts/src/script-system-prompt.ts` is **661 lines / ~10,000 tokens / ~40K chars**. Section breakdown counted in the Evidence section above.
  - V27.9 added three large patch sections (lines 561–626): NARRATIVE THROUGH-LINE, Hebrew correctness, frame_strategy. Each ~2,500 chars. They exist *because* earlier-V27 outputs failed at narrative cohesion / Hebrew grammar / forced product placement. Patching the prompt instead of removing conflicting earlier rails increases noise.
  - The final self-checklist (lines 628–660) has **30 numbered items**. Items 22–30 are V6/V27.9-era; items 1–21 are V5-era. There's no item that says "delete or rewrite the script if your hook reads as US/EU translated copy" — it's a verification list on top of a verification list.
  - The 2 inline example scripts (lines 458–493) themselves consume ~3,000 chars and are pre-V27.9, so they don't demonstrate the new V27.9 fields the model is asked to produce. The model has more written rules than examples.
- **Recommended fix:** Two-step refactor.
  - **Step A (small, immediate):** Move the 30-item self-checklist out of the prompt entirely. Replace with one line: "Before returning, verify all required schema fields are present and that each spoken_text_hebrew passes the V6 register lock from the top of this prompt." Self-checklists this long get partially ignored on long Hebrew completions; what matters is the front-of-prompt instruction.
  - **Step B (medium):** Extract the system prompt into 3 files that compose:
    - `script-system-prompt-core.ts` — the V6 register lock + Hebrew rules + 6 frameworks (~3K tokens, never changes per project)
    - `script-system-prompt-mode.ts` — the 15s/30s mode tables (selected at call-time based on `durationSeconds`)
    - `script-system-prompt-category.ts` — the per-category visual rules (selected at call-time based on `categoryId`)
    Build at most ~5K tokens of system prompt per call, all of which is the *cacheable shared prefix* across the 6 framework calls.
  - Quality lift: removing the 30-item self-checklist alone is expected to free ~500–800 output tokens per script. The model otherwise spends decode time confirming "✅ #5 done, ✅ #14 done…" implicitly via field selection.
- **Estimated effort:** small for Step A (one Write to `script-system-prompt.ts` removing lines 628–660), medium for Step B (3-file split + composer; ~50 LOC).

---

## Bottleneck #3: Output schema demands ~140 mandatory fields per script — output decode dominates wall-clock

- **Severity:** high
- **Impact:** latency (output decode is sequential — each token waits for the previous one), cost
- **Evidence:**
  - `packages/prompts/src/script-json-schema.ts:193–366` — `SCENE_ITEM_SCHEMA` requires 22 fields per scene (was ~12 in V4). Of those 22, **7 are V5/V6 Israeli-realism boilerplate** (environment_type, environment_style, israeli_environment_required, local_realism_notes, why_this_scene_exists, israeli_setting_cue, frame_strategy) that are heavily redundant with the deterministic Image Brief Builder downstream (`apps/web/lib/image-briefs/image-brief-builder.ts:213–234` already builds this from the dossier).
  - `packages/prompts/src/script-json-schema.ts:368–601` — `SCRIPT_ITEM_SCHEMA` requires `creative_strategy` (16 sub-fields), `quality_score` (2 fields), `music_profile` (7 fields), plus 11 top-level scalars. ~36 script-level required values.
  - 5 scenes × 22 + 36 script-level = **146 required fields per script**, × 6 frameworks = **876 mandatory output fields per `/scripts/generate` call**. At ~10–20 tokens per field on average (Hebrew is verbose), output token count is 8K–17K total per batch. With max_tokens=6500 per call (Anthropic), each call is bounded ~5K output tokens — most of the wall-clock.
  - V27.10.9 already trimmed the 12 quality-score sub-scores (`script-json-schema.ts:512–528`). Further cuts are still high-value because each removed field saves ~10–30 output tokens × 6 calls.
  - `narrative_link_from_previous` and `local_realism_notes` and `why_this_scene_exists` — three free-text Hebrew fields per scene that are consumed only by admin debug views (`/admin/scenes/[id]/debug` per V14 PR6). They are not required for the downstream renderer.
- **Recommended fix:** Trim the schema by ~30%, separating "creative-strategy fields the LLM must commit to" from "diagnostic fields admin debug shows":
  - Make these fields nullable (or remove): `local_realism_notes` (already covered by `israeli_setting_cue` + the deterministic Israeli realism block in `image-brief-builder.ts`), `why_this_scene_exists` (admin-only), `local_realism_notes` (already covered upstream), `israeli_environment_required` (default true; only set by hand for travel ads — make it a top-level script flag with default).
  - Drop `narrative_link_from_previous` from the schema; replace with a post-hoc validator pass in `scripts.ts` that does Hebrew-readability check on the assembled spoken_text. The LLM writing a "this scene continues by…" string is busy-work — the model gets the cohesion right or wrong by writing the spoken text, not by writing a meta-description.
  - Move `music_profile` to a separate, much-cheaper post-script call (single `gpt-5.4-mini` call after the 6 frameworks resolve, $0.0005 cost, 1s latency added). Today every framework writes its own music_profile that the user sees only at render time, and they often disagree across the 6 scripts. One picker per project is cleaner.
  - Drop `quality_score` entirely (V27.10.9 already trimmed it to {overall, weakness_note}; nothing user-facing now reads `weakness_note` outside admin debug).
- **Estimated effort:** medium (schema edit + remove the trim'd fields from `LlmScript` / `LlmScene` types in `scripts.ts:111–176` + remove the `toGenerated()` mapper rows that read them in `scripts.ts:724–798`). Light DB schema impact (Scene columns stay; we just stop writing them).

---

## Bottleneck #4: Defaulted to full `gpt-5.4` instead of `gpt-5.4-mini`

- **Severity:** high
- **Impact:** cost (3.3x), latency (modestly worse on full model)
- **Evidence:**
  - `apps/web/lib/llm/openai-script-client.ts:43` — `const DEFAULT_MODEL = 'gpt-5.4';` (V27.10.18). The comment block at lines 31–43 explains: "user explicitly asked for the full gpt-5.4 (not the mini) for higher script-gen quality."
  - `apps/web/lib/usage/pricing.ts:26–27` — `gpt-5.4-mini = $0.75/$4.5` vs `gpt-5.4 = $2.5/$10` per MTok. Output is the binding cost (5x more expensive output rate; 3.3x input).
  - V27.10.12 comment in `scripts.ts:24–35` measured `gpt-5.4-mini` at ~25s wall clock at ~200–300 tok/s, vs Anthropic Sonnet at ~100s. No measurement of full `gpt-5.4` is committed; live anecdote in user feedback ("too slow") is consistent with full-model running at 50–100 tok/s on long Hebrew JSON.
- **Recommended fix:**
  - **Option A (default action):** Switch `DEFAULT_MODEL = 'gpt-5.4-mini'`. The V14's calque concern (lines 8–12 of anthropic-script-client.ts) is a real quality risk on `mini`, but Bottleneck #2 fix (prompt simplification) + Bottleneck #1 fix (intelligence in cached prefix) make the prompt's instruction-following easier and `mini` should hold register acceptably for the price.
  - **Option B (if the user's quality lift on full `gpt-5.4` is real and measurable):** Keep `gpt-5.4` as default, but reduce verbosity (`text.verbosity = 'low'` is already set, line 60) AND reduce output footprint via Bottleneck #3. Net: full-model quality at near-mini cost.
  - **Option C (A/B with an env flag):** `OPENAI_SCRIPT_MODEL` is already env-overridable. Document the trade-off in CLAUDE.md and let the user flip per-deploy.
- **Estimated effort:** trivial (1-line change + CLAUDE.md note).

---

## Bottleneck #5: Anthropic schema appended to cached system block (wasted ~6K tokens) + cache_read tokens not honored in cost attribution

- **Severity:** medium
- **Impact:** cost (Anthropic path only — currently behind LLM_SCRIPT_PROVIDER=anthropic), reporting accuracy
- **Evidence:**
  - `apps/web/lib/llm/anthropic-script-client.ts:191–211` — the JSON-stringified schema is concatenated into `systemWithSchema` and then put inside the single ephemeral cache_control block. This works but doubles the cache footprint without need; Anthropic supports up to 4 separate cache_control blocks, so the schema could live in its own.
  - More importantly: the schema is the same 6KB across all callers; bundling it with the system prompt means a future change to the system prompt invalidates the schema's cached state and vice-versa. Two-block separation is more cache-stable.
  - `apps/web/lib/llm/anthropic-script-client.ts:264–267` — the SDK's `usage.cache_read_input_tokens` and `cache_creation_input_tokens` ARE captured into the `AnthropicUsage` shape, but `apps/web/lib/usage/cost-attribution.ts:81–109` does not read them. It just calls `priceAnthropicText(model, inputTokens, outputTokens)`, which treats every input token at the full input rate.
  - On Sonnet 4.6 cache-read tokens bill at ~10% of input; cache-write tokens at ~125%. Without honoring this, /admin/costs OVER-attributes ~50–80% on warm batches under the Anthropic path.
- **Recommended fix:**
  - **Step A:** In `cost-attribution.ts:81–109`, take cacheReadInputTokens and cacheCreationInputTokens; bill cache reads at `0.1 × input_rate`, cache writes at `1.25 × input_rate`, and remaining input at full rate. Persist all three separately into `ApiCall.metadata` for forensics.
  - **Step B (when Anthropic path is in use):** Split the cached system block into two `cache_control: ephemeral` blocks: `[SCRIPT_SYSTEM_PROMPT, schemaJson]`. This keeps writes/invalidations independent.
- **Estimated effort:** small (cost-attribution.ts already has the right shape; just thread through 2 more numbers).

---

## Collage / Multi-Panel Image Issue

- **Root cause:** The image-prompt pipeline never explicitly forbids multi-panel layouts, AND the upstream schema + system prompt actively encourage two-state visual prompts via `before_after`, `comparison_split`, and the "before/after is the story" category rule. When the LLM commits a scene to one of those types, it writes a `visual_prompt_english` that describes two moments / two states / side-by-side comparisons. `buildScenePrompt()` passes that text through to gpt-image-2 as `rawVisualBrief`, prepended only by `ASPECT_OPENER` ("Raw high-fidelity vertical phone photo, 9:16, eye-level..."), IDENTITY_LOCK, PRODUCT_REFERENCE_LOCK, ISRAELI_REALISM_BOILERPLATE, REALISM_CHECK. None of those layers say "single continuous frame, not a collage". gpt-image-2 then renders the requested two-state composition as a multi-panel layout — which is the only way to satisfy "before AND after" inside one image.

  Cited evidence:
  - `packages/prompts/src/script-json-schema.ts:47–60` — `before_after` is one of 12 SCENE_GENERATION_TYPES.
  - `packages/prompts/src/script-json-schema.ts:174–183` — `comparison_split` is one of 7 FRAME_STRATEGIES, with description "compares the product to a category alternative".
  - `packages/prompts/src/script-system-prompt.ts:141` — example hook: "תראה את העגבנייה הזאת. יום ראשון מול יום חמישי" (look at this tomato. day 1 vs day 5).
  - `packages/prompts/src/script-system-prompt.ts:255` — 30s mode table nominates `before_after` for prove_benefit scenes.
  - `packages/prompts/src/script-system-prompt.ts:435` — per-category rule for home/cleaning: "before/after is the story".
  - `packages/prompts/src/script-system-prompt.ts:620,624` — comparison_split row of frame_strategy table actively says: "the product MUST be dominant. If you also see the 'other' — ours bigger, brighter, sharper". This is a side-by-side composition brief.
  - `packages/prompts/src/scene-image-prompts.ts:206–303` — `buildScenePrompt()` returns only single-frame guarantees implied by `ASPECT_OPENER`, never explicit anti-panel negatives.
  - `apps/web/lib/image-briefs/image-brief-builder.ts:300–301` — `negativeConstraints = [...mustAvoid]`. The mustAvoid feed comes from dossier + visual + Israeli realism. None of them forbid panels (verified by grep across `packages/prompts/`, `apps/web/lib/image-briefs/`, `apps/web/lib/scene-planning/` — zero matches for collage|multi-panel|split-screen|comic|contact-sheet|storyboard|montage|mosaic|side-by-side|panel layout).

- **Why V14 frame-technique didn't prevent it:** The 5 frame-technique snippets (`mirror_selfie` / `selfie_handheld` / `product_hand_hold` / `safe_reflection` / `consistency_anchor`) target specific failure modes that are *orthogonal* to the multi-panel problem:
  - mirror_selfie + selfie_handheld are about phone-grip + reflection physics
  - product_hand_hold is about anatomical 5-finger grip
  - safe_reflection is about avoiding recognizable-second-scene reflections
  - consistency_anchor is about same-person across all scenes

  None of them dispatch on `scene_generation_type === 'before_after'` or on `frame_strategy === 'comparison_split'`. The detector at `image-briefs/frame-technique-snippets.ts` doesn't know those values exist. Result: a scene with `sceneGenerationType='before_after'` flows through the brief builder, gets PRODUCT_LED_GUARD + REALISM_CHECK + ISRAELI_REALISM, but no anti-collage instruction.

- **Top 3 recommended fixes (ranked):**

  1. **Add an explicit single-frame guarantee + collage negative to every gpt-image-2 prompt.** In `packages/prompts/src/scene-image-prompts.ts`, add a new universal block (insert after `ASPECT_OPENER` and before `IDENTITY_LOCK`):
     ```
     SINGLE-FRAME RULE (mandatory):
     - This is ONE continuous photograph — a single moment captured by a single camera.
     - Absolutely NO multi-panel layout, NO split-screen, NO before/after panels side-by-side, NO comic strip, NO contact sheet, NO storyboard, NO grid, NO collage, NO photo mosaic, NO inset image-within-image. The frame is one rectangle of one moment.
     - If the brief refers to "before and after" or "comparison" or "vs", render only ONE state — pick the after / improved / proof state and show it cleanly. Two-state visuals belong to two scenes, not two panels in one frame.
     ```
     Apply to both code paths (`avatarPresent === true` branch lines 230–280 and `avatarPresent === false` branch lines 283–303). Verified low-conflict: nothing else in the prompt asks for panels.

  2. **Stop emitting two-state language upstream.** In `packages/prompts/src/script-system-prompt.ts`:
     - Remove `before_after` from SCENE_GENERATION_TYPES (`script-json-schema.ts:47–60`). Keep the underlying creative beat but route it through two scenes (one `closeup_product` for the proof state, one `lifestyle_product` for the result) instead of a single frame.
     - Remove `comparison_split` from FRAME_STRATEGIES (`script-json-schema.ts:174–183`). Replace with `comparison_focus` — "the product is sharply lit; if any alternative is in the frame, it's dim, soft, and out of focus" — without the "split" word that the LLM transcribes into split-frame language.
     - Edit `script-system-prompt.ts:141` (the `before_after` hook archetype example) and `script-system-prompt.ts:435` (the home/cleaning category rule) to reframe "before/after is the story" as a *narrative* device across scenes, not a single-image device.
  
  3. **Add a brief-builder dispatch on `before_after` / `comparison_split`** that explicitly emits the SINGLE-FRAME RULE *plus* injects an extra `mustAvoid: ['split-screen layout', 'before-and-after panel composition', 'side-by-side comparison frame']` for these scene types — even if Fix #2 isn't done yet, this catches the in-DB scripts already written with these types.

  After Fix #1 alone, gpt-image-2 will reliably refuse to render multi-panel outputs even when the brief still asks for "before and after" — single-frame negatives are heavily weighted by the model. Fix #2 is the durable solution; Fix #3 is the migration bridge.

## Open Questions for User

1. **Quality preference for default model:** Is the user's preference for `gpt-5.4` (full) over `gpt-5.4-mini` based on a measurable creative quality lift (sample comparison) or on intuition? If the user has a side-by-side, we can keep `gpt-5.4` and pursue Bottleneck #3's schema trim for the speed/cost win without sacrificing the bigger model. If not, switching to `gpt-5.4-mini` plus Bottleneck #2 prompt-simplification is the highest-EV move.

2. **Per-scene `narrative_link_from_previous` removal:** This field was added in V27.9 to fight scene-to-scene incoherence. Removing it from the schema means the LLM stops writing the meta-link, but the actual cohesion is determined by what `spoken_text_hebrew` says — which is independent of whether a meta-description is also produced. Is the user attached to seeing the link string in admin/debug or is the value purely diagnostic?

3. **`before_after` / `comparison_split` removal vs hardening:** Fix #2 in the collage section deletes two enum values that the system prompt currently encourages. Some product categories (cleaning, supplements) may legitimately benefit from the *creative beat* "show what was, show what is" — but split across two scenes, not within one frame. Confirm the user is OK with that re-architecture before deleting the enum values.
```
