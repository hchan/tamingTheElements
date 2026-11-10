import { type Command, NO_COMMAND } from '../sim/commands';
import type { Agent, ObservationView } from './agent';

/** Plays back a recorded command array indexed by tick; past the end it returns NO_COMMAND. */
export class ReplayAgent implements Agent {
  readonly id: string;
  private readonly inputs: readonly Command[];

  constructor(inputs: readonly Command[], id = 'replay') {
    this.inputs = inputs;
    this.id = id;
  }

  observe(_view: ObservationView, tick: number): Command {
    return this.inputs[tick] ?? NO_COMMAND;
  }
}
