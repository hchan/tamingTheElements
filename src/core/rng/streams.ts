import { seedSfc32 } from './seed';
import type { Sfc32 } from './sfc32';

export const STREAM_NAMES = ['combat', 'capture', 'spawn', 'ai.p1', 'ai.p2', 'meta', 'cosmetic'] as const;
export type StreamName = (typeof STREAM_NAMES)[number];
export type Streams = Readonly<Record<StreamName, Sfc32>>;

/** Creates every named stream from one match seed. Cosmetic code must only touch `cosmetic`. */
export function createStreams(seed: number): Streams {
  const out = {} as Record<StreamName, Sfc32>;
  for (const name of STREAM_NAMES) out[name] = seedSfc32(seed, name);
  return out;
}

/** All stream states concatenated in STREAM_NAMES order (4 words each), for snapshots. */
export function saveStreams(streams: Streams): Uint32Array {
  const out = new Uint32Array(STREAM_NAMES.length * 4);
  STREAM_NAMES.forEach((name, i) => {
    out.set(streams[name].saveState(), i * 4);
  });
  return out;
}

export function loadStreams(streams: Streams, state: Uint32Array): void {
  if (state.length !== STREAM_NAMES.length * 4) throw new RangeError('bad streams state length');
  STREAM_NAMES.forEach((name, i) => {
    streams[name].loadState(state.subarray(i * 4, i * 4 + 4));
  });
}
