import type { RenderView, SimEvent } from '@core/index';
import { SimEventKind } from '@core/index';

/**
 * The Cleanse box's cooldown, read from the `cleanse` events the view already receives. `RenderActionBar` carries no Cleanse data
 * (the sim keeps `cleanseReadyAt` per character and the AI reads it through `ArcadeView.cleanseIn`), so the view counts the 10 s
 * itself from the cast. It is exact for a live match, a replay and an online match alike: every cast is an event, and a cast
 * is the only thing that moves the sim's ready tick. Presentation only; nothing here feeds back into the sim.
 */

import { CLEANSE_COOLDOWN } from '../platform/cleanse-info';

export { CLEANSE_COOLDOWN };

export class CleanseClock {
  private readonly readyAt = new Map<number, number>();
  private round = -1;
  private last = 0;

  /** Records every `cleanse` event of one tick's batch; `tick` is the game tick the batch was produced on. */
  consume(events: readonly SimEvent[], tick: number): void {
    for (const e of events) {
      if (e.kind === SimEventKind.cleanse) this.readyAt.set(e.sourceId, tick + CLEANSE_COOLDOWN);
    }
  }

  /** Forgets every cooldown when a new round starts (or the clock runs backwards), as the sim's round reset does. */
  sync(round: number, tick: number): void {
    if (round !== this.round || tick < this.last) this.readyAt.clear();
    this.round = round;
    this.last = tick;
  }

  /** Game ticks until hero `id` may cleanse again (0: now). */
  leftIn(id: number, tick: number): number {
    return Math.max(0, (this.readyAt.get(id) ?? 0) - tick);
  }
}

const clocks = new WeakMap<RenderView, CleanseClock>();

/** The one clock of a render view. */
export function cleanseClockOf(view: RenderView): CleanseClock {
  let c = clocks.get(view);
  if (!c) {
    c = new CleanseClock();
    clocks.set(view, c);
  }
  return c;
}
