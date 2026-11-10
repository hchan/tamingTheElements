import { stateArrays, type SimState } from './state';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
/** High word of the canonical quiet NaN 0x7ff8000000000000 (its low word is 0). */
const NAN_HI = 0x7ff80000;

/** One-element float view and its two 32-bit words; LO/HI pick the low and high word on this platform. */
const f64 = new Float64Array(1);
const f64Words = new Uint32Array(f64.buffer);
const LO = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1 ? 0 : 1;
const HI = 1 - LO;

/** FNV-1a over the 4 bytes of a 32-bit word, least significant byte first, whatever the platform byte order. */
function fnvWord(h: number, word: number): number {
  let x = h;
  x = Math.imul(x ^ (word & 0xff), FNV_PRIME);
  x = Math.imul(x ^ ((word >>> 8) & 0xff), FNV_PRIME);
  x = Math.imul(x ^ ((word >>> 16) & 0xff), FNV_PRIME);
  x = Math.imul(x ^ (word >>> 24), FNV_PRIME);
  return x;
}

/**
 * FNV-1a 32 over every state array in stateArrays order, each value as little-endian bytes (a Float64 as its
 * low then high 32-bit word, an Int32/Uint32 as one word). Words are read numerically and split with shifts,
 * so the result does not depend on the platform byte order. -0 hashes as +0 and every NaN (detected with
 * `v !== v`) as the canonical words (0, 0x7ff80000), so numerically equal states always hash equal and NaN
 * payload bits, which engines may change, never reach the hash.
 */
export function hash(s: SimState): number {
  let h = FNV_OFFSET;
  for (const a of stateArrays(s)) {
    if (a instanceof Float64Array) {
      for (let i = 0; i < a.length; i++) {
        const v = a[i] as number;
        if (v !== v) {
          h = fnvWord(fnvWord(h, 0), NAN_HI);
        } else if (v === 0) {
          h = fnvWord(fnvWord(h, 0), 0);
        } else {
          f64[0] = v;
          h = fnvWord(fnvWord(h, f64Words[LO] as number), f64Words[HI] as number);
        }
      }
    } else {
      for (let i = 0; i < a.length; i++) h = fnvWord(h, (a[i] as number) >>> 0);
    }
  }
  return h >>> 0;
}

/** Debug check: throws if any float field is NaN or infinite. No-op when enabled is false. */
export function assertNoNaN(s: SimState, enabled = true): void {
  if (!enabled) return;
  for (const a of stateArrays(s)) {
    if (!(a instanceof Float64Array)) continue;
    for (let i = 0; i < a.length; i++) {
      if (!Number.isFinite(a[i])) throw new Error(`non-finite value in sim state at index ${String(i)}`);
    }
  }
}
