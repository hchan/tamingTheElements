import {
  HASH_INTERVAL,
  World,
  createMatch,
  hash,
  rleDecode,
  setupFromHeader,
  step,
  type ReplayFile,
  type SimEvent,
  type SimWorld,
} from '@core/index';

export type CursorState = 'playing' | 'ok' | 'diverged';

export interface Divergence {
  /** Checkpoint tick of the first mismatch (tickCount for the final hash). */
  readonly tick: number;
  readonly expected: number;
  readonly actual: number;
}

/** Plays a replay one tick at a time on a live world, checking each recorded hash as its tick is reached. */
export class ReplayCursor {
  readonly world: SimWorld;
  private readonly in0: number[];
  private readonly in1: number[];
  private current: CursorState = 'playing';
  private bad: Divergence | undefined;

  constructor(private readonly replay: ReplayFile) {
    this.in0 = rleDecode(replay.inputs[0]);
    this.in1 = rleDecode(replay.inputs[1]);
    const n = replay.header.tickCount;
    if (this.in0.length !== n || this.in1.length !== n) throw new Error('replay input length does not match tickCount');
    this.world = createMatch(setupFromHeader(replay.header));
    this.check(0);
  }

  get state(): CursorState {
    return this.current;
  }

  get tick(): number {
    return this.world.state.world[World.tick] ?? 0;
  }

  get total(): number {
    return this.replay.header.tickCount;
  }

  get divergence(): Divergence | undefined {
    return this.bad;
  }

  /** Steps one tick and returns its events; undefined once finished or diverged. */
  next(): readonly SimEvent[] | undefined {
    if (this.current !== 'playing') return undefined;
    const t = this.tick;
    if (t >= this.total) {
      this.check(t);
      return undefined;
    }
    const events = step(this.world, [this.in0[t] ?? 0, this.in1[t] ?? 0]);
    this.check(t + 1);
    return events;
  }

  private check(t: number): void {
    const n = this.total;
    const expected = t === n ? this.replay.finalHash : t % HASH_INTERVAL === 0 ? this.replay.hashes[t / HASH_INTERVAL] : undefined;
    if (expected === undefined && t !== n) return;
    const actual = hash(this.world.state);
    if (actual !== expected) {
      this.current = 'diverged';
      this.bad = { tick: t, expected: expected ?? 0, actual };
    } else if (t === n) {
      this.current = 'ok';
    }
  }
}
