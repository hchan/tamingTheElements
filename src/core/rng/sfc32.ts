const TWO_POW_32 = 4294967296;
/** Largest n for which `u32 * n` stays below 2^53, so the reduction in `int` is exact. */
const MAX_INT_RANGE = 2097152;

/** sfc32 (Chris Doty-Humphrey) with 128-bit state in 4 x uint32. Integer-only, bit-exact everywhere. */
export class Sfc32 {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;

  constructor(state: ArrayLike<number>) {
    this.loadState(state);
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (((this.c << 21) | (this.c >>> 11)) + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1): u32 / 2^32. */
  nextFloat(): number {
    return this.nextU32() / TWO_POW_32;
  }

  /** Uniform integer in [0, n). `n` must be an integer in [1, 2^21]. */
  int(n: number): number {
    if (!Number.isInteger(n) || n < 1 || n > MAX_INT_RANGE) {
      throw new RangeError(`int(n) requires an integer 1..${String(MAX_INT_RANGE)}, got ${String(n)}`);
    }
    return Math.floor((this.nextU32() * n) / TWO_POW_32);
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new RangeError('pick() on empty array');
    return arr[this.int(arr.length)] as T;
  }

  /** True with probability p (p <= 0 never, p >= 1 always). */
  chance(p: number): boolean {
    return this.nextFloat() < p;
  }

  saveState(): Uint32Array {
    return new Uint32Array([this.a, this.b, this.c, this.d]);
  }

  loadState(state: ArrayLike<number>): void {
    if (state.length !== 4) throw new RangeError('sfc32 state must have 4 words');
    this.a = (state[0] ?? 0) | 0;
    this.b = (state[1] ?? 0) | 0;
    this.c = (state[2] ?? 0) | 0;
    this.d = (state[3] ?? 0) | 0;
  }
}
