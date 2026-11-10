import { ReplayRecorder, createMatch, step, type Command, type MatchSetup, type ReplayFile, type SimWorld } from '@core/index';

/**
 * Records the commands a human match feeds to the sim. Live agents (the enemy bot) draw from RNG streams
 * stored in the live world, which a replay never re-runs, so the recording keeps its own shadow world
 * and steps it with exactly the commands the live world received.
 */
export class PlaytestRecorder {
  private readonly world: SimWorld;
  private readonly rec: ReplayRecorder;
  private ticks = 0;
  private valid = true;

  constructor(setup: MatchSetup) {
    this.world = createMatch(setup);
    this.rec = new ReplayRecorder(setup);
  }

  /** Call with the final command pair of every live tick (immediately before the live step). */
  record(cmds: readonly [Command, Command]): void {
    if (!this.valid) return;
    this.rec.record(this.world, cmds);
    step(this.world, cmds);
    this.ticks++;
  }

  /** The live world was changed outside the command stream (test cheats): the recording would not verify. */
  invalidate(): void {
    this.valid = false;
  }

  /** The replay, or undefined when nothing was recorded or it was invalidated. */
  finish(): ReplayFile | undefined {
    return this.valid && this.ticks > 0 ? this.rec.finish(this.world) : undefined;
  }
}
