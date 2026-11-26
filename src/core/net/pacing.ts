import { ONLINE_CATCH_UP_MAX_DEBT } from './limits';
/**
 * Frame-advantage pacing hint for the online driver (GGPO style). Pure integer logic, no clock: the driver feeds
 * `session.frameAdvantage()` once per frame and skips the update when `shouldSkip` says so. Skipping only delays our own
 * wall tick; it never changes what the sim computes (inputs are stamped per tick, so hashes stay the same).
 *
 * The advantage is measured from the peer's input packets, so it lags by the one-way latency: that makes it read a little
 * high on both sides of a slow link, which at worst skips a frame a stall would have eaten anyway.
 */
export class FramePacer {
  /** Frames skipped so far (stats). */
  skipped = 0;
  private frame = 0;

  constructor(
    /** Skip only while the advantage is more than this many ticks (default 1); never below 0 skips. */
    private readonly threshold = 1,
    /** Skip one frame in every N while ahead (default 4). */
    private readonly every = 4,
  ) {}

  /** Call once per rendered frame before `update`. True means: do not call `session.update` this frame. */
  shouldSkip(advantage: number): boolean {
    this.frame++;
    if (advantage <= this.threshold || this.frame % this.every !== 0) return false;
    this.skipped++;
    return true;
  }
}

/**
 * Stall catch-up for the online driver. A wall tick on which `session.update` could not step (a stalled or late peer) used to
 * be lost for good, so the match ran slower than real time. The driver records each such tick as debt and repays it with one
 * extra update on later ticks that did step, so the sim returns to 50 Hz on average. The session still steps only inside its
 * own rollback window, so repaying can never run ahead of the peer's inputs; it never changes what the sim computes.
 * `maxDebt` bounds a long stall (a hidden tab) so it is forgiven instead of fast-forwarded.
 */
export class CatchUp {
  private debt = 0;

  constructor(private readonly maxDebt = ONLINE_CATCH_UP_MAX_DEBT) {}

  get owed(): number {
    return this.debt;
  }

  /** Call once per wall tick with whether the first update stepped. Returns true when the driver should run one extra update. */
  tick(stepped: boolean): boolean {
    if (!stepped) this.debt = Math.min(this.debt + 1, this.maxDebt);
    return stepped && this.debt > 0;
  }

  /** Call after the extra update; only a real step pays a tick back. */
  paid(stepped: boolean): void {
    if (stepped && this.debt > 0) this.debt--;
  }
  /** One driver tick: after `stepped`, run `again` (one more update, returns whether it stepped) when a debt is owed. */
  repay(stepped: boolean, again: () => boolean): void {
    if (this.tick(stepped)) this.paid(again());
  }
}
