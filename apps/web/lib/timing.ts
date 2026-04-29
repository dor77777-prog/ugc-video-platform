// Timing helper — wraps an async operation, logs its duration on completion,
// and tags slow ones for easy grepping in Vercel logs.
//
// Usage:
//   const result = await timed('scripts:findFirst', () => prisma.project.findFirst({...}));
//
// In Vercel logs, search for "[TIMING]" or "[SLOW]" to see all instrumented spans.

const SLOW_OPERATION_MS = 1000;

export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    const tag = ms >= SLOW_OPERATION_MS ? '[SLOW]' : '[TIMING]';
    console.log(`${tag} ${label} — ${ms}ms`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`[TIMING-FAIL] ${label} — ${ms}ms — ${(err as Error).message}`);
    throw err;
  }
}

// Sync version for non-promise spans (e.g., wrapping a synchronous code block).
export function timedSync<T>(label: string, fn: () => T): T {
  const start = Date.now();
  try {
    const result = fn();
    const ms = Date.now() - start;
    const tag = ms >= SLOW_OPERATION_MS ? '[SLOW]' : '[TIMING]';
    console.log(`${tag} ${label} — ${ms}ms`);
    return result;
  } catch (err) {
    const ms = Date.now() - start;
    console.log(`[TIMING-FAIL] ${label} — ${ms}ms — ${(err as Error).message}`);
    throw err;
  }
}
