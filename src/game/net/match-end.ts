/**
 * How an online match ended, as this client saw it. A local record only: it is never sent (RESULT keeps its u8 reason 0..3,
 * docs/ONLINE-PROTOCOL.md) and goes into the "Save report" file next to the replay.
 */

/** Longest `detail` the replay validator accepts. */
export const END_DETAIL_MAX = 32;

/** Why a match ended, in words; a desync check name (`hash`, `restore`, `batch-ack`, ...) is also a valid detail. */
export const END_DETAIL = {
  simEnd: 'sim-end',
  tickLimit: 'tick-limit',
  conceded: 'conceded',
  opponentConceded: 'opponent-conceded',
  opponentLeft: 'opponent-left',
  stalled: 'stalled',
  relayClosed: 'relay-closed',
} as const;

export interface MatchEndRecord {
  /** Same values as RESULT `reason`: 0 natural, 1 forfeit, 2 timeout, 3 desync. */
  readonly reason: 0 | 1 | 2 | 3;
  readonly detail: string;
  /** Sim tick at the end (the desync tick for a desync; 0 when none applies). */
  readonly tick: number;
  /** Winning slot, or 2 for nobody (RESULT winner byte). */
  readonly winner: number;
  /** True when a RESULT frame went to the relay. */
  readonly resultSent: boolean;
}
