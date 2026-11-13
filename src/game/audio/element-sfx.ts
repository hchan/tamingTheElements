import type { Element } from '@core/index';

/**
 * The elemental sound vocabulary (ideas/brainstorm/audio-and-music.md): every element has its own short synthesised
 * voice for each `SfxKind`, played by oscillators and band-passed noise (no audio files, zero asset weight). This is the
 * lazy `element-sfx` chunk behind `sfx.ts`; it imports only types, so it needs no preload list. View-only: the sim never
 * reads it, so `Math.random` for the noise buffer is fine.
 */

/** What is being voiced: a UI click or confirm, an ability cast, a hit landing, a cleanse (purge of a status). */
export const SFX_KINDS = ['click', 'confirm', 'cast', 'hit', 'cleanse'] as const;
export type SfxKind = (typeof SFX_KINDS)[number];

/** Oscillator types by layer wave 0..3; wave 4 is band-passed noise. */
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const;
const N = 4;
/** One layer: wave, start and end frequency (Hz, exponential sweep), length (ms), gain (0..1), delay (ms, default 0). */
export type Layer = readonly [wave: number, f0: number, f1: number, ms: number, gain: number, delay?: number];
type Voice = Readonly<Record<SfxKind, readonly Layer[]>>;

/** Water drips and splashes, fire crackles and whooshes, air gusts, earth thuds and cracks; void is a hollow hum. */
export const VOICES: Readonly<Record<Element, Voice>> = {
  water: {
    click: [[0, 1300, 700, 70, 0.3]],
    confirm: [[0, 1100, 520, 120, 0.3], [0, 880, 440, 160, 0.22, 80]],
    cast: [[N, 900, 300, 260, 0.3], [0, 1000, 400, 160, 0.2, 40]],
    hit: [[N, 1600, 500, 140, 0.4], [0, 300, 120, 100, 0.3]],
    cleanse: [[0, 600, 1400, 200, 0.25], [0, 900, 2100, 240, 0.2, 90], [N, 2500, 1200, 220, 0.12, 60]],
  },
  fire: {
    click: [[N, 3000, 1800, 40, 0.35], [N, 2400, 1200, 30, 0.25, 50]],
    confirm: [[N, 600, 2200, 160, 0.3], [3, 220, 440, 140, 0.12, 40]],
    cast: [[N, 400, 2400, 300, 0.35], [3, 160, 380, 240, 0.12]],
    hit: [[N, 2800, 600, 130, 0.45], [2, 120, 50, 110, 0.25]],
    cleanse: [[N, 3200, 900, 260, 0.25], [1, 660, 990, 200, 0.12, 40]],
  },
  air: {
    click: [[N, 2200, 3200, 60, 0.25]],
    confirm: [[N, 1200, 3400, 160, 0.25], [1, 880, 1320, 120, 0.1, 50]],
    cast: [[N, 600, 3000, 340, 0.3], [N, 3000, 800, 260, 0.2, 200]],
    hit: [[N, 3200, 900, 110, 0.4], [1, 400, 200, 80, 0.2]],
    cleanse: [[N, 1000, 4000, 300, 0.25], [1, 1046, 1568, 220, 0.1, 80]],
  },
  earth: {
    click: [[0, 160, 90, 70, 0.5]],
    confirm: [[0, 110, 55, 150, 0.5], [2, 82, 55, 120, 0.12, 30]],
    cast: [[0, 90, 40, 300, 0.55], [N, 400, 120, 240, 0.25, 20]],
    hit: [[N, 1800, 300, 100, 0.4], [0, 80, 35, 150, 0.55]],
    cleanse: [[0, 196, 392, 240, 0.3], [1, 294, 588, 200, 0.12, 70], [N, 700, 300, 120, 0.12]],
  },
  void: {
    click: [[1, 220, 180, 80, 0.25]],
    confirm: [[3, 147, 110, 200, 0.14], [0, 220, 165, 200, 0.2, 60]],
    cast: [[3, 98, 196, 360, 0.15], [N, 300, 900, 300, 0.15]],
    hit: [[3, 130, 60, 160, 0.3], [N, 1000, 200, 100, 0.25]],
    cleanse: [[0, 330, 660, 260, 0.22], [3, 110, 220, 260, 0.1]],
  },
};

interface Param {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
interface NodeLike {
  connect(dest: unknown): unknown;
  disconnect(): void;
}
interface Source extends NodeLike {
  start(when?: number): void;
  stop(when?: number): void;
  onended?: (() => void) | null;
}
/** The slice of `AudioContext` the synth uses, so tests can fake it. */
export interface SfxContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: unknown;
  createGain(): NodeLike & { gain: Param };
  createOscillator(): Source & { type: string; frequency: Param };
  createBufferSource(): Source & { buffer: unknown };
  createBiquadFilter(): NodeLike & { type: string; frequency: Param };
  createBuffer(channels: number, length: number, rate: number): { getChannelData(channel: number): Float32Array };
}

/** Layers sounding at once; a further cue is dropped, so a mashed menu cannot pile up nodes. */
export const MAX_SFX_VOICES = 12;
const QUIET = 0.0001;

export interface Synth {
  /** Plays `kind` in `element`'s voice at `gain` (0..1); false when dropped (voice limit, zero gain or unknown). */
  play(kind: SfxKind, element: Element, gain: number): boolean;
  /** Layers still sounding. */
  active(): number;
}

/** A synth that plays into `ctx.destination`. */
export function createSynth(ctx: SfxContext): Synth {
  const out = ctx.createGain();
  out.gain.value = 0.5;
  out.connect(ctx.destination);
  let ends: number[] = [];
  let noise: unknown;
  const ramp = (p: Param, from: number, to: number, t: number, end: number): void => {
    p.setValueAtTime(from, t);
    p.exponentialRampToValueAtTime(to, end);
  };
  const active = (): number => {
    const now = ctx.currentTime;
    ends = ends.filter((e) => e > now);
    return ends.length;
  };
  return {
    active,
    play(kind, element, gain) {
      const cue = (VOICES as Partial<Record<string, Voice>>)[element]?.[kind];
      if (!cue || !(gain > 0) || active() + cue.length > MAX_SFX_VOICES) return false;
      for (const [wave, f0, f1, ms, g, delay = 0] of cue) {
        const t = ctx.currentTime + delay / 1000;
        const end = t + ms / 1000;
        const f = ctx.createBiquadFilter();
        const env = ctx.createGain();
        let src: Source;
        if (wave === N) {
          const b = ctx.createBufferSource();
          noise ??= whiteNoise(ctx);
          b.buffer = noise;
          f.type = 'bandpass';
          ramp(f.frequency, f0, f1, t, end);
          src = b;
        } else {
          const o = ctx.createOscillator();
          o.type = WAVES[wave] as string;
          ramp(o.frequency, f0, f1, t, end);
          ramp(f.frequency, f0 * 4, f1 * 4, t, end);
          src = o;
        }
        ramp(env.gain, g * Math.min(1, gain), QUIET, t, end);
        src.connect(f);
        f.connect(env);
        env.connect(out);
        src.start(t);
        src.stop(end);
        ends.push(end);
        // Free the nodes once the voice has ended.
        src.onended = () => { for (const n of [src, f, env]) n.disconnect(); };
      }
      return true;
    },
  };
}

function whiteNoise(ctx: SfxContext): unknown {
  const buf = ctx.createBuffer(1, ctx.sampleRate >> 1, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}
