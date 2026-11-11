import type { SimEvent } from '@core/index';

/**
 * Under rollback the session re-emits an event whose payload changed (a correction) under the same stable id. Sounds and
 * effects must not play twice, so the Arena shows each id once and ignores later corrections; a retracted event cannot be
 * un-played, so it is not tracked at all. Ids older than `keep` ticks are forgotten (corrections arrive within the rollback window).
 */
export class PlayOnce {
  private readonly seen = new Map<number, Set<string>>();
  constructor(private readonly keep = 16) {}

  /** The events not shown before; the input array itself when nothing was a repeat. */
  fresh(events: readonly SimEvent[]): readonly SimEvent[] {
    let out: SimEvent[] | undefined;
    for (let i = 0; i < events.length; i++) {
      const e = events[i] as SimEvent;
      let ids = this.seen.get(e.tick);
      if (ids === undefined) {
        ids = new Set();
        this.seen.set(e.tick, ids);
      }
      const key = `${String(e.sourceId)}:${String(e.kind)}:${String(e.seq)}`;
      if (ids.has(key)) {
        out ??= events.slice(0, i);
      } else {
        ids.add(key);
        out?.push(e);
      }
    }
    if (events.length > 0) {
      const newest = (events[events.length - 1] as SimEvent).tick;
      for (const t of this.seen.keys()) if (t < newest - this.keep) this.seen.delete(t);
    }
    return out ?? events;
  }
}
