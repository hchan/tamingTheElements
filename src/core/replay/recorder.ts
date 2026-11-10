import type { Command } from '../sim/commands';
import { hash } from '../sim/hash';
import type { MatchSetup } from '../sim/match';
import { World } from '../sim/state';
import type { SimWorld } from '../sim/world';
import { HASH_INTERVAL, headerFromSetup, type ReplayFile } from './format';
import { rleEncode } from './rle';

/** Records the commands fed to `step` plus a state hash every HASH_INTERVAL ticks. */
export class ReplayRecorder {
  private readonly in0: number[] = [];
  private readonly in1: number[] = [];
  private readonly hashes: number[] = [];

  constructor(private readonly setup: MatchSetup) {}

  /** Call immediately before `step(world, cmds)` with the same commands. */
  record(world: SimWorld, cmds: readonly [Command, Command]): void {
    const tick = world.state.world[World.tick] ?? 0;
    if (tick !== this.in0.length) throw new Error(`recorder out of sync: tick ${String(tick)}, recorded ${String(this.in0.length)}`);
    if (tick % HASH_INTERVAL === 0) this.hashes.push(hash(world.state));
    this.in0.push(cmds[0]);
    this.in1.push(cmds[1]);
  }

  /** Call after the last `step`. `cheats` flags the header (tester mode: the replay is not reproducible). */
  finish(world: SimWorld, cheats = false): ReplayFile {
    return {
      header: headerFromSetup(this.setup, this.in0.length, cheats),
      inputs: [rleEncode(this.in0), rleEncode(this.in1)],
      hashes: this.hashes.slice(),
      finalHash: hash(world.state),
    };
  }
}
