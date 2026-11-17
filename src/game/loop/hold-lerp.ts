/**
 * Render-side position fraction that stays smooth through clock holds (hit-stop, super freeze, KO slow-mo).
 * `step()` skips movement on held ticks, so px/py stay stale; lerping them with the wall-clock alpha would replay the
 * last step every 20 ms. Sample once per frame after the driver ran its ticks; `fraction(alpha)` then gives the lerp
 * weight for positions (alpha itself stays for timing effects). Pure: no Phaser, no DOM.
 */
const MAX_JUMP = 8;

export class HoldLerp {
  private has = false;
  private lastTick = 0;
  private lastGame = 0;
  private since = 0;
  private span = 1;

  /** Feeds the world tick, the game clock and the facts about the NEXT step (freeze, KO slow-mo hold). */
  sample(tick: number, gameTick: number, frozenNext: boolean, slowHoldNext: boolean): void {
    if (!this.has || tick < this.lastTick || gameTick < this.lastGame || tick - this.lastTick > MAX_JUMP) {
      this.since = 0;
      this.span = 1;
    } else {
      const dW = tick - this.lastTick;
      const dG = gameTick - this.lastGame;
      if (dG === 0) {
        this.since += dW;
      } else if (dW === dG) {
        this.since = 0;
        this.span = slowHoldNext && !frozenNext ? 2 : 1;
      } else if (frozenNext) {
        this.since = 1;
        this.span = 1;
      } else {
        this.since = 0;
        this.span = slowHoldNext ? 2 : 1;
      }
    }
    this.has = true;
    this.lastTick = tick;
    this.lastGame = gameTick;
  }

  /** Lerp weight in [0,1] for positions; equals `alpha` bit for bit when nothing is held. */
  fraction(alpha: number): number {
    return Math.min(1, (this.since + alpha) / this.span);
  }

  reset(): void {
    this.has = false;
    this.since = 0;
    this.span = 1;
  }
}
