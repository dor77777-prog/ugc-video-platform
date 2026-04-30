// V13 PR4 verification — same tsx-script pattern as PR1/PR2/PR3.
//
// PR4.1: logStage helper. Future commits add wired call sites in the
// active path; those get assertions in this same file as PR4.2 / PR4.3.

import { logStage, __testing } from '../lib/logging/log';

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

// ── Capture console output so we can assert on tag/format/level ────────
const captured: { level: 'log' | 'warn' | 'error'; line: string }[] = [];
const origLog = console.log;
const origWarn = console.warn;
const origErr = console.error;
function captureOn() {
  console.log = (...args: unknown[]) => {
    captured.push({ level: 'log', line: args.map(String).join(' ') });
  };
  console.warn = (...args: unknown[]) => {
    captured.push({ level: 'warn', line: args.map(String).join(' ') });
  };
  console.error = (...args: unknown[]) => {
    captured.push({ level: 'error', line: args.map(String).join(' ') });
  };
}
function captureOff() {
  console.log = origLog;
  console.warn = origWarn;
  console.error = origErr;
}

// ── PR4.1 — Stage tag format ───────────────────────────────────────────
{
  captured.length = 0;
  captureOn();
  logStage('kling', 'scn_abc').info('hi');
  captureOff();
  assert(
    captured.length === 1,
    '[PR4.1] info() emits exactly one console line',
  );
  assert(
    !!captured[0] && captured[0].line.startsWith('[kling:scn_abc]'),
    '[PR4.1] info() prefixes line with [stage:scope] tag',
    `got: ${JSON.stringify(captured[0])}`,
  );
}

// ── PR4.1 — Levels routed correctly ────────────────────────────────────
{
  captured.length = 0;
  captureOn();
  const log = logStage('test', 'scope1');
  log.debug('d');
  log.info('i');
  log.warn('w');
  log.error('e');
  captureOff();
  // In dev (default) all four levels emit. We don't assert on exact count
  // because LOG_LEVEL is environment-sensitive — instead we verify
  // that .warn and .error use the correct console methods.
  assert(
    captured.some((c) => c.level === 'warn' && c.line.includes('[test:scope1]')),
    '[PR4.1] warn() routes to console.warn',
  );
  assert(
    captured.some((c) => c.level === 'error' && c.line.includes('[test:scope1]')),
    '[PR4.1] error() routes to console.error',
  );
}

// ── PR4.1 — Level filter ───────────────────────────────────────────────
{
  // Filter test: bypass the cached MIN_LEVEL by checking the predicate.
  assert(
    __testing.shouldLog('error') === true,
    '[PR4.1] error level always passes the filter',
  );
  assert(
    typeof __testing.MIN_LEVEL === 'string',
    '[PR4.1] MIN_LEVEL resolves to a level string',
  );
}

// ── PR4.1 — Sensitive data masking ─────────────────────────────────────
{
  // sk-... keys → truncated
  const masked1 = __testing.maskValue({ apiKey: 'sk-abc123def456ghi789' }) as Record<string, string>;
  assert(
    typeof masked1.apiKey === 'string' &&
      masked1.apiKey.startsWith('…') &&
      masked1.apiKey.length <= 6,
    '[PR4.1] apiKey-shaped key gets masked to "…<last4>"',
    `got: ${JSON.stringify(masked1)}`,
  );

  // Bearer tokens detected by value shape, not just key name
  const masked2 = __testing.maskValue({ authorization: 'Bearer eyJabc123def456ghi789jkl' }) as Record<string, string>;
  assert(
    typeof masked2.authorization === 'string' && masked2.authorization.startsWith('…'),
    '[PR4.1] authorization header masked when value looks like a token',
    `got: ${JSON.stringify(masked2)}`,
  );

  // Long base64 strings (image data) → byte count
  const longB64 = 'A'.repeat(2048);
  const masked3 = __testing.maskValue({ image: longB64 }) as Record<string, string>;
  assert(
    typeof masked3.image === 'string' && masked3.image.startsWith('(base64 '),
    '[PR4.1] long base64-shaped values masked as "(base64 N chars)"',
    `got: ${JSON.stringify(masked3).slice(0, 80)}`,
  );

  // Normal data passes through untouched
  const masked4 = __testing.maskValue({ count: 5, name: 'scene_abc' });
  assert(
    JSON.stringify(masked4) === JSON.stringify({ count: 5, name: 'scene_abc' }),
    '[PR4.1] non-sensitive data passes through unchanged',
  );

  // Recursive masking
  const masked5 = __testing.maskValue({
    outer: { token: 'sk-deadbeef0123abc4567890', count: 3 },
  }) as { outer: Record<string, unknown> };
  assert(
    masked5.outer.count === 3 && typeof masked5.outer.token === 'string' && (masked5.outer.token as string).startsWith('…'),
    '[PR4.1] sensitive keys are masked recursively in nested objects',
  );
}

async function main() {
  // ── PR4.1 — span() success path ────────────────────────────────────────
  {
    captured.length = 0;
    captureOn();
    const result = await logStage('kling', 'scn_xyz').span('i2v_call', async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'ok';
    });
    captureOff();
    assert(result === 'ok', '[PR4.1] span() returns the wrapped value');
    assert(
      captured.some((c) => c.line.includes('← i2v_call')) &&
        captured.some((c) => /\(\d+ms\)/.test(c.line)),
      '[PR4.1] span() emits "← <label> (NNms)" on success',
      `got: ${JSON.stringify(captured.map((c) => c.line))}`,
    );
  }

  // ── PR4.1 — span() failure path ────────────────────────────────────────
  {
    captured.length = 0;
    captureOn();
    let caught: Error | null = null;
    try {
      await logStage('kling', 'scn_fail').span('i2v_call', async () => {
        throw new Error('boom');
      });
    } catch (e) {
      caught = e as Error;
    }
    captureOff();
    assert(
      caught !== null && (caught as Error).message === 'boom',
      '[PR4.1] span() re-throws the original error',
    );
    assert(
      captured.some((c) => c.level === 'error' && /✗ i2v_call/.test(c.line) && /boom/.test(c.line)),
      '[PR4.1] span() emits "✗ <label> (NNms): <err>" on failure',
      `got: ${JSON.stringify(captured.map((c) => c.line))}`,
    );
  }

  // ── PR4.2 — Stage logs wired into image-brief / image-gen / voice ────
  {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');

    const generateImpl = fs.readFileSync(
      path.resolve(__dirname, '../lib/scenes/generate-impl.ts'),
      'utf8',
    );
    assert(
      /logStage\(['"]image-brief['"]\s*,\s*sceneId\)/.test(generateImpl),
      "[PR4.2] generate-impl.ts uses logStage('image-brief', sceneId)",
    );
    assert(
      /logStage\(['"]image-gen['"]\s*,\s*sceneId\)/.test(generateImpl),
      "[PR4.2] generate-impl.ts uses logStage('image-gen', sceneId)",
    );
    assert(
      /briefLog\.info\(['"]brief built['"]/.test(generateImpl),
      '[PR4.2] generate-impl.ts logs "brief built" with brief metrics',
    );
    assert(
      /imageLog\.info\(['"]gpt-image-2 returned['"]/.test(generateImpl),
      '[PR4.2] generate-impl.ts logs "gpt-image-2 returned" with model + duration',
    );
    assert(
      /imageLog\.error\(/.test(generateImpl),
      '[PR4.2] generate-impl.ts logs errors via image-gen logger',
    );

    const voiceImpl = fs.readFileSync(
      path.resolve(__dirname, '../lib/scenes/voice-impl.ts'),
      'utf8',
    );
    assert(
      /logStage\(['"]voice['"]\s*,\s*sceneId\)/.test(voiceImpl),
      "[PR4.2] voice-impl.ts uses logStage('voice', sceneId)",
    );
    assert(
      /voiceLog\.info\(['"]calling elevenlabs['"]/.test(voiceImpl),
      '[PR4.2] voice-impl.ts logs "calling elevenlabs" before TTS call',
    );
    assert(
      /voiceLog\.info\(['"]elevenlabs returned['"]/.test(voiceImpl),
      '[PR4.2] voice-impl.ts logs "elevenlabs returned" with audio + alignment metrics',
    );
    assert(
      /voiceLog\.error\(/.test(voiceImpl),
      '[PR4.2] voice-impl.ts logs errors via voice logger',
    );
  }

  console.log('');
  if (failures === 0) {
    console.log('PR4 verification: ALL CHECKS PASSED');
    process.exit(0);
  } else {
    console.error(`PR4 verification: ${failures} CHECK(S) FAILED`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
