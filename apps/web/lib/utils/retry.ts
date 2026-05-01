// V26.11 — generic retry helper for transient provider failures.
//
// Wraps any async provider call so that a fast-failure (network blip,
// 5xx, fetch aborted, etc.) gets one transparent retry before we
// surface the error to the user. Retries are bounded on TWO axes:
//
//   1. `maxAttempts`            — total attempts incl. the first.
//                                 Default 2 (i.e. 1 retry).
//   2. `earlyFailWindowMs`      — only retry when the failed attempt
//                                 completed within this many ms. Past
//                                 this point the user is already
//                                 committed to waiting; doubling the
//                                 wall-clock would feel worse than
//                                 surfacing the error. Default 15s.
//
// Why a window instead of "always retry"? In live use we observed two
// distinct failure shapes per provider:
//   - Cold-start / network-handshake issues: fail fast (<2s). One
//     immediate retry almost always succeeds.
//   - Genuine provider-side timeout / overload: fail at the long-poll
//     boundary (60-180s). Retrying just doubles the wait.
//
// `shouldRetry` defaults to "transient HTTP 5xx + network". Provider
// error classes that carry an `httpStatus` field automatically light
// up the right path. 4xx (config, schema, rate-limit-without-retry-
// after, validation) are NOT retried — they won't change the second
// time and just burn the user's patience.

export interface RetryOptions {
  /** Maximum total attempts (default 2 — one retry). */
  maxAttempts?: number;
  /** Only retry when the failed attempt completed within this many ms.
   *  Default: 15000 (15s). */
  earlyFailWindowMs?: number;
  /** Backoff between retries, in ms. Default: 800. */
  backoffMs?: number;
  /** Predicate — returns true when `err` is worth retrying. */
  shouldRetry?: (err: Error) => boolean;
  /** Optional hook for telemetry / structured logging. */
  onRetry?: (attempt: number, err: Error, elapsedMs: number) => void;
  /** Tag included in the default warn log. */
  label?: string;
}

const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function isTransientByDefault(err: Error): boolean {
  const raw = err?.message ?? '';
  const msg = raw.toLowerCase();

  // Node fetch / undici / DNS / socket-level transient failures.
  // Match terms appearing in the various Node + undici error formats
  // we've seen across providers.
  const transientNeedles = [
    'econnreset',
    'etimedout',
    'econnrefused',
    'enotfound',
    'eai_again',
    'socket hang up',
    'network error',
    'fetch failed',
    'aborterror',
    'the operation was aborted',
    'request timeout',
    'undici',
    'connect timeout',
    'reset by peer',
    'temporarily unavailable',
  ];
  for (const needle of transientNeedles) {
    if (msg.includes(needle)) return true;
  }

  // Provider error classes (Kling, Grok, etc.) attach `httpStatus`.
  const anyErr = err as unknown as { httpStatus?: number; status?: number };
  const httpStatus = anyErr.httpStatus ?? anyErr.status;
  if (typeof httpStatus === 'number' && TRANSIENT_HTTP_STATUSES.has(httpStatus)) {
    return true;
  }

  // OpenAI / Gemini / general HTTP errors usually format the message
  // with the status as a 3-digit number — match `\b(50\d|408|429)\b`.
  const m = raw.match(/\b(408|429|500|502|503|504)\b/);
  if (m) return true;

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const earlyFailWindowMs = opts.earlyFailWindowMs ?? 15_000;
  const backoffMs = opts.backoffMs ?? 800;
  const shouldRetry = opts.shouldRetry ?? isTransientByDefault;

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      return await fn();
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      lastErr = err as Error;
      const remainingAttempts = maxAttempts - attempt;
      const wasEarlyFailure = elapsed <= earlyFailWindowMs;
      const isTransient = shouldRetry(lastErr);
      if (remainingAttempts > 0 && wasEarlyFailure && isTransient) {
        if (opts.onRetry) {
          opts.onRetry(attempt, lastErr, elapsed);
        } else {
          console.warn(
            `[retry${opts.label ? ' ' + opts.label : ''}] attempt ${attempt} failed in ${elapsed}ms (transient): ${lastErr.message}; retrying in ${backoffMs}ms`,
          );
        }
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error('retry: no attempts ran');
}
