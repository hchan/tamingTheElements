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
