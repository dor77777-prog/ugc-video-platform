// V14 PR5 verification — Hebrew script V6 system prompt + schema extensions.
//
// Covers:
//   1. System prompt has the V6 register-lock section + key anchors
//   2. New schema enums exported: GENRES_LIST, VOICE_PROFILES_LIST,
//      ISRAELI_SETTING_CUES_LIST
//   3. The 8 cue IDs match V14 PR1's SCENE_PRESETS keys (single namespace)
//   4. The 6 genres have a 1:1 conceptual mapping to the 6 frameworks
//   5. Schema includes the new fields in the right `required` arrays
//   6. The system prompt mentions all the V6 contracts (genre, voice_profile,
//      hook_alternatives, israeli_setting_cue)
//   7. Final checklist mentions the V6 fields
//   8. Back-compat: V5 fields still required (creative_strategy, hook_options,
//      etc. all present in the schema)

import {
  SCRIPT_SYSTEM_PROMPT,
  SCRIPT_JSON_SCHEMA,
  SINGLE_SCRIPT_JSON_SCHEMA,
  GENRES_LIST,
  VOICE_PROFILES_LIST,
  ISRAELI_SETTING_CUES_LIST,
  CAMERA_FOCUS_LIST,
  SCRIPT_FRAMEWORKS,
} from '@ugc-video/prompts';
import { SCENE_PRESETS } from '../lib/scene-planning/israeli-realism-rules';

let failures = 0;
function ok(name: string) {
  console.log(`✓ ${name}`);
}
function fail(name: string, detail: string) {
  failures++;
  console.error(`✗ ${name}\n   ${detail}`);
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name);
  else fail(name, detail);
}

// ── 1. V6 register-lock section is present ─────────────────────────────────
{
  assert(
    SCRIPT_SYSTEM_PROMPT.includes('V6 — REGISTER LOCK'),
    '[V14 PR5.1] system prompt contains V6 — REGISTER LOCK section header',
  );
  // Concrete anchors that distinguish the influencer voice
  assert(
    SCRIPT_SYSTEM_PROMPT.includes('תכל'),
    '[V14 PR5.1] register-lock cites תכל\'ס as canonical influencer language',
  );
  assert(
    /סבבה|אחותי|וואלה/.test(SCRIPT_SYSTEM_PROMPT),
    '[V14 PR5.1] register-lock cites at least one of: סבבה / אחותי / וואלה',
  );
  // The "do not sound like translated American" warning
  assert(
    /אובססיבית|מתורגם|אמריקני/.test(SCRIPT_SYSTEM_PROMPT),
    '[V14 PR5.1] register-lock warns against translated-American voice',
  );
}

// ── 2. New enum lists exported ──────────────────────────────────────────────
{
  assert(
    Array.isArray(GENRES_LIST) && GENRES_LIST.length === 6,
    '[V14 PR5.2] GENRES_LIST exported with 6 entries',
  );
  assert(
    Array.isArray(VOICE_PROFILES_LIST) && VOICE_PROFILES_LIST.length === 8,
    '[V14 PR5.2] VOICE_PROFILES_LIST exported with 8 entries',
  );
  assert(
    Array.isArray(ISRAELI_SETTING_CUES_LIST) &&
      ISRAELI_SETTING_CUES_LIST.length === 8,
    '[V14 PR5.2] ISRAELI_SETTING_CUES_LIST exported with 8 entries',
  );

  // The 6 expected genres
  const expectedGenres = [
    'problem_solution',
    'ugc_review_mock_confession',
    'listicle',
    'day_in_the_life',
    'comparison',
    'tutorial',
  ];
  for (const g of expectedGenres) {
    assert(
      (GENRES_LIST as readonly string[]).includes(g),
      `[V14 PR5.2] GENRES_LIST contains "${g}"`,
    );
  }

  // The 8 voice profiles
  const expectedVoices = [
    'young_female_warm',
    'young_female_energetic',
    'young_male_warm',
    'young_male_energetic',
    'mature_female_authoritative',
    'mature_female_intimate',
    'mature_male_authoritative',
    'mature_male_intimate',
  ];
  for (const v of expectedVoices) {
    assert(
      (VOICE_PROFILES_LIST as readonly string[]).includes(v),
      `[V14 PR5.2] VOICE_PROFILES_LIST contains "${v}"`,
    );
  }
}

// ── 3. Cue IDs match PR1 SCENE_PRESETS keys (single namespace) ─────────────
{
  const sceneIdsFromPresets = Object.keys(SCENE_PRESETS).sort();
  const sceneIdsFromSchema = [...ISRAELI_SETTING_CUES_LIST].sort();
  assert(
    JSON.stringify(sceneIdsFromPresets) === JSON.stringify(sceneIdsFromSchema),
    '[V14 PR5.3] script-schema ISRAELI_SETTING_CUES_LIST exactly matches israeli-realism-rules.SCENE_PRESETS keys',
    `presets: ${JSON.stringify(sceneIdsFromPresets)}\n   schema: ${JSON.stringify(sceneIdsFromSchema)}`,
  );
}

// ── 4. 6 genres + 6 frameworks (1:1 conceptual mapping) ────────────────────
{
  assert(
    SCRIPT_FRAMEWORKS.length === 6,
    '[V14 PR5.4] SCRIPT_FRAMEWORKS still has 6 entries (back-compat)',
  );
  assert(
    GENRES_LIST.length === 6,
    '[V14 PR5.4] GENRES_LIST has 6 entries (1:1 with frameworks)',
  );
}

// ── 5. Schema includes the new fields in `required` ────────────────────────
{
  // The script schema's structure is nested. Reach in to find:
  //   SCRIPT_JSON_SCHEMA.scripts.items.required → must include genre,
  //   voice_profile, hook_alternatives
  //   SCRIPT_JSON_SCHEMA.scripts.items.properties.scenes.items.required
  //   → must include israeli_setting_cue

  const root = SCRIPT_JSON_SCHEMA as unknown as {
    properties: {
      scripts: {
        items: {
          required: string[];
          properties: {
            scenes: {
              items: { required: string[] };
            };
          };
        };
      };
    };
  };
  const scriptRequired = root.properties.scripts.items.required;
  assert(
    scriptRequired.includes('genre'),
    '[V14 PR5.5] script-level required[] includes "genre"',
  );
  assert(
    scriptRequired.includes('voice_profile'),
    '[V14 PR5.5] script-level required[] includes "voice_profile"',
  );
  assert(
    scriptRequired.includes('hook_alternatives'),
    '[V14 PR5.5] script-level required[] includes "hook_alternatives"',
  );

  const sceneRequired = root.properties.scripts.items.properties.scenes.items.required;
  assert(
    sceneRequired.includes('israeli_setting_cue'),
    '[V14 PR5.5] scene-level required[] includes "israeli_setting_cue"',
  );

  // Single-script schema wraps the same item schema under {script: ...}.
  const singleRoot = SINGLE_SCRIPT_JSON_SCHEMA as unknown as {
    properties: {
      script: {
        required: string[];
        properties: {
          scenes: { items: { required: string[] } };
        };
      };
    };
  };
  const singleScript = singleRoot.properties.script;
  assert(
    singleScript.required.includes('genre'),
    '[V14 PR5.5] SINGLE_SCRIPT_JSON_SCHEMA script.required includes "genre"',
  );
  assert(
    singleScript.required.includes('voice_profile'),
    '[V14 PR5.5] SINGLE_SCRIPT_JSON_SCHEMA script.required includes "voice_profile"',
  );
  assert(
    singleScript.required.includes('hook_alternatives'),
    '[V14 PR5.5] SINGLE_SCRIPT_JSON_SCHEMA script.required includes "hook_alternatives"',
  );
  assert(
    singleScript.properties.scenes.items.required.includes('israeli_setting_cue'),
    '[V14 PR5.5] SINGLE_SCRIPT_JSON_SCHEMA scene required includes "israeli_setting_cue"',
  );
}

// ── 6. System prompt mentions the V6 contracts ─────────────────────────────
{
  assert(
    /\bgenre\b/.test(SCRIPT_SYSTEM_PROMPT),
    '[V14 PR5.6] system prompt mentions "genre"',
  );
  assert(
    /voice_profile/.test(SCRIPT_SYSTEM_PROMPT),
    '[V14 PR5.6] system prompt mentions "voice_profile"',
  );
  assert(
    /hook_alternatives/.test(SCRIPT_SYSTEM_PROMPT),
    '[V14 PR5.6] system prompt mentions "hook_alternatives"',
  );
  assert(
    /israeli_setting_cue/.test(SCRIPT_SYSTEM_PROMPT),
    '[V14 PR5.6] system prompt mentions "israeli_setting_cue"',
  );

  // Each of the 8 scene-preset IDs is mentioned by name in the prompt
  // (so the LLM knows the canonical vocabulary).
  for (const cue of ISRAELI_SETTING_CUES_LIST) {
    assert(
      SCRIPT_SYSTEM_PROMPT.includes(cue),
      `[V14 PR5.6] system prompt mentions cue "${cue}" by name`,
    );
  }

  // Each of the 6 genre IDs is mentioned
  for (const g of GENRES_LIST) {
    assert(
      SCRIPT_SYSTEM_PROMPT.includes(g),
      `[V14 PR5.6] system prompt mentions genre "${g}" by name`,
    );
  }
}

// ── 7. Final checklist mentions V6 fields ──────────────────────────────────
{
  // The 22-26 numbered checklist items at the end of the prompt should
  // include the V6 anchors so the LLM doesn't drop them on a long generation.
  const tail = SCRIPT_SYSTEM_PROMPT.slice(-2500);
  assert(
    /V6 register lock/i.test(tail),
    '[V14 PR5.7] final checklist references V6 register lock',
  );
  assert(
    /V6 genre/.test(tail),
    '[V14 PR5.7] final checklist references V6 genre',
  );
  assert(
    /V6 voice_profile/.test(tail),
    '[V14 PR5.7] final checklist references V6 voice_profile',
  );
  assert(
    /V6 hook_alternatives/.test(tail),
    '[V14 PR5.7] final checklist references V6 hook_alternatives',
  );
  assert(
    /V6 israeli_setting_cue/.test(tail),
    '[V14 PR5.7] final checklist references V6 israeli_setting_cue per scene',
  );
}

// ── 8. Back-compat — V5 contracts still in place ──────────────────────────
{
  const root = SCRIPT_JSON_SCHEMA as unknown as {
    properties: {
      scripts: {
        items: { required: string[] };
      };
    };
  };
  const scriptRequired = root.properties.scripts.items.required;
  for (const v5 of [
    'creative_strategy',
    'hook_options',
    'selected_hook',
    'cta',
    'estimated_duration_seconds',
    'scenes',
    'quality_score',
    'music_profile',
  ]) {
    assert(
      scriptRequired.includes(v5),
      `[V14 PR5.8] V5 required field "${v5}" preserved`,
    );
  }

  // CAMERA_FOCUS still includes selfie_in_mirror from PR2.
  assert(
    (CAMERA_FOCUS_LIST as readonly string[]).includes('selfie_in_mirror'),
    '[V14 PR5.8] PR2 camera_focus="selfie_in_mirror" still present',
  );
}

console.log('');
if (failures === 0) {
  console.log('V14 PR5 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR5 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
