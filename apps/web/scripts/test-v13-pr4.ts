// V13 PR4 verification — same tsx-script pattern as PR1/PR2/PR3.
//
// PR4.1: logStage helper. Future commits add wired call sites in the
// active path; those get assertions in this same file as PR4.2 / PR4.3.

import {
  logStage,
  __testing,
  drainSceneLogBuffer,
  peekSceneLogBuffer,
  flushSceneLogBuffer,
} from '../lib/logging/log';

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

    // ── PR4.3 — clip-impl.ts wires motion-analysis / kling / face-gate / pixverse ──
    const clipImpl = fs.readFileSync(
      path.resolve(__dirname, '../lib/scenes/clip-impl.ts'),
      'utf8',
    );
    assert(
      /logStage\(['"]clip['"]\s*,\s*sceneId\)/.test(clipImpl),
      "[PR4.3] clip-impl.ts uses logStage('clip', sceneId)",
    );
    assert(
      /logStage\(['"]motion-analysis['"]\s*,\s*sceneId\)/.test(clipImpl),
      "[PR4.3] clip-impl.ts uses logStage('motion-analysis', sceneId)",
    );
    assert(
      /logStage\(['"]kling['"]\s*,\s*sceneId\)/.test(clipImpl),
      "[PR4.3] clip-impl.ts uses logStage('kling', sceneId)",
    );
    assert(
      /logStage\(['"]face-gate['"]\s*,\s*sceneId\)/.test(clipImpl),
      "[PR4.3] clip-impl.ts uses logStage('face-gate', sceneId)",
    );
    assert(
      /logStage\(['"]pixverse['"]\s*,\s*sceneId\)/.test(clipImpl),
      "[PR4.3] clip-impl.ts uses logStage('pixverse', sceneId)",
    );
    assert(
      /motionLog\.info\(['"]cache hit/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs motion-analysis cache hit',
    );
    assert(
      /klingLog\.info\(['"]calling i2v['"]/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs "calling i2v" before Kling call',
    );
    assert(
      /klingLog\.info\(['"]i2v returned['"]/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs "i2v returned" with model + duration',
    );
    assert(
      /klingLog\.error\(/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs Kling i2v failures',
    );
    assert(
      /faceGateLog\.info\(['"]verdict['"]/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs face-gate verdict',
    );
    assert(
      /faceGateLog\.warn\(/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs face-gate failures (warn)',
    );
    assert(
      /pixverseLog\.info\(['"]entering lipsync stage['"]/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs entering pixverse lipsync stage',
    );
    assert(
      /pixverseLog\.info\(['"]lipsync returned/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs pixverse completion',
    );
    assert(
      /pixverseLog\.error\(/.test(clipImpl),
      '[PR4.3] clip-impl.ts logs pixverse failures',
    );
    // No console.* leftovers in clip-impl.ts active path.
    assert(
      !/\bconsole\.(log|warn|error)\b/.test(clipImpl),
      '[PR4.3] clip-impl.ts has zero console.* calls (all routed through stage loggers)',
    );
  }

  // ── PR7.2 — Per-scene log buffer ───────────────────────────────────
  {
    __testing.resetSceneBuffers();

    // Non-scene scopes don't buffer.
    logStage('kling', 'global').info('not buffered');
    assert(
      peekSceneLogBuffer('global').length === 0,
      '[PR7.2] non-scene scopes do not populate the per-scene buffer',
    );

    // Scene-scoped logs buffer at every level (debug too — wizard
    // viewer wants the full breadcrumb in dev).
    const log = logStage('kling', 'scn_test1');
    log.debug('debug line');
    log.info('info line');
    log.warn('warn line');
    log.error('error line');
    const peeked = peekSceneLogBuffer('scn_test1');
    assert(peeked.length === 4, '[PR7.2] all four levels buffer (debug + info + warn + error)');
    assert(
      peeked[0]?.stage === 'kling' && peeked[0]?.level === 'debug',
      '[PR7.2] buffered entry preserves stage + level',
    );
    assert(
      typeof peeked[0]?.ts === 'string' && peeked[0]!.ts.length > 0,
      '[PR7.2] buffered entry has ISO timestamp',
    );

    // Drain returns and clears.
    const drained = drainSceneLogBuffer('scn_test1');
    assert(drained.length === 4, '[PR7.2] drainSceneLogBuffer returns the buffered entries');
    assert(
      peekSceneLogBuffer('scn_test1').length === 0,
      '[PR7.2] drainSceneLogBuffer clears the buffer',
    );

    // Sensitive data masked at buffer time too.
    const log2 = logStage('image-gen', 'scn_test2');
    log2.info('with secret', { apiKey: 'sk-abcdef0123456789' });
    const buf2 = drainSceneLogBuffer('scn_test2');
    assert(
      buf2[0]?.data?.apiKey !== 'sk-abcdef0123456789' &&
        typeof buf2[0]?.data?.apiKey === 'string' &&
        (buf2[0]!.data!.apiKey as string).startsWith('…'),
      '[PR7.2] sensitive data is masked at buffer time, not just on console',
    );

    // Cap at MAX_BUFFER_PER_SCENE — overflow drops oldest entries.
    __testing.resetSceneBuffers();
    const log3 = logStage('test', 'scn_overflow');
    const cap = __testing.MAX_BUFFER_PER_SCENE;
    for (let i = 0; i < cap + 50; i++) {
      log3.info(`line ${i}`);
    }
    const buf3 = peekSceneLogBuffer('scn_overflow');
    assert(
      buf3.length === cap,
      `[PR7.2] buffer caps at MAX_BUFFER_PER_SCENE (${cap}); overflow drops oldest`,
    );
    assert(
      buf3[0]?.message === `line 50`,
      '[PR7.2] when over capacity, oldest entries are dropped first',
    );
  }

  // ── PR7.2 — flushSceneLogBuffer with a fake Prisma ─────────────────
  {
    __testing.resetSceneBuffers();
    logStage('image-gen', 'scn_flush1').info('one');
    logStage('image-gen', 'scn_flush1').info('two');

    let writtenData: unknown = null;
    const fakePrisma = {
      scene: {
        findUnique: async () => ({ generationLogJson: null }),
        update: async (args: { data: { generationLogJson: unknown } }) => {
          writtenData = args.data.generationLogJson;
          return {};
        },
      },
    } as unknown as Parameters<typeof flushSceneLogBuffer>[1];

    const result = await flushSceneLogBuffer('scn_flush1', fakePrisma);
    assert(
      result?.flushed === 2 && result?.total === 2,
      '[PR7.2] flushSceneLogBuffer returns { flushed, total } on success',
    );
    assert(
      Array.isArray(writtenData) && (writtenData as unknown[]).length === 2,
      '[PR7.2] flushSceneLogBuffer writes a JSON array to Scene.generationLogJson',
    );
    assert(
      peekSceneLogBuffer('scn_flush1').length === 0,
      '[PR7.2] buffer is empty after flush',
    );

    // Empty buffer → no-op, returns null.
    const noop = await flushSceneLogBuffer('scn_empty', fakePrisma);
    assert(noop === null, '[PR7.2] flush on empty buffer returns null without writing');

    // Existing entries on the row are preserved + appended to.
    __testing.resetSceneBuffers();
    logStage('image-gen', 'scn_merge').info('new entry');
    const fakePrisma2 = {
      scene: {
        findUnique: async () => ({
          generationLogJson: [
            { stage: 'voice', level: 'info', message: 'old', ts: '2026-04-30T00:00:00Z' },
          ],
        }),
        update: async (args: { data: { generationLogJson: unknown } }) => {
          writtenData = args.data.generationLogJson;
          return {};
        },
      },
    } as unknown as Parameters<typeof flushSceneLogBuffer>[1];
    await flushSceneLogBuffer('scn_merge', fakePrisma2);
    assert(
      Array.isArray(writtenData) && (writtenData as unknown[]).length === 2,
      '[PR7.2] flush concatenates new entries onto existing row data',
    );
    assert(
      Array.isArray(writtenData) && (writtenData as Array<{ message: string }>)[0]?.message === 'old',
      '[PR7.2] existing entries preserved at front; new entries appended',
    );

    // Trim to MAX_LOG_PER_ROW.
    __testing.resetSceneBuffers();
    const log4 = logStage('image-gen', 'scn_trim');
    for (let i = 0; i < 20; i++) log4.info(`new ${i}`);
    const oldEntries = Array.from({ length: __testing.MAX_LOG_PER_ROW - 5 }, (_, i) => ({
      stage: 'voice',
      level: 'info',
      message: `old ${i}`,
      ts: '2026-04-30T00:00:00Z',
    }));
    const fakePrisma3 = {
      scene: {
        findUnique: async () => ({ generationLogJson: oldEntries }),
        update: async (args: { data: { generationLogJson: unknown } }) => {
          writtenData = args.data.generationLogJson;
          return {};
        },
      },
    } as unknown as Parameters<typeof flushSceneLogBuffer>[1];
    await flushSceneLogBuffer('scn_trim', fakePrisma3);
    assert(
      Array.isArray(writtenData) && (writtenData as unknown[]).length === __testing.MAX_LOG_PER_ROW,
      `[PR7.2] flush trims merged list to MAX_LOG_PER_ROW (${__testing.MAX_LOG_PER_ROW})`,
    );

    // Best-effort on Prisma error — returns null, doesn't throw.
    __testing.resetSceneBuffers();
    logStage('image-gen', 'scn_dberror').info('oops');
    const failingPrisma = {
      scene: {
        findUnique: async () => {
          throw new Error('DB down');
        },
        update: async () => ({}),
      },
    } as unknown as Parameters<typeof flushSceneLogBuffer>[1];
    const failResult = await flushSceneLogBuffer('scn_dberror', failingPrisma);
    assert(
      failResult === null,
      '[PR7.2] flushSceneLogBuffer returns null (best-effort) on Prisma error',
    );
  }

  // ── PR7.2 — Each pipeline impl calls flushSceneLogBuffer in finally ──
  {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const generateImpl = fs.readFileSync(
      path.resolve(__dirname, '../lib/scenes/generate-impl.ts'),
      'utf8',
    );
    const voiceImpl = fs.readFileSync(
      path.resolve(__dirname, '../lib/scenes/voice-impl.ts'),
      'utf8',
    );
    const clipImpl = fs.readFileSync(
      path.resolve(__dirname, '../lib/scenes/clip-impl.ts'),
      'utf8',
    );
    assert(
      /flushSceneLogBuffer\(sceneId/.test(generateImpl),
      '[PR7.2] generate-impl flushes the per-scene log buffer',
    );
    assert(
      /flushSceneLogBuffer\(sceneId/.test(voiceImpl),
      '[PR7.2] voice-impl flushes the per-scene log buffer',
    );
    assert(
      /flushSceneLogBuffer\(sceneId/.test(clipImpl),
      '[PR7.2] clip-impl flushes the per-scene log buffer',
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
