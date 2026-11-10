import { stateArrays, type SimState } from './state';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const scratchF64 = new Float64Array(64);

function fnvBytes(h: number, bytes: Uint8Array): number {
  let x = h;
  for (let i = 0; i < bytes.length; i++) {
    x ^= bytes[i] as number;
    x = Math.imul(x, FNV_PRIME);
  }
  return x >>> 0;
}

/**
 * FNV-1a 32 over the byte views of every state array in stateArrays order. Float64 data is
 * copied to a scratch buffer first with -0 -> +0 and every NaN -> the canonical NaN, so
 * numerically equal states always hash equal.
 */
export function hash(s: SimState): number {
  let h = FNV_OFFSET;
  for (const a of stateArrays(s)) {
    if (a instanceof Float64Array) {
      const scratch = a.length <= scratchF64.length ? scratchF64 : new Float64Array(a.length);
      for (let i = 0; i < a.length; i++) {
        const v = a[i] as number;
        scratch[i] = v === 0 ? 0 : Number.isNaN(v) ? NaN : v;
      }
      h = fnvBytes(h, new Uint8Array(scratch.buffer, 0, a.length * 8));
    } else {
      h = fnvBytes(h, new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    }
  }
  return h;
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
