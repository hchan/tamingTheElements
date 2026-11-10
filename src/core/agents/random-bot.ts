import { Cmd, type Command } from '../sim/commands';
import type { Agent, ObservationView } from './agent';
import { AgentRng } from './agent-rng';

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
  private readonly rng = new AgentRng();

  constructor(id = 'random') {
    this.id = id;
  }

  observe(view: ObservationView): Command {
    const rng = this.rng;
    if (rng.int(view, 10) === 0) {
      let c: number = MOVES[rng.int(view, MOVES.length)] ?? 0;
      if (rng.int(view, 2) === 1) c |= Cmd.primary;
      if (rng.int(view, 4) === 0) c |= Cmd.secondary;
      this.held = c;
    }
    return this.held;
  }
}
