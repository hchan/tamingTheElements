import { REORDER_HOLD_MAX, REORDER_SKIP_MS } from './constants';

/**
 * Receiver side of spec section 6 for the numbered match-phase frames (BATCH, HASH, DESYNC, PAUSE, RESULT; not SETUP).
 * `seq` is a wrapping u32. Duplicates and stale frames are dropped, a gap is held up to `REORDER_HOLD_MAX` frames and
 * `REORDER_SKIP_MS`, then the receiver skips ahead and delivers what it holds. Time is injected.
 */
export class ReorderBuffer<T> {
  private next = 0;
  private readonly held = new Map<number, T>();
  private gapSince: number | undefined;

  constructor(
    private readonly holdMax = REORDER_HOLD_MAX,
    private readonly skipMs = REORDER_SKIP_MS,
  ) {}

  get nextSeq(): number {
    return this.next;
  }

  get holding(): number {
    return this.held.size;
  }

  /** Offers one frame; returns the frames now deliverable, in order. */
  push(seq: number, item: T, nowMs: number): T[] {
    const ahead = (seq - this.next) >>> 0;
    if (ahead >= 0x80000000) return [];
    const out: T[] = [];
    if (ahead === 0) {
      out.push(item);
      this.next = (this.next + 1) >>> 0;
      this.drain(out);
    } else if (this.held.has(seq)) {
      return [];
    } else {
      this.held.set(seq, item);
    }
    this.settle(out, nowMs);
    return out;
  }

  /** Call on a timer: releases held frames when the gap has outlived the skip timeout. */
  poll(nowMs: number): T[] {
    const out: T[] = [];
    this.settle(out, nowMs);
    return out;
  }

  private drain(out: T[]): void {
    for (;;) {
      const item = this.held.get(this.next);
      if (item === undefined) return;
      this.held.delete(this.next);
      out.push(item);
      this.next = (this.next + 1) >>> 0;
    }
  }

  private settle(out: T[], nowMs: number): void {
    if (this.held.size === 0) {
      this.gapSince = undefined;
      return;
    }
    this.gapSince ??= nowMs;
    if (this.held.size <= this.holdMax && nowMs - this.gapSince < this.skipMs) return;
    const seqs = [...this.held.keys()].sort(
      (a, b) => ((a - this.next) >>> 0) - ((b - this.next) >>> 0),
    );
    for (const s of seqs) out.push(this.held.get(s) as T);
    this.next = ((seqs[seqs.length - 1] as number) + 1) >>> 0;
    this.held.clear();
    this.gapSince = undefined;
  }
}
