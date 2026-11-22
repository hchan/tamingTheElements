/** Hold at most this many out-of-order frames (docs/ONLINE-PROTOCOL.md section 6, [choice]). */
export const REORDER_MAX_HELD = 8;
/** A seq further ahead of `next` than this is dropped, so a bad relay cannot make every real frame stale (spec section 6) [choice]. */
export const REORDER_LEAD_MAX = 512;
/** Wait this long (2 ticks) for a gap to fill before skipping ahead [choice]. */
export const REORDER_SKIP_MS = 40;
/** Most skipped-over seqs remembered so a late arrival can still be accepted (oldest forgotten first) [choice]. */
export const REORDER_GAPS_MAX = 64;

/**
 * Per-sender reorder buffer. `push` and `poll` return the items now deliverable, in seq order. Duplicates and stale
 * frames are dropped, as is a seq more than `REORDER_LEAD_MAX` ahead; a gap that does not fill within `REORDER_SKIP_MS`, or a full buffer, skips ahead (late frames
 * are then stale). A seq that was skipped over (never delivered) is remembered (`REORDER_GAPS_MAX`); when it arrives late, `push(..., acceptLate = true)` returns it
 * (counted in `late`) instead of dropping it: for BATCH, whose inputs are idempotent and order independent, a late frame is still wanted. Time is passed in (no clock reads here). Seq compare is wrap-safe (u32).
 */
export class ReorderBuffer<T> {
  private next: number;
  private held: { readonly seq: number; readonly item: T; readonly done: boolean }[] = [];
  private since = 0;
  dropped = 0;
  skipped = 0;
  /** Skipped-over frames that arrived late and were delivered (`acceptLate`). */
  late = 0;
  private gaps: number[] = [];

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

  /**
   * `immediate` (BATCH: idempotent, order independent) delivers a frame at once even after a gap; its seq is remembered (so a repeat is dropped)
   * and later in-order frames (PAUSE) still wait for the gap. `acceptLate` as above.
   */
  push(seq: number, item: T, now: number, acceptLate = false, immediate = false): T[] {
    const d = (seq - this.next) | 0;
    const g = d < 0 && acceptLate ? this.gaps.indexOf(seq >>> 0) : -1;
    if (g >= 0) {
      this.gaps.splice(g, 1);
      this.late++;
      return [item];
    }
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
      this.held.push({ seq, item, done: immediate });
      this.held.sort((a, b) => ((a.seq - b.seq) | 0));
      const rest = this.held.length > REORDER_MAX_HELD ? this.skip() : [];
      return immediate ? [item, ...rest] : rest;
    }
    this.next = (this.next + 1) >>> 0;
    return [item, ...this.drain(now)];
  }

  /** Releases held frames whose gap has waited long enough. */
  poll(now: number): T[] {
    return this.held.length > 0 && now - this.since >= REORDER_SKIP_MS ? this.skip() : [];
  }

  private drain(now: number): T[] {
    const out: T[] = [];
    for (let h = this.held[0]; h && h.seq === this.next; h = this.held[0]) {
      if (!h.done) out.push(h.item);
      this.held.shift();
      this.next = (this.next + 1) >>> 0;
    }
    if (this.held.length > 0) this.since = now; // Wait for the next gap from here, not from the first arrival.
    return out;
  }

  private skip(): T[] {
    const out = this.held.filter((h) => !h.done).map((h) => h.item);
    const last = this.held[this.held.length - 1];
    if (last) {
      const have = new Set(this.held.map((h) => h.seq));
      for (let q = this.next; q !== last.seq; q = (q + 1) >>> 0) if (!have.has(q)) this.gaps.push(q);
      if (this.gaps.length > REORDER_GAPS_MAX) this.gaps.splice(0, this.gaps.length - REORDER_GAPS_MAX);
      this.next = (last.seq + 1) >>> 0;
    }
    this.skipped++;
    this.held = [];
    return out;
  }
}
