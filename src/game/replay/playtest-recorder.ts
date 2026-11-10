import { ReplayRecorder, type Command, type MatchSetup, type ReplayFile, type SimWorld } from '@core/index';

/**
 * Records the commands a human match feeds to the sim, hashing the live world itself. Agents (the enemy bot)
 * keep their randomness and memory to themselves and `step` is the only thing that mutates SimState, so the
 * live world is exactly what a replay of the recorded commands rebuilds; no shadow world is needed.
 */
export class PlaytestRecorder {
  private readonly rec: ReplayRecorder;
  private world: SimWorld | undefined;
  private valid = true;

  constructor(setup: MatchSetup) {
    this.rec = new ReplayRecorder(setup);
  }

  /** Call with the live world and the final command pair of every live tick, immediately before the live step. */
  record(world: SimWorld, cmds: readonly [Command, Command]): void {
    if (!this.valid) return;
    if (this.world !== undefined && this.world !== world) throw new Error('PlaytestRecorder records one world');
    this.world = world;
    this.rec.record(world, cmds);
  }

  /** The live world was changed outside the command stream (test cheats): the recording would not verify. */
  invalidate(): void {
    this.valid = false;
  }

  /** The replay (final hash taken from the live world now), or undefined when nothing was recorded or it was invalidated. */
  finish(): ReplayFile | undefined {
    return this.valid && this.world !== undefined ? this.rec.finish(this.world) : undefined;
  }
}
