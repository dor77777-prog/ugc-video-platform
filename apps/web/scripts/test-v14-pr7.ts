// V14 PR7 verification — docs update + master test runner.
//
// Static checks that:
//   1. README.md, STATUS.md, .claude/CLAUDE.md all reference V14 explicitly
//   2. Each MD names every V14 PR (PR1 through PR7) so future readers
//      can grep and the version log stays consistent
//   3. apps/web/package.json npm test chains the V14 runner
//   4. test-v14-all.ts exists and discovers test-v14-pr*.ts scripts
//   5. The 8 named scene presets are documented somewhere in the MDs
//      (so the namespace is discoverable from docs alone)

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const README = path.join(REPO_ROOT, 'README.md');
const STATUS = path.join(REPO_ROOT, 'STATUS.md');
const CLAUDE_MD = path.join(REPO_ROOT, '.claude/CLAUDE.md');
const PACKAGE_JSON = path.join(REPO_ROOT, 'apps/web/package.json');
const TEST_V14_ALL = path.join(REPO_ROOT, 'apps/web/scripts/test-v14-all.ts');
const DOCS_V14 = path.join(REPO_ROOT, 'docs/v14');

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

// ── 1. Each MD references V14 explicitly ───────────────────────────────────
{
  const cases: Array<[string, string]> = [
    ['README.md', README],
    ['STATUS.md', STATUS],
    ['.claude/CLAUDE.md', CLAUDE_MD],
  ];
  for (const [name, p] of cases) {
    const exists = fs.existsSync(p);
    assert(exists, `[V14 PR7.1] ${name} exists`);
    if (!exists) continue;
    const src = fs.readFileSync(p, 'utf8');
    assert(
      /\bV14\b/.test(src),
      `[V14 PR7.1] ${name} mentions V14`,
    );
  }
}

// ── 2. Each MD names every V14 PR (PR1 - PR7) ──────────────────────────────
{
  const cases: Array<[string, string]> = [
    ['README.md', README],
    ['STATUS.md', STATUS],
    ['.claude/CLAUDE.md', CLAUDE_MD],
  ];
  for (const [name, p] of cases) {
    const src = fs.readFileSync(p, 'utf8');
    for (const pr of ['PR1', 'PR2', 'PR3', 'PR4', 'PR5', 'PR6', 'PR7']) {
      assert(
        new RegExp(`V14\\s+${pr}|V14\\\\?-${pr}`).test(src) ||
          src.includes(`V14 ${pr}`),
        `[V14 PR7.2] ${name} names "V14 ${pr}"`,
      );
    }
  }
}

// ── 3. apps/web/package.json chains V14 runner ─────────────────────────────
{
  const src = fs.readFileSync(PACKAGE_JSON, 'utf8');
  const pkg = JSON.parse(src) as {
    scripts: Record<string, string>;
  };
  const testScript = pkg.scripts.test;
  assert(
    typeof testScript === 'string' && testScript.includes('test-v14-all.ts'),
    '[V14 PR7.3] npm test chains test-v14-all.ts',
  );
  assert(
    Boolean(pkg.scripts['test:v14']),
    '[V14 PR7.3] test:v14 script exists for V14-only runs',
  );
  assert(
    Boolean(pkg.scripts['test:v13']),
    '[V14 PR7.3] test:v13 script preserved (V13 runner still standalone)',
  );
}

// ── 4. test-v14-all.ts exists and globs PR scripts ────────────────────────
{
  const exists = fs.existsSync(TEST_V14_ALL);
  assert(exists, '[V14 PR7.4] apps/web/scripts/test-v14-all.ts exists');
  if (exists) {
    const src = fs.readFileSync(TEST_V14_ALL, 'utf8');
    assert(
      /test-v14-pr/i.test(src),
      '[V14 PR7.4] master runner globs for test-v14-pr*.ts',
    );
  }

  // Count V14 PR scripts discovered
  const scriptsDir = path.join(REPO_ROOT, 'apps/web/scripts');
  const v14Scripts = fs
    .readdirSync(scriptsDir)
    .filter((f) => /^test-v14-pr\d+\.ts$/.test(f))
    .sort();
  assert(
    v14Scripts.length >= 6,
    `[V14 PR7.4] ≥6 test-v14-pr*.ts scripts discoverable (found ${v14Scripts.length}: ${v14Scripts.join(', ')})`,
  );
}

// ── 5. Scene presets discoverable from docs ────────────────────────────────
//
// At least the .claude/CLAUDE.md should name every preset by ID so PR5's
// downstream (the script LLM consuming the system prompt) and any future
// developer can find the canonical vocabulary without grepping code.
{
  const claudeSrc = fs.readFileSync(CLAUDE_MD, 'utf8');
  const presets = [
    'kitchen_with_morning_light',
    'bathroom_morning_routine',
    'bedroom_evening',
    'living_room_couch',
    'tel_aviv_street_evening',
    'supermarket_aisle',
    'gym_modern',
    'outdoor_park_afternoon',
  ];
  for (const p of presets) {
    assert(
      claudeSrc.includes(p),
      `[V14 PR7.5] CLAUDE.md names scene preset "${p}"`,
    );
  }
}

// ── 6. docs/v14/ landed (3 reference files) ────────────────────────────────
{
  assert(fs.existsSync(DOCS_V14), '[V14 PR7.6] docs/v14/ directory exists');
  for (const file of [
    'ISRAELI_VISUAL_REALISM.md',
    'FRAME_PROMPT_TECHNIQUES.md',
    'HEBREW_SCRIPT_CREATIVE_RULES.md',
  ]) {
    assert(
      fs.existsSync(path.join(DOCS_V14, file)),
      `[V14 PR7.6] docs/v14/${file} exists`,
    );
  }
}

// ── 7. V13 docs preserved (no accidental delete) ──────────────────────────
{
  const claudeSrc = fs.readFileSync(CLAUDE_MD, 'utf8');
  for (const v13 of ['V13.1', 'V13.2', 'V13 PR1', 'V13 PR2']) {
    assert(
      claudeSrc.includes(v13),
      `[V14 PR7.7] CLAUDE.md still references "${v13}" (V13 history preserved)`,
    );
  }
}

console.log('');
if (failures === 0) {
  console.log('V14 PR7 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`V14 PR7 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
