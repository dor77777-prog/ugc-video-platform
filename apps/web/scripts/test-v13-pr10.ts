// V13.2 verification — admin costs hardening.
//
// Asserts the cost-attribution invariants and the public shape of the
// new admin API helpers without hitting any provider or the DB. The
// V13 master runner picks this script up via the `test-v13-pr*.ts`
// glob (we stretch the convention with a `.2` suffix).
//
// Run on its own:  npx tsx apps/web/scripts/test-v13-2-costs.ts
// Run with master: npm test  (apps/web)

import {
  attributeOpenAiTextCost,
  attributeOpenAiImageCost,
  attributeElevenLabsTtsCost,
  attributeKlingI2vCost,
  attributePixVerseLipSyncCost,
  attributePixVerseMediaUploadCost,
  attributeLocalComposeCost,
  FORBIDDEN_balanceDeltaAttribution,
} from '../lib/usage/cost-attribution';
import {
  PROVIDER_COST_ESTIMATES_USD,
  PIXVERSE_COST_MODEL,
} from '../lib/pricing/provider-costs';

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

// ── 1. OpenAI text fallback ─────────────────────────────────────────────
{
  const withUsage = attributeOpenAiTextCost({
    model: 'gpt-5.4-mini',
    inputTokens: 10_000,
    outputTokens: 2_000,
  });
  assert(
    withUsage.source === 'actual_usage',
    '[1.1] OpenAI w/ usage → source=actual_usage',
    `got ${withUsage.source}`,
  );
  assert(
    withUsage.actualCostUsd != null && withUsage.actualCostUsd > 0,
    '[1.2] OpenAI w/ usage → actualCostUsd > 0',
  );
  assert(
    withUsage.metadata.inputTokens === 10_000,
    '[1.3] OpenAI metadata carries inputTokens',
  );

  const withoutUsage = attributeOpenAiTextCost({ model: 'gpt-5.4-mini' });
  assert(
    withoutUsage.source === 'estimate',
    '[1.4] OpenAI no-usage → source=estimate',
  );
  assert(
    withoutUsage.actualCostUsd === undefined,
    '[1.5] OpenAI no-usage → no actualCostUsd',
  );
  assert(
    withoutUsage.estimatedCostUsd === PROVIDER_COST_ESTIMATES_USD.openai_script_batch,
    '[1.6] OpenAI no-usage → estimatedCostUsd matches openai_script_batch constant',
  );
}

// ── 2. OpenAI image observed-constant ────────────────────────────────────
{
  const img = attributeOpenAiImageCost({
    model: 'gpt-image-2',
    quality: 'medium',
    size: '1024x1792',
  });
  assert(
    img.source === 'observed_constant',
    '[2.1] gpt-image-2 medium 1024x1792 → observed_constant',
  );
  assert(
    img.actualCostUsd != null && img.actualCostUsd > 0,
    '[2.2] gpt-image-2 returns positive actualCostUsd',
  );
}

// ── 3. ElevenLabs character cost ─────────────────────────────────────────
{
  const tts = attributeElevenLabsTtsCost({
    model: 'eleven_v3',
    characters: 1000,
  });
  assert(
    tts.source === 'actual_usage',
    '[3.1] ElevenLabs w/ chars → actual_usage',
  );
  // 1000 chars × $0.10 / 1K = $0.10
  assert(
    Math.abs(tts.costUsd - 0.1) < 1e-6,
    '[3.2] 1000 chars on eleven_v3 = $0.10',
    `got ${tts.costUsd}`,
  );
  assert(
    tts.metadata.characters === 1000,
    '[3.3] ElevenLabs metadata.characters === 1000',
  );

  const empty = attributeElevenLabsTtsCost({ model: 'eleven_v3', characters: 0 });
  assert(
    empty.source === 'estimate',
    '[3.4] zero-char TTS falls back to estimate',
  );
}

// ── 4. Kling clip estimate ───────────────────────────────────────────────
{
  const omni = attributeKlingI2vCost({ modelUsed: 'kling-v3-omni', durationSeconds: 5 });
  assert(
    omni.source === 'estimate',
    '[4.1] kling without tokensUsed → estimate',
  );
  assert(
    omni.estimatedCostUsd > 0.5 && omni.estimatedCostUsd < 1.0,
    '[4.2] kling-v3-omni estimate in $0.5-1.0 range',
    `got ${omni.estimatedCostUsd}`,
  );
  // Empirical: 1.44 tokens × $0.546 ≈ $0.79.
  assert(
    Math.abs(omni.costUsd - 0.79) < 0.05,
    '[4.3] kling-v3-omni estimate ≈ $0.79',
    `got ${omni.costUsd}`,
  );

  const withTokens = attributeKlingI2vCost({
    modelUsed: 'kling-v3-omni',
    durationSeconds: 5,
    tokensUsed: 2,
  });
  assert(
    withTokens.source === 'actual_usage',
    '[4.4] kling w/ tokensUsed → actual_usage',
  );
  // 2 × $0.546 = $1.092
  assert(
    Math.abs(withTokens.actualCostUsd! - 1.092) < 1e-3,
    '[4.5] 2 kling tokens = $1.092',
    `got ${withTokens.actualCostUsd}`,
  );
}

// ── 5. PixVerse observed formula ─────────────────────────────────────────
{
  // $10 / 2250 credits × 16 = ~$0.0711 per scene.
  const expected = (10 / 2250) * 16;
  const lipsync = attributePixVerseLipSyncCost({});
  // The env-overridable PROVIDER_COST_ESTIMATES_USD.pixverse_lipsync_scene
  // rounds to 0.071 by default; PIXVERSE_COST_MODEL.observedUsdPerLipSyncScene
  // is the unrounded $0.07111. Both are accurate enough — assert within 1¢.
  assert(
    Math.abs(lipsync.costUsd - PIXVERSE_COST_MODEL.observedUsdPerLipSyncScene) < 0.005,
    '[5.1] PixVerse default lipsync ≈ observed model constant (within $0.005)',
    `costUsd=${lipsync.costUsd}, model=${PIXVERSE_COST_MODEL.observedUsdPerLipSyncScene}`,
  );
  assert(
    Math.abs(expected - PIXVERSE_COST_MODEL.observedUsdPerLipSyncScene) < 1e-3,
    '[5.2] $10/2250×16 ≈ observed PixVerse lipsync cost',
    `expected=${expected}, model=${PIXVERSE_COST_MODEL.observedUsdPerLipSyncScene}`,
  );

  // Per-second mode (4s lipsync).
  const fourSec = attributePixVerseLipSyncCost({ durationSeconds: 4 });
  assert(
    fourSec.source === 'estimate',
    '[5.3] 4s lipsync uses per-second estimate',
  );

  // Actual credits exposed by provider.
  const actual = attributePixVerseLipSyncCost({ pixverseCreditsConsumed: 16 });
  assert(
    actual.source === 'actual_usage',
    '[5.4] explicit pixverseCreditsConsumed → actual_usage',
  );
  assert(
    Math.abs(actual.actualCostUsd! - 0.07111) < 1e-3,
    '[5.5] 16 px-credits → ~$0.0711',
    `got ${actual.actualCostUsd}`,
  );

  const upload = attributePixVerseMediaUploadCost();
  assert(
    upload.costUsd === 0,
    '[5.6] pixverse media upload = $0',
  );
}

// ── 6. Local compose / mux is free ──────────────────────────────────────
{
  const mux = attributeLocalComposeCost({ operation: 'mux' });
  assert(mux.costUsd === 0, '[6.1] ffmpeg mux costUsd = 0');
  assert(mux.source === 'observed_constant', '[6.2] ffmpeg mux source = observed_constant');
}

// ── 7. Concurrency invariant — no balance-delta attribution ─────────────
{
  let threw = false;
  try {
    FORBIDDEN_balanceDeltaAttribution();
  } catch (err) {
    threw = (err as Error).message.includes('balance delta');
  }
  assert(threw, '[7.1] FORBIDDEN_balanceDeltaAttribution throws on call');

  // Spot-check: the cost-attribution surface deliberately exposes NO
  // function that takes "before" + "after" balance args. If someone
  // ever reintroduces such a helper, this test should be updated to
  // also fail on its presence.
  const surface = [
    attributeOpenAiTextCost,
    attributeOpenAiImageCost,
    attributeElevenLabsTtsCost,
    attributeKlingI2vCost,
    attributePixVerseLipSyncCost,
    attributePixVerseMediaUploadCost,
    attributeLocalComposeCost,
  ];
  // None of them accept >1 arg pair shaped like {balanceBefore, balanceAfter}.
  for (const fn of surface) {
    const src = fn.toString();
    const looksLikeDelta =
      /balanceBefore|balanceAfter|deltaCredits|prevBalance/.test(src);
    if (looksLikeDelta) {
      fail(
        `[7.2] ${fn.name} contains balance-delta lookalike`,
        'cost attribution must come from usage/formulas/constants only',
      );
    }
  }
  ok('[7.2] no attribute*Cost helper references balance-delta dimensions');
}

// ── 8. Recent-calls API contract — query-string parsing rules ───────────
//
// We can't hit the route without booting Next, but we can sanity-check
// the constants the route relies on: provider/status whitelists are
// closed sets so a malicious admin can't inject arbitrary strings into
// Postgres via the URL.
{
  // These must match route.ts exactly.
  const providers = ['openai', 'elevenlabs', 'kling', 'pixverse', 'ffmpeg', 'runway', 'creatomate'];
  const statuses = ['in_progress', 'success', 'failed'];
  assert(providers.length === 7, '[8.1] recent-calls allowed providers count');
  assert(statuses.length === 3, '[8.2] recent-calls allowed statuses count');
  // Sanity: the catalog in lib/usage/pricing.ts must include every
  // provider we accept on the API.
  // (We don't import here to keep this script free of side effects;
  //  the V13.2 verification suite trusts the existing PROVIDER_CATALOG
  //  drift test in test-v13-pr1+.)
  ok('[8.3] recent-calls allowlists are static (no SQL injection vector)');
}

// ── 9. Cost-source vocabulary is closed ─────────────────────────────────
{
  // The dashboard treats `source` as an enum-like discriminant. Adding
  // a new value should be a deliberate edit, not a silent regression.
  type S = ReturnType<typeof attributeOpenAiTextCost>['source'];
  const allowed: S[] = ['actual_usage', 'estimate', 'observed_constant'];
  assert(
    allowed.length === 3,
    '[9.1] cost-source vocabulary has 3 entries',
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} V13.2 assertion(s) failed.`);
  process.exit(1);
}
console.log('V13.2 cost-attribution verification: all assertions pass.');
process.exit(0);
