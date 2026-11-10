import { stateArrays, type SimState } from './state';

/** Preallocated snapshot buffer: one array per state array, same type and length. */
export type SnapshotBuf = (Float64Array | Int32Array | Uint32Array)[];

export function createSnapshotBuf(s: SimState): SnapshotBuf {
  return stateArrays(s).map((a) => new (a.constructor as new (n: number) => typeof a)(a.length));
}

/** Copies state into buf with TypedArray.set; no allocation. */
export function snapshot(s: SimState, buf: SnapshotBuf): void {
  const arrs = stateArrays(s);
  if (buf.length !== arrs.length) throw new RangeError('bad snapshot buffer');
  arrs.forEach((a, i) => {
    const dst = buf[i];
    if (dst?.length !== a.length) throw new RangeError('bad snapshot buffer array length');
    (dst as Float64Array).set(a);
  });
}

/** Exact inverse of snapshot. */
export function restore(s: SimState, buf: SnapshotBuf): void {
  const arrs = stateArrays(s);
  if (buf.length !== arrs.length) throw new RangeError('bad snapshot buffer');
  arrs.forEach((a, i) => {
    const src = buf[i];
    if (src?.length !== a.length) throw new RangeError('bad snapshot buffer array length');
    (a as Float64Array).set(src);
  });
}

/**
 * Fixed-depth ring of snapshots keyed by tick; the oldest is overwritten when full. Each entry may carry an
 * `Extra` payload for state that lives outside SimState but must rewind with it: agent memory
 * (`SnapshotRing<AgentSnapshot>`, see agents/agent.ts) or session bookkeeping.
 */
export class SnapshotRing<Extra = undefined> {
  readonly depth: number;
  private readonly bufs: SnapshotBuf[];
  private readonly ticks: number[];
  private readonly extras: (Extra | undefined)[];
  private next = 0;
  private count = 0;

  constructor(template: SimState, depth: number) {
    if (!Number.isInteger(depth) || depth < 1) throw new RangeError('ring depth must be >= 1');
    this.depth = depth;
    this.bufs = Array.from({ length: depth }, () => createSnapshotBuf(template));
    this.ticks = new Array<number>(depth).fill(-1);
    this.extras = new Array<Extra | undefined>(depth).fill(undefined);
  }

  get size(): number {
    return this.count;
  }

  /** Stores a snapshot tagged with tick, plus an optional payload taken at the same tick. */
  push(s: SimState, tick: number, extra?: Extra): void {
    snapshot(s, this.bufs[this.next] as SnapshotBuf);
    this.ticks[this.next] = tick;
    this.extras[this.next] = extra;
    this.next = (this.next + 1) % this.depth;
    if (this.count < this.depth) this.count++;
  }

  /**
   * Restores the newest snapshot taken at `tick` and drops every entry pushed after it (they belong to the
   * timeline being rewound). `onExtra` receives the payload pushed with it, so the caller restores it in the same
   * step (for example `(a) => { if (a) loadAgents(agents, a); }`). Returns false, changing nothing, when no
   * snapshot of that tick is held.
   */
  restoreTick(s: SimState, tick: number, onExtra?: (extra: Extra | undefined) => void): boolean {
    for (let k = 0; k < this.count; k++) {
      const i = (this.next - 1 - k + this.depth) % this.depth;
      if (this.ticks[i] !== tick) continue;
      restore(s, this.bufs[i] as SnapshotBuf);
      onExtra?.(this.extras[i]);
      for (let j = 1; j <= k; j++) {
        this.ticks[(i + j) % this.depth] = -1;
        this.extras[(i + j) % this.depth] = undefined;
      }
      this.next = (i + 1) % this.depth;
      this.count -= k;
      return true;
    }
    return false;
  }

  /** Oldest to newest held ticks. */
  heldTicks(): number[] {
    const out: number[] = [];
    const start = (this.next - this.count + this.depth) % this.depth;
    for (let i = 0; i < this.count; i++) out.push(this.ticks[(start + i) % this.depth] as number);
    return out;
  }
}
