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

function emit(
  level: LogLevel,
  stage: string,
  scope: string,
  msg: string,
  data: Record<string, unknown> | undefined,
): void {
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
};
