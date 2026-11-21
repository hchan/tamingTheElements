import type { LockstepSession } from '@core/index';
import type { WebSocketTransport } from './transport';

/**
 * What the game tells the relay about a match besides the inputs (docs/ONLINE-PROTOCOL.md sections 6 and 8): a HASH checkpoint about once
 * a second, DESYNC when the session sees the two hashes differ, RESULT once at the end. All constants of this reporting live here.
 */

/** Smallest gap between two HASH frames in ms. Checkpoints come every 50 ticks (1 s at 50 Hz), so this is about 1 HASH/s per client (estimate). */
export const HASH_REPORT_MS = 1000;
/** RESULT `winner` byte for "nobody" (0 and 1 are the slots). */
export const RESULT_WINNER_NONE = 2;
/** RESULT `reason` bytes; the same values as `ResultReason` in src/core/relay/constants.ts (game code cannot import the relay package). */
export const RESULT_REASON = { natural: 0, forfeit: 1, timeout: 2, desync: 3 } as const;
/** RESULT_ACK status bytes (`ResultStatus` of the relay package). */
export const ACK_STATUS = { agreed: 0, waiting: 1, disagreed: 2 } as const;

export type ReportLink = Pick<WebSocketTransport, 'sendHash' | 'sendDesync' | 'sendResult'>;
export type ReportSession = Pick<LockstepSession, 'simTick' | 'forfeitReason' | 'desync' | 'checkpoints' | 'hashAt'>;

export class MatchReporter {
  private sentHashes = 0;
  private lastHashAt = Number.NEGATIVE_INFINITY;
  private desyncSent = false;
  private resultSent = false;

  constructor(
    private readonly link: ReportLink,
    private readonly matchId: number,
    private readonly now: () => number,
  ) {}

  /** Call on every session update: sends the next unsent checkpoint (at most one per HASH_REPORT_MS) and reports a desync once. */
  update(s: ReportSession): void {
    const d = s.desync;
    if (d !== undefined) {
      if (this.desyncSent) return;
      this.desyncSent = true;
      this.link.sendDesync(this.matchId, d.tick, d.local, d.remote);
      // The relay answers a RESULT, and that answer stops the DESYNC resend. Ticks and hash differ per side, so it never agrees.
      this.send(RESULT_WINNER_NONE, RESULT_REASON.desync, d.tick, d.local);
      return;
    }
    const t = this.now();
    if (t - this.lastHashAt < HASH_REPORT_MS) return;
    const next = s.checkpoints()[this.sentHashes];
    if (next === undefined) return;
    this.lastHashAt = t;
    this.sentHashes++;
    this.link.sendHash(this.matchId, next[0], next[1]);
  }

  /** The match ended with `winner` (a team index, or -1 for nobody): sends RESULT once. */
  finish(s: ReportSession, winner: number): void {
    if (this.resultSent || s.desync !== undefined) return;
    const w = winner === 0 || winner === 1 ? winner : RESULT_WINNER_NONE;
    const r = s.forfeitReason;
    if (r === undefined) this.send(w, RESULT_REASON.natural, s.simTick, s.hashAt(s.simTick) ?? 0);
    // A forfeit or timeout ends at different ticks on the two sides, so only the winner is compared.
    else this.send(w, r === 'timeout' ? RESULT_REASON.timeout : RESULT_REASON.forfeit, 0, 0);
  }

  private send(winner: number, reason: number, ticks: number, finalHash: number): void {
    if (this.resultSent) return;
    this.resultSent = true;
    this.link.sendResult(this.matchId, winner, reason, ticks, finalHash);
  }
}
