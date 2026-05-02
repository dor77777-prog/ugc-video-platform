// Lightweight per-stage timing collector for the eval. Wraps async
// work with `performance.now()` boundaries so the JSON output has
// pi_duration_ms / concept_batch_duration_ms / concept_expand_duration_ms
// alongside wall_time_total — matching the user's measurement framing
// from the milestone definition.

export interface TimingSpan {
  label: string;
  /** ms since process start (Node's performance.now base) */
  startedAt: number;
  /** ms since process start */
  endedAt: number;
  durationMs: number;
}

export class TimingCollector {
  private spans: TimingSpan[] = [];
  private startedAt: number;

  constructor() {
    this.startedAt = performance.now();
  }

  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      const end = performance.now();
      this.spans.push({
        label,
        startedAt: start,
        endedAt: end,
        durationMs: end - start,
      });
    }
  }

  /** Sum of all spans with the given label (handy when you call the
   *  same stage multiple times across a batch and want the total). */
  totalForLabel(label: string): number {
    return this.spans
      .filter((s) => s.label === label)
      .reduce((acc, s) => acc + s.durationMs, 0);
  }

  /** Wall-clock since the collector was constructed. */
  totalElapsedMs(): number {
    return performance.now() - this.startedAt;
  }

  allSpans(): readonly TimingSpan[] {
    return this.spans;
  }

  /** Compact summary keyed by label (label → total ms across spans). */
  summary(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const s of this.spans) {
      out[s.label] = (out[s.label] ?? 0) + s.durationMs;
    }
    return out;
  }
}
