// V13 PR8 verification — admin scene debug panel.

import fs from 'node:fs';
import path from 'node:path';

let failures = 0;
function ok(name: string) {
  console.log(`PASS ${name}`);
}
function fail(name: string, detail: string) {
  failures++;
  console.error(`FAIL ${name}\n   ${detail}`);
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name);
  else fail(name, detail);
}

const WEB = path.resolve(__dirname, '..');
const PAGE = path.join(WEB, 'app/(admin)/admin/scenes/[id]/debug/page.tsx');

assert(fs.existsSync(PAGE), '[PR8] /admin/scenes/[id]/debug/page.tsx exists');

if (fs.existsSync(PAGE)) {
  const page = fs.readFileSync(PAGE, 'utf8');

  // Auth gating: relies on (admin) layout's requireAdmin — page itself
  // must NOT bypass it (no separate auth import is fine; absence of
  // a public-route export is the contract).
  assert(
    !/export\s+const\s+revalidate\s*=\s*['"]/.test(page) || /force-dynamic/.test(page),
    '[PR8] page is force-dynamic so admin gating evaluates per-request',
  );
  assert(
    /force-dynamic/.test(page),
    "[PR8] page declares export const dynamic = 'force-dynamic'",
  );

  // Reads the scene + project + user
  assert(
    /prisma\.scene\.findUnique/.test(page),
    '[PR8] page reads scene via prisma.scene.findUnique',
  );
  assert(
    /script:\s*\{\s*include:\s*\{\s*project:/.test(page),
    '[PR8] page includes script.project for context',
  );

  // Sections required by V13 §15 (subset that we have data for)
  for (const [section, label] of [
    ['status', 'דיבאג סצנה'],
    ['error', 'שגיאה אחרונה'],
    ['log', 'לוג ייצור'],
    ['rules', 'דגלי routing & rules'],
    ['brief', 'Image Brief'],
    ['final-prompt', 'פרומט סופי לתמונה'],
    ['motion', 'ניתוח תנועה'],
    ['history', 'היסטוריית ייצור'],
    ['intelligence', 'Product Intelligence'],
  ]) {
    assert(
      page.includes(label),
      `[PR8] section "${section}" rendered (Hebrew label "${label}")`,
    );
  }

  // Reuses PR7.3 + PR7.4 components rather than reimplementing
  assert(
    /SceneCardStatusBadge/.test(page),
    '[PR8] reuses SceneCardStatusBadge (PR7.3)',
  );
  assert(
    /SceneLogViewer/.test(page),
    '[PR8] reuses SceneLogViewer (PR7.4)',
  );

  // PR5 + PR6 helpers
  assert(
    /getSceneErrorMessage/.test(page),
    '[PR8] uses getSceneErrorMessage (PR5 map) for the error section',
  );
  assert(
    /isSceneStatus/.test(page) && /SceneStatus/.test(page),
    '[PR8] uses isSceneStatus + SceneStatus (PR6 helper)',
  );

  // RTL + Hebrew title
  assert(/dir="rtl"/.test(page), '[PR8] page sets dir="rtl"');
  assert(/[א-ת]/.test(page), '[PR8] page contains Hebrew text');

  // Pretty-prints JSON (image brief, motion analysis, intelligence,
  // legacy QA) instead of dumping unstyled text
  assert(
    /JSON\.stringify\(.*null, 2\)/.test(page),
    '[PR8] page pretty-prints JSON via JSON.stringify(value, null, 2)',
  );

  // Legacy QA artifact is acknowledged as historical
  assert(
    /הוסר ב-V13 PR1/.test(page) || /legacy/i.test(page),
    '[PR8] image-qa section is labeled as historical / legacy (V13 PR1 removed the loop)',
  );
}

console.log('');
if (failures === 0) {
  console.log('PR8 verification: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error(`PR8 verification: ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
