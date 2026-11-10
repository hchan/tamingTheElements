import { Cmd, type Command } from '../sim/commands';
import type { Agent, ObservationView } from './agent';

const MOVES = [
  0,
  Cmd.up,
  Cmd.down,
  Cmd.left,
  Cmd.right,
  Cmd.up | Cmd.left,
  Cmd.up | Cmd.right,
  Cmd.down | Cmd.left,
  Cmd.down | Cmd.right,
] as const;

/** "Sticky" random bot: each tick, with p=1/10, resamples movement and the primary/secondary bits. */
export class RandomBot implements Agent {
  readonly id: string;
  private held: Command = 0;

  constructor(id = 'random') {
    this.id = id;
  }

  observe(view: ObservationView): Command {
    if (view.aiInt(10) === 0) {
      let c: number = MOVES[view.aiInt(MOVES.length)] ?? 0;
      if (view.aiInt(2) === 1) c |= Cmd.primary;
      if (view.aiInt(4) === 0) c |= Cmd.secondary;
      this.held = c;
    }
    return this.held;
  }
}
