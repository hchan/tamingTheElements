// Authoring helper for the scripted Arcade goldens (tools/gen/arcade-moves.ts): a track is one player's input as a
// list of named steps with durations, so a script reads as a plan ("dash right for 12 ticks, wait, tap guard") and not
// as a wall of bitmasks. Tools only: nothing here is shipped or imported by src/.
import { Cmd, type Command } from '../../src/core/sim/commands';

export { Cmd };

/** One player's commands, built left to right. Every method returns the track, so steps chain. */
export class Track {
  private readonly cmds: Command[] = [];
  /** Step names with their start tick, for traces and failure messages. */
  readonly marks: { readonly name: string; readonly tick: number }[] = [];

  /** The next tick to be written. */
  get tick(): number {
    return this.cmds.length;
  }

  /** Holds `cmd` (a Cmd bit mask, 0 for nothing) for `ticks` ticks. */
  step(name: string, cmd: Command, ticks: number): this {
    if (!Number.isInteger(ticks) || ticks < 0) throw new RangeError(`step "${name}": bad duration ${String(ticks)}`);
    this.marks.push({ name, tick: this.tick });
    for (let i = 0; i < ticks; i++) this.cmds.push(cmd);
    return this;
  }

  /** No input for `ticks` ticks. */
  wait(ticks: number): this {
    return this.step('wait', 0, ticks);
  }

  /** A press: `cmd` held for `hold` ticks (one rising edge), then released for `release` ticks. */
  tap(name: string, cmd: Command, hold = 1, release = 1): this {
    return this.step(name, cmd, hold).wait(release);
  }

  /** Idles until the absolute tick `tick`; throws when the script is already past it (a timing slip in the plan). */
  until(tick: number): this {
    if (tick < this.tick) throw new RangeError(`until(${String(tick)}): already at tick ${String(this.tick)}`);
    return this.wait(tick - this.tick);
  }

  /** The commands, idle-padded to `ticks` ticks. */
  build(ticks: number = this.tick): Command[] {
    if (ticks < this.tick) throw new RangeError(`track has ${String(this.tick)} ticks, more than ${String(ticks)}`);
    return [...this.cmds, ...new Array<Command>(ticks - this.tick).fill(0)];
  }
}

/** Two tracks of the same length, ready for the recorder. */
export function buildScript(p1: Track, p2: Track, ticks = Math.max(p1.tick, p2.tick)): readonly [Command[], Command[]] {
  return [p1.build(ticks), p2.build(ticks)];
}
