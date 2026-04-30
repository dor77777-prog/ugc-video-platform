// V13 master verification — runs every test-v13-pr*.ts script in
// sequence and exits non-zero if any one of them fails.
//
// Lives alongside the per-PR scripts so each can still be run on its
// own (npx tsx scripts/test-v13-pr3.ts) but a single command —
// `npm test` from apps/web — verifies the entire V13 surface in one
// shot. If/when the repo migrates to vitest in a future milestone,
// this file becomes the seed for the test suite.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const SCRIPTS_DIR = __dirname;

const scripts = fs
  .readdirSync(SCRIPTS_DIR)
  .filter((f) => /^test-v13-pr\d+(?:\.\d+)?\.ts$/.test(f))
  .sort((a, b) => {
    const num = (s: string) => Number(s.match(/pr(\d+)/)?.[1] ?? 0);
    return num(a) - num(b);
  });

if (scripts.length === 0) {
  console.error('No test-v13-pr*.ts scripts found.');
  process.exit(1);
}

console.log(`Running ${scripts.length} V13 verification script(s)\n`);

let totalFailed = 0;
const summary: Array<{ name: string; ok: boolean; ms: number }> = [];

for (const script of scripts) {
  const startedAt = Date.now();
  const proc = spawnSync('npx', ['tsx', path.join(SCRIPTS_DIR, script)], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: process.env,
  });
  const ms = Date.now() - startedAt;
  const ok = proc.status === 0;
  if (!ok) totalFailed++;
  summary.push({ name: script, ok, ms });
  console.log('');
}

console.log('─'.repeat(60));
console.log('V13 verification summary:');
for (const row of summary) {
  const tag = row.ok ? 'PASS' : 'FAIL';
  console.log(`  ${tag}  ${row.name.padEnd(28)}  (${row.ms}ms)`);
}
console.log('─'.repeat(60));

if (totalFailed > 0) {
  console.error(`${totalFailed} script(s) failed.`);
  process.exit(1);
}
console.log(`All ${scripts.length} V13 verification scripts passed.`);
process.exit(0);
