// Pure run counter for tools/sim/stun-lock.ts: an unbroken stun run measured in world ticks (W, every step including
// hit-stop and the super freeze) and in game ticks (the sim clock, which holds still during those).
export class StunRunCounter {
  private w = 0;
  private startGame = 0;
  /** Longest run in world ticks so far. */
  longestW = 0;
  /** Longest run in game ticks so far (first to last stunned step, inclusive). */
  longestGame = 0;

  /** Feeds one world tick: whether the character is stunned and the sim's game tick. Returns the W-length of a run that just ended, else 0. */
  tick(stunned: boolean, game: number): number {
    if (stunned) {
      if (this.w === 0) this.startGame = game;
      this.w++;
      if (this.w > this.longestW) this.longestW = this.w;
      const g = game - this.startGame + 1;
      if (g > this.longestGame) this.longestGame = g;
      return 0;
    }
    const ended = this.w;
    this.w = 0;
    return ended;
  }
}
