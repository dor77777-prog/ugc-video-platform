// V14 PR6 verification — admin debug surfacing.
//
// Doesn't render the page (would need a Next.js test harness); instead
// asserts the static expectations:
//   1. apps/web/app/(admin)/admin/scenes/[id]/debug/page.tsx exists and
//      has the V14 PR1-PR5 surfacing block (key labels visible)
//   2. The page reads imageBriefJson, project.productData.lockedOutfit,
//      and script.rawJson — the three sources V14 fields live in
//   3. apps/web/app/(admin)/admin/projects/[id]/diagnostic/page.tsx
//      exists, builds a SceneVariationLedger from sibling scenes, and
//      surfaces the per-script summary
//   4. Both pages handle the "no V14 data yet" graceful path (legacy
//      scenes without persisted V14 fields render — symbol or '— line)

import * as fs from 'node:fs';
import * as path from 'node:path';
import { SceneVariationLedger } from '../lib/image-briefs/scene-variation-ledger';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCENE_DEBUG_PAGE = path.join(
  REPO_ROOT,
  'apps/web/app/(admin)/admin/scenes/[id]/debug/page.tsx',
);
const PROJECT_DIAG_PAGE = path.join(
  REPO_ROOT,
  'apps/web/app/(admin)/admin/projects/[id]/diagnostic/page.tsx',
);

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

// ── 1. Scene debug page exists and surfaces V14 fields ────────────────────
{
  const exists = fs.existsSync(SCENE_DEBUG_PAGE);
  assert(exists, '[V14 PR6.1] scene debug page exists');
  if (!exists) {
    console.error(`V14 PR6 verification: ABORT (page missing)`);
    process.exit(1);
  }
  const src = fs.readFileSync(SCENE_DEBUG_PAGE, 'utf8');

  // Section title — "V14" anchor is parseable
  assert(
    src.includes('V14 — frame techniques + scroll-stopper + outfit + genre'),
    '[V14 PR6.1] V14 section header present in scene debug page',
  );

  // Per-PR labels surface explicitly (rendered in the KeyValueGrid)
  for (const label of [
    'V14 PR1 israeli_setting_cue',
    'V14 PR2 frameTechniqueSnippetIds',
    'V14 PR3 lockedOutfit',
    'V14 PR4 scrollStopperApplied',
    'V14 PR4 scrollStopperReason',
    'V14 PR5 genre',
    'V14 PR5 voice_profile',
    'V14 PR5 hook_alternatives',
  ]) {
    assert(
      src.includes(label),
      `[V14 PR6.1] scene debug page surfaces label "${label}"`,
    );
  }

  // Pulls from the three persistence sources
  assert(
    src.includes('imageBriefJson'),
    '[V14 PR6.1] scene debug page reads imageBriefJson',
  );
  assert(
    src.includes('lockedOutfit'),
    '[V14 PR6.1] scene debug page reads lockedOutfit from productData',
  );
  assert(
    src.includes('rawJson'),
    '[V14 PR6.1] scene debug page reads script.rawJson for genre / voice_profile / hook_alternatives',
  );
  assert(
    src.includes('variationDiversity'),
    '[V14 PR6.1] scene debug page surfaces variationDiversity object',
  );

  // Graceful fallback ("—" placeholder) for legacy scenes
  assert(
    /'—'|"—"/.test(src),
    '[V14 PR6.1] scene debug page uses "—" fallback for missing V14 fields',
  );
}

// ── 2. Project diagnostic page exists and uses the ledger ────────────────
{
  const exists = fs.existsSync(PROJECT_DIAG_PAGE);
  assert(exists, '[V14 PR6.2] project diagnostic page exists');
  if (!exists) {
    console.error(`V14 PR6 verification: ABORT (diagnostic page missing)`);
    process.exit(1);
  }
  const src = fs.readFileSync(PROJECT_DIAG_PAGE, 'utf8');

  assert(
    src.includes('SceneVariationLedger'),
    '[V14 PR6.2] diagnostic page imports + uses SceneVariationLedger',
  );
  assert(
    src.includes('SceneVariationLedger.fromRecords'),
    '[V14 PR6.2] diagnostic page builds the ledger via fromRecords()',
  );
  assert(
    /summary\(\)/.test(src),
    '[V14 PR6.2] diagnostic page calls ledger.summary()',
  );

  // Surfaces per-scene records as a table
  assert(
    /scene_order/.test(src) && /cameraFocus/.test(src) && /sceneGenType/.test(src),
    '[V14 PR6.2] diagnostic page renders per-scene records (scene_order / cameraFocus / sceneGenType)',
  );

  // Low-diversity warning banner
  assert(
    /Low diversity/.test(src),
    '[V14 PR6.2] diagnostic page warns when low diversity is detected',
  );

  // Locked outfit surface
  assert(
    /V14 PR3 — locked outfit/.test(src),
    '[V14 PR6.2] diagnostic page surfaces the project-level lockedOutfit',
  );

  // Reads scripts + scenes
  assert(
    /scripts:\s*\{/.test(src) && /scenes:\s*\{/.test(src),
    '[V14 PR6.2] diagnostic page queries scripts → scenes via Prisma include',
  );
}

// ── 3. Ledger sanity — exposed surface still works as the page expects ───
{
  // The diagnostic page calls SceneVariationLedger.fromRecords([...]).summary()
  // and reads .cameraFocus.distinct / .total / etc. Confirm the surface is
  // intact (regression catcher if PR4's ledger shape is later refactored).
  const ledger = SceneVariationLedger.fromRecords([
    { sceneOrder: 0, cameraFocus: 'face' },
    { sceneOrder: 1, cameraFocus: 'product' },
    { sceneOrder: 2, cameraFocus: 'face' },
  ]);
  const s = ledger.summary();
  assert(
    s.cameraFocus.distinct === 2 && s.cameraFocus.total === 3,
    '[V14 PR6.3] ledger.summary().cameraFocus shape stable (distinct=2 total=3 for fixture)',
  );
  assert(
    typeof s.sceneGenerationType === 'object' &&
      'distinct' in s.sceneGenerationType &&
      'total' in s.sceneGenerationType,
    '[V14 PR6.3] every ledger field exposes {distinct, total}',
  );
}

// ── 4. PR2/PR4 ImageBrief shape still exposes the keys the pages read ───
{
  // Light static check: the keys the debug page indexes into are the same
  // names the brief builder writes. This is a regression catcher for any
  // future rename of frameTechniqueSnippetIds / scrollStopperApplied /
  // scrollStopperReason / variationDiversity.
  const briefBuilderSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'apps/web/lib/image-briefs/image-brief-builder.ts'),
    'utf8',
  );
  for (const key of [
    'frameTechniqueSnippetIds',
    'scrollStopperApplied',
    'scrollStopperReason',
    'variationDiversity',
  ]) {
    assert(
      briefBuilderSrc.includes(key),
      `[V14 PR6.4] image-brief-builder.ts still emits "${key}" (debug page depends on this)`,
    );
  }
}

console.log('');
if (failures === 0) {
  console.log('V14 PR6 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR6 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
