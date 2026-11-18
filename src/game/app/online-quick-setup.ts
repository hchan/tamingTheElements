import { SetupHandshake, helloOf, type ControlPipe, type MatchSetup } from '@core/index';
import { decodePick, encodePick, onlineSetup, type OnlinePick } from './online-pick';

/**
 * Setup flow of an online quick match, over one control pipe (the `WebSocketTransport.control` stream): swap hero picks, derive
 * the identical MatchSetup (slot 0 = team 0; the SERVER's seed from MATCH_START, so neither side picks it), then run the
 * SetupHandshake. Drive `poll()` every 50 ms (and call `transport.tick()` first so the control link resends).
 * The opponent's pick may arrive before ours is sent: it is read once and kept, and exactly one message is consumed
 * for it so the handshake's HELLO stays queued.
 */
export type QuickSetupResult =
  | 'waiting'
  | { readonly t: 'go'; readonly setup: MatchSetup }
  | { readonly t: 'rejected'; readonly reason: string | undefined };

export class QuickSetup {
  private mine: OnlinePick | undefined;
  private theirs: OnlinePick | undefined;
  private hs: SetupHandshake | undefined;
  private setup: MatchSetup | undefined;
  /** Set when the opponent sent a pick that does not decode. */
  private bad = false;

  constructor(
    private readonly control: ControlPipe,
    private readonly slot: 0 | 1,
    private readonly seed: number,
  ) {}

  /** Send our choice (a lead and a bench); a second call is ignored. */
  ready(pick: Omit<OnlinePick, 'seed'>): void {
    if (this.mine !== undefined) return;
    this.mine = { ...pick, seed: this.seed >>> 0 };
    this.control.send(encodePick(this.mine));
  }

  get picked(): boolean {
    return this.mine !== undefined;
  }

  poll(): QuickSetupResult {
    if (this.bad) return { t: 'rejected', reason: 'malformed' };
    if (this.theirs === undefined) {
      const m = this.control.receive();
      if (m !== undefined) {
        const p = decodePick(m);
        if (p === undefined) {
          this.bad = true;
          return { t: 'rejected', reason: 'malformed' };
        }
        this.theirs = p;
      }
    }
    if (this.mine === undefined || this.theirs === undefined) return 'waiting';
    if (this.hs === undefined || this.setup === undefined) {
      const mine = { ...this.mine, seed: this.seed >>> 0 };
      const theirs = { ...this.theirs, seed: this.seed >>> 0 };
      this.setup = this.slot === 0 ? onlineSetup(mine, theirs) : onlineSetup(theirs, mine);
      this.hs = new SetupHandshake(this.control, helloOf(this.setup));
    }
    const phase = this.hs.poll();
    if (phase === 'go') return { t: 'go', setup: this.setup };
    if (phase === 'rejected') return { t: 'rejected', reason: this.hs.reason };
    return 'waiting';
  }
}
