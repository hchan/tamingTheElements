import { Sfc32 } from './sfc32';

const DISCARD = 15;

/** 32-bit FNV-1a over the UTF-16 code units of `s` (callers pass ASCII). */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Returns a splitmix32 generator (uint32 outputs) seeded with `seed`. */
export function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    t ^= t >>> 15;
    return t >>> 0;
  };
}

/** Builds an sfc32 stream: state from splitmix32(fnv1a(`${seed}:${name}`)), first 15 outputs discarded. */
export function seedSfc32(seed: number, streamName: string): Sfc32 {
  const sm = splitmix32(fnv1a(`${String(seed >>> 0)}:${streamName}`));
  const rng = new Sfc32([sm(), sm(), sm(), sm()]);
  for (let i = 0; i < DISCARD; i++) rng.nextU32();
  return rng;
}
