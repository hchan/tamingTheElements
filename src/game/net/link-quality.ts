import type { SessionStats } from '@core/index';

export type LinkQuality = 'good' | 'fair' | 'poor';

type Stalls = Pick<SessionStats, 'updates' | 'stalls'>;

/** Share of updates that stalled for a missing input: the cost a player feels (rollbacks are normal and not counted). */
function stallRate(stats: Stalls | undefined): number {
  return stats && stats.updates > 0 ? stats.stalls / stats.updates : 0;
}

/** Words for the link: round trip and stall share decide, the worse of the two wins. */
export function linkQuality(rttMs: number, stats?: Stalls): LinkQuality {
  const stalls = stallRate(stats);
  if (rttMs >= 200 || stalls >= 0.05) return 'poor';
  if (rttMs >= 100 || stalls >= 0.01) return 'fair';
  return 'good';
}

/** "Link: good, 48 ms" (words, not colour alone); "Link: measuring..." before the first answer. */
export function linkLine(rttMs: number | undefined, stats?: Stalls): string {
  if (rttMs === undefined) return 'Link: measuring...';
  return `Link: ${linkQuality(rttMs, stats)}, ${String(Math.round(rttMs))} ms`;
}
