// Stage-tagged logger — V13 PR4.1.
//
// Today most logs are bare `console.log`. Two problems with that:
//   1. No stage / scope tag → can't grep for "what did Kling do for
//      scene scn_abc?" without skim-reading the Vercel/Railway stream.
//   2. No level filter → debug-level chatter leaks to prod, noise drowns
//      the signal lines.
//
// V13 PR4 fixes those without dragging Pino + Sentry in (that's a
// later milestone). The helper is intentionally small:
//   - logStage("kling", "scn_abc") returns a StageLogger
//   - .debug / .info / .warn / .error tag every line `[kling:scn_abc] …`
//   - .span(label, fn) wraps an async block, logs duration on success
//     and re-throws on failure with `✗ <label> (NNms)` first
//   - LOG_LEVEL env filters per-process (default `info` in prod,
//     `debug` in dev — controlled by NODE_ENV)
//   - Sensitive data masking — known key shapes (sk-…, Bearer tokens,
//     base64 image data) get auto-truncated in the data object
//
// No persistence in PR4.1 — Scene.generationLogJson lands in PR6
// after we propose + approve the schema additions. The helper is
// shaped for that future hook (per-scene buffer ready to add).

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveMinLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') {
    return env;
  }
  // Default: debug in dev (loud is fine, you're tailing logs anyway),
  // info in prod (signal-only, errors and warnings still surface).
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const MIN_LEVEL = resolveMinLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

// ── Sensitive-data masking ─────────────────────────────────────────────
//
// Keys that look like API keys, Bearer tokens, or base64 image data get
// truncated to "…<last4>" or "(<N> bytes)" so we never log credentials
// or megabytes of image bytes by accident. Applied recursively to the
// data object passed as the second arg to debug/info/warn/error.

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key$/i,
  /^secret/i,
  /token$/i,
  /authorization$/i,
  /^bearer$/i,
  /password$/i,
];

function looksLikeSensitiveValue(s: string): boolean {
  if (s.startsWith('sk-') || s.startsWith('Bearer ') || s.startsWith('eyJ')) {
    return true;
  }
  return false;
}

function maskString(s: string): string {
  if (s.length <= 8) return '…';
  return `…${s.slice(-4)}`;
}

function maskValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (looksLikeSensitiveValue(value)) return maskString(value);
    // Long base64-looking strings (typical: scene image bytes) → byte count
    if (value.length > 1024 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 64))) {
      return `(base64 ${value.length} chars)`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(maskValue);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((re) => re.test(k));
      if (isSensitiveKey && typeof v === 'string') {
        out[k] = maskString(v);
      } else {
        out[k] = maskValue(v);
      }
    }
    return out;
  }
  return value;
}

// ── Public surface ──────────────────────────────────────────────────────

export interface StageLogger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  /** Wraps an async block. Logs `→ <label>` on enter and either
   *  `← <label> (NNms)` on success or `✗ <label> (NNms): <err>` on
   *  failure. Re-throws the error after logging. */
  span<T>(label: string, fn: () => Promise<T>): Promise<T>;
}

/** A single buffered entry persisted to Scene.generationLogJson. */
export interface SceneLogEntry {
  stage: string;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  /** ISO timestamp string. */
  ts: string;
}

// V13 PR7.2 — per-scene log buffer.
//
// When a logger's `scope` starts with `scn_`, every entry is also
// appended to an in-memory buffer keyed by sceneId. Callers can later
// flush the buffer into Scene.generationLogJson via flushSceneLogBuffer
// — a single write that appends N entries to the row's existing list
// and trims to the cap so row size stays bounded.
//
// Buffer lives at module scope so loggers built in different request
// handlers but for the same scene merge into one flushable batch. In
// long-running processes (the worker) this is unbounded — keep the cap
// + flush cadence honest.

const MAX_BUFFER_PER_SCENE = 200;
const MAX_LOG_PER_ROW = 200;
const sceneBuffers = new Map<string, SceneLogEntry[]>();

function bufferEntry(scope: string, entry: SceneLogEntry): void {
  if (!scope.startsWith('scn_')) return;
  const sceneId = scope;
  const buf = sceneBuffers.get(sceneId) ?? [];
  buf.push(entry);
  // Hard cap on the buffer to bound memory; oldest entries drop first.
  if (buf.length > MAX_BUFFER_PER_SCENE) {
    buf.splice(0, buf.length - MAX_BUFFER_PER_SCENE);
  }
  sceneBuffers.set(sceneId, buf);
}

/** Drain the buffer for a scene and return the entries. Subsequent
 *  reads return []. Callers that want to peek without draining should
 *  call `peekSceneLogBuffer` instead. */
export function drainSceneLogBuffer(sceneId: string): SceneLogEntry[] {
  const buf = sceneBuffers.get(sceneId);
  if (!buf || buf.length === 0) return [];
  sceneBuffers.delete(sceneId);
  return buf;
}

/** Inspect the current buffer without removing entries. */
export function peekSceneLogBuffer(sceneId: string): readonly SceneLogEntry[] {
  return sceneBuffers.get(sceneId) ?? [];
}

/** Prisma client type used by flushSceneLogBuffer. Type-only import
 *  keeps the runtime decoupled — log.ts stays free of any Prisma
 *  runtime surface, and callers from db.ts pass their own client. */
type FlushPrismaLike = import('@prisma/client').PrismaClient;

/** Persist buffered entries onto Scene.generationLogJson, appending to
 *  whatever is already there and trimming to MAX_LOG_PER_ROW so the
 *  row stays bounded.
 *
 *  Best-effort: if Prisma errors (race / DB blip) the entries are
 *  silently dropped — we never want logging persistence to mask real
 *  pipeline failures. The console-side logs already shipped, so the
 *  signal isn't lost.
 */
export async function flushSceneLogBuffer(
  sceneId: string,
  prisma: FlushPrismaLike,
): Promise<{ flushed: number; total: number } | null> {
  const fresh = drainSceneLogBuffer(sceneId);
  if (fresh.length === 0) return null;
  try {
    const row = await prisma.scene.findUnique({
      where: { id: sceneId },
      select: { generationLogJson: true },
    });
    const existing = Array.isArray(row?.generationLogJson)
      ? (row.generationLogJson as unknown as SceneLogEntry[])
      : [];
    const merged = existing.concat(fresh);
    const trimmed =
      merged.length > MAX_LOG_PER_ROW
        ? merged.slice(merged.length - MAX_LOG_PER_ROW)
        : merged;
    await prisma.scene.update({
      where: { id: sceneId },
      data: { generationLogJson: trimmed as unknown as object },
    });
    return { flushed: fresh.length, total: trimmed.length };
  } catch {
    // Best-effort. Logs already hit the console; persistence is
    // a nice-to-have.
    return null;
  }
}

function emit(
  level: LogLevel,
  stage: string,
  scope: string,
  msg: string,
  data: Record<string, unknown> | undefined,
): void {
  // Always buffer for scene scopes regardless of level filter so the
  // wizard's debug viewer doesn't lose debug-level breadcrumbs in prod
  // (where LOG_LEVEL=info filters them off the console).
  if (scope.startsWith('scn_')) {
    bufferEntry(scope, {
      stage,
      level,
      message: msg,
      data: data === undefined ? undefined : (maskValue(data) as Record<string, unknown>),
      ts: new Date().toISOString(),
    });
  }
  if (!shouldLog(level)) return;
  const tag = `[${stage}:${scope}]`;
  const masked = data === undefined ? undefined : maskValue(data);
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (masked === undefined) {
    sink(`${tag} ${msg}`);
  } else {
    sink(`${tag} ${msg}`, masked);
  }
}

export function logStage(stage: string, scope: string): StageLogger {
  return {
    debug: (msg, data) => emit('debug', stage, scope, msg, data),
    info: (msg, data) => emit('info', stage, scope, msg, data),
    warn: (msg, data) => emit('warn', stage, scope, msg, data),
    error: (msg, data) => emit('error', stage, scope, msg, data),
    async span<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const startedAt = Date.now();
      emit('debug', stage, scope, `→ ${label}`, undefined);
      try {
        const result = await fn();
        const ms = Date.now() - startedAt;
        emit('info', stage, scope, `← ${label} (${ms}ms)`, undefined);
        return result;
      } catch (err) {
        const ms = Date.now() - startedAt;
        const message = (err as Error).message ?? String(err);
        emit('error', stage, scope, `✗ ${label} (${ms}ms): ${message}`, undefined);
        throw err;
      }
    },
  };
}

// Test-only re-exports for unit tests. Not part of the public API
// surface — callers should use logStage() exclusively.
export const __testing = {
  resolveMinLevel,
  shouldLog,
  maskValue,
  MIN_LEVEL,
  /** Drops every per-scene buffer — useful between unit tests so state
   *  doesn't leak from one assertion block to the next. */
  resetSceneBuffers: () => sceneBuffers.clear(),
  MAX_BUFFER_PER_SCENE,
  MAX_LOG_PER_ROW,
};
