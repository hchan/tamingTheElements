/** Hold at most this many out-of-order frames (docs/ONLINE-PROTOCOL.md section 6, [choice]). */
export const REORDER_MAX_HELD = 8;
/** A seq further ahead of `next` than this is dropped, so a bad relay cannot make every real frame stale (spec section 6) [choice]. */
export const REORDER_LEAD_MAX = 512;
/** Wait this long (2 ticks) for a gap to fill before skipping ahead [choice]. */
export const REORDER_SKIP_MS = 40;

/**
 * Per-sender reorder buffer. `push` and `poll` return the items now deliverable, in seq order. Duplicates and stale
 * frames are dropped, as is a seq more than `REORDER_LEAD_MAX` ahead; a gap that does not fill within `REORDER_SKIP_MS`, or a full buffer, skips ahead (late frames
 * are then stale). Time is passed in (no clock reads here). Seq compare is wrap-safe (u32).
 */
export class ReorderBuffer<T> {
  private next: number;
  private held: { readonly seq: number; readonly item: T }[] = [];
  private since = 0;
  dropped = 0;
  skipped = 0;

  /** `start` is the first expected seq (0 at match start; a resumed link continues its counter). */
  constructor(start = 0) {
    this.next = start >>> 0;
  }

  /** Next seq expected (first not yet delivered). */
  get nextSeq(): number {
    return this.next;
  }

  get pending(): number {
    return this.held.length;
  }

  push(seq: number, item: T, now: number): T[] {
    const d = (seq - this.next) | 0;
    if (d < 0 || this.held.some((h) => h.seq === seq)) {
      this.dropped++;
      return [];
    }
    if (d > REORDER_LEAD_MAX) {
      this.dropped++;
      return [];
    }
    if (d > 0) {
      if (this.held.length === 0) this.since = now;
      this.held.push({ seq, item });
      this.held.sort((a, b) => ((a.seq - b.seq) | 0));
      return this.held.length > REORDER_MAX_HELD ? this.skip() : [];
    }
    this.next = (this.next + 1) >>> 0;
    return [item, ...this.drain()];
  }

  /** Releases held frames whose gap has waited long enough. */
  poll(now: number): T[] {
    return this.held.length > 0 && now - this.since >= REORDER_SKIP_MS ? this.skip() : [];
  }

  private drain(): T[] {
    const out: T[] = [];
    for (let h = this.held[0]; h && h.seq === this.next; h = this.held[0]) {
      out.push(h.item);
      this.held.shift();
      this.next = (this.next + 1) >>> 0;
    }
    return out;
  }

  private skip(): T[] {
    const out = this.held.map((h) => h.item);
    const last = this.held[this.held.length - 1];
    if (last) this.next = (last.seq + 1) >>> 0;
    this.skipped++;
    this.held = [];
    return out;
  }
}
