// Per-second frame counter for the live tools: measures what a client really sends (no estimate), so a run can be compared with the grant.
export interface RateSummary { readonly total: number; readonly seconds: number; readonly peakPerSec: number; readonly meanPerSec: number }

export class RateCounter {
  private readonly buckets = new Map<number, number>();
  private total = 0;
  /** Count one frame at wall time `ms` (any monotonic clock, ms). */
  record(ms: number): void {
    const s = Math.floor(ms / 1000);
    this.buckets.set(s, (this.buckets.get(s) ?? 0) + 1);
    this.total++;
  }
  /** Mean is over the span from the first to the last active second, so idle tails do not dilute it. */
  summary(): RateSummary {
    if (this.total === 0) return { total: 0, seconds: 0, peakPerSec: 0, meanPerSec: 0 };
    const keys = [...this.buckets.keys()];
    const seconds = Math.max(...keys) - Math.min(...keys) + 1;
    return { total: this.total, seconds, peakPerSec: Math.max(...this.buckets.values()), meanPerSec: Math.round((this.total / seconds) * 10) / 10 };
  }
  text(): string {
    const s = this.summary();
    return `${String(s.total)} frames over ${String(s.seconds)} s, peak ${String(s.peakPerSec)}/s, mean ${String(s.meanPerSec)}/s (measurement)`;
  }
}
