import type { Element } from '@core/index';
import manifest from '../assets/manifest.generated.json';
import type { SfxKind } from './element-sfx';

/**
 * Sampled elemental cues (AI-generated, tools/audio-gen; see tools/audio-gen/LICENSE.txt). A lazy chunk beside
 * `element-sfx`: `sfx.ts` loads it on the first gesture, then it fetches and decodes each `sfxSamples` file once.
 * `play` returns false for a cue with no sample (or one still decoding, or failed), and the caller falls back to the
 * synth voice, so the game is never silent where a sample is missing.
 */
interface BufferLike { readonly duration?: number }
interface GainLike { gain: { value: number }; connect(d: unknown): void; disconnect(): void }
interface SourceLike {
  buffer: unknown;
  onended: (() => void) | null;
  connect(d: unknown): void;
  disconnect(): void;
  start(t?: number): void;
}
export interface SampleContext {
  readonly destination: unknown;
  createGain(): GainLike;
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
}

export interface Sampler {
  /** Plays the cue's sample at `gain` (0..1); false when there is none to play (the caller falls back to the synth). */
  play(kind: SfxKind, element: Element, gain: number): boolean;
  /** Resolves when every sample has been fetched and decoded, or failed (tests, warm-up). */
  readonly settled: Promise<void>;
  /** Number of decoded samples. */
  loaded(): number;
}

/** Samples sounding at once; a further cue is dropped so a mashed button cannot pile up nodes. */
export const MAX_SAMPLE_VOICES = 8;

export const sampleId = (kind: SfxKind, element: Element): string => `sfx_${element}_${kind}`;

export function createSampler(
  ctx: SampleContext,
  fetchBytes: (url: string) => Promise<ArrayBuffer>,
  entries: readonly { id: string; url: string }[] = manifest.sfxSamples,
): Sampler {
  const buffers = new Map<string, BufferLike>();
  let playing = 0;
  const settled = Promise.all(entries.map(async (e) => {
    try { buffers.set(e.id, await ctx.decodeAudioData(await fetchBytes(e.url))); } catch { /* no sample: the synth covers it */ }
  })).then(() => undefined);
  return {
    settled,
    loaded: () => buffers.size,
    play(kind, element, gain) {
      const buf = buffers.get(sampleId(kind, element));
      if (!buf || !(gain > 0) || playing >= MAX_SAMPLE_VOICES) return false;
      const g = ctx.createGain();
      g.gain.value = Math.min(1, gain);
      g.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      playing++;
      src.onended = () => { playing--; src.disconnect(); g.disconnect(); };
      src.start();
      return true;
    },
  };
}

/** Fetches a file under `public/assets/` (Vite base aware). */
export function fetchAsset(url: string): Promise<ArrayBuffer> {
  return fetch(`${import.meta.env.BASE_URL}assets/${url}`).then((r) => {
    if (!r.ok) throw new Error(`${String(r.status)} ${url}`);
    return r.arrayBuffer();
  });
}
