import type Phaser from 'phaser';
import type { SimEvent } from '@core/index';
import type { ArenaAudio } from './arena-audio';
import type { AudioManager } from './audio-manager';
import { CUES, KO, KO_CUT_MS, KO_DUCK_MS, NOISE, Voices, WAVES, pickCues, type CueName, type Layer } from './arcade-cues';

/**
 * Web Audio side of the Arcade audio layers (WP-arcade-audio-layers, FUN-DESIGN section 3): short synthesised cues
 * (oscillators and band-passed noise, no audio files) on top of the sound map's cues, and the KO music cut. Its own lazy
 * chunk `arcade-audio`, loaded by Arcade Versus with the battle (`app/arcade-versus.ts`); Classic never downloads it
 * and its sound map is unchanged. It wraps the battle AudioManager's `consume`, so it hears exactly the events the sound
 * map does (each live tick once; replays play no sound), plays into the same `sfx` bus (bus volume, master and Ctrl-M
 * mute apply), stays silent until the first gesture unlocks audio, while muted and while the tab is hidden, and comes
 * off with the Arena. Imports are type-only except `arcade-cues`, so the chunk needs no preload list.
 */

interface Param {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
interface AudioNodeLike {
  connect(dest: unknown): unknown;
  disconnect(): void;
}
interface Source extends AudioNodeLike {
  start(when?: number): void;
  stop(when?: number): void;
}

/** The slice of `AudioContext` the synth uses (Phaser's context; a battle without Web Audio has no manager), so tests can fake it. */
export interface SynthContext {
  readonly currentTime: number;
  readonly sampleRate: number;
  createGain(): AudioNodeLike & { gain: Param };
  createOscillator(): Source & { type: string; frequency: Param };
  createBufferSource(): Source & { buffer: unknown };
  createBiquadFilter(): AudioNodeLike & { type: string; frequency: Param };
  createBuffer(channels: number, length: number, rate: number): { getChannelData(channel: number): Float32Array };
}

/** Level of the synth layers on the sfx bus (the sampled cues play at 1). */
const LEVEL = 0.5;
const QUIET = 0.0001;

/** Nodes the layers hold connected, over every battle (0 after teardown; test probe). */
let liveNodes = 0;

/** The refusal cue the layers hang on the manager while mounted (the Arena reads it without importing this chunk). */
export type RefusalAudio = AudioManager & { refuse?: () => void };

export interface ArcadeAudioState {
  readonly mounted: boolean;
  readonly played: number;
  readonly voices: number;
  readonly nodes: number;
  readonly musicCut: boolean;
}

/** Test and dev builds only: the state of the layers on each manager. */
const states = new WeakMap<AudioManager, () => ArcadeAudioState>();

/** The layers on `audio` (test probe); `mounted` false without them. */
export function arcadeAudioState(audio: AudioManager | undefined): ArcadeAudioState {
  return (audio && states.get(audio)?.()) ?? { mounted: false, played: 0, voices: 0, nodes: liveNodes, musicCut: false };
}

/** Adds the layers to `audio` and returns their teardown. `hidden` reads whether the tab is hidden. */
export function addArcadeLayer(audio: AudioManager, hidden: () => boolean, sudden: () => boolean = () => false): () => void {
  const synth = audio.ctx as unknown as SynthContext;
  const out = synth.createGain();
  out.gain.value = LEVEL;
  out.connect(audio.buses.sfx);
  liveNodes++;
  const voices = new Voices();
  let noise: unknown;
  let played = 0;
  let cutUntil = 0;
  let now = 0;

  const ramp = (p: Param, from: number, to: number, t: number, end: number): void => {
    p.setValueAtTime(from, t);
    p.exponentialRampToValueAtTime(to, end);
  };

  /**
   * One layer: an oscillator (through a low-pass four times its pitch, which softens the square and saw) or the noise
   * (through a band-pass at the layer's frequency), into a gain decaying from `gain` (above 0), into `out`. The pool
   * disconnects it once it has ended (or at teardown).
   */
  const voice = (wave: number, f0: number, f1: number, ms: number, gain: number, delay: number): void => {
    const t = now + delay / 1000;
    const end = t + ms / 1000;
    const f = synth.createBiquadFilter();
    const env = synth.createGain();
    let src: Source;
    if (wave === NOISE) {
      const b = synth.createBufferSource();
      b.buffer = noise ??= whiteNoise(synth);
      f.type = 'bandpass';
      ramp(f.frequency, f0, f1, t, end);
      src = b;
    } else {
      const o = synth.createOscillator();
      o.type = WAVES[wave] as string;
      ramp(o.frequency, f0, f1, t, end);
      ramp(f.frequency, f0 * 4, f1 * 4, t, end);
      src = o;
    }
    ramp(env.gain, gain, QUIET, t, end);
    src.connect(f);
    f.connect(env);
    env.connect(out);
    src.start(t);
    src.stop(end);
    liveNodes += 3;
    voices.add(() => {
      for (const n of [src, f, env]) n.disconnect();
      liveNodes -= 3;
    }, end * 1000);
  };

  const play = (name: CueName, pitch: number, gain: number): void => {
    const cue: readonly Layer[] = CUES[name];
    if (!voices.admit(name, cue.length, now * 1000)) return;
    played++;
    for (const [w, f0, f1, ms, g, delay = 0] of cue) voice(w, f0 * pitch, f1 * pitch, ms, g * gain, delay);
  };

  /** The Arena calls this for an action the sim will refuse; silent while muted, locked or hidden like the other cues. */
  (audio as RefusalAudio).refuse = (): void => {
    now = synth.currentTime;
    if (!audio.muted && audio.isUnlocked && !hidden()) play('denied', 1, 1);
  };

  const base = audio.consume.bind(audio);
  audio.consume = (events: readonly SimEvent[]): void => {
    base(events);
    now = synth.currentTime;
    const ms = now * 1000;
    const on = !audio.muted && audio.isUnlocked && !hidden();
    for (const e of events) {
      if (e.kind === KO) {
        cutUntil = ms + KO_CUT_MS;
        audio.duckUntil = Math.max(audio.duckUntil, ms + KO_DUCK_MS);
      }
      if (on) pickCues(e, play, sudden);
    }
    // After the manager's own duck update: the music stays cut through the KO window.
    if (ms < cutUntil) audio.buses.music.gain.value = 0;
  };
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    states.set(audio, () => {
      const ms = synth.currentTime * 1000;
      return { mounted: true, played, voices: voices.active(ms), nodes: liveNodes, musicCut: ms < cutUntil };
    });
  }
  return () => {
    // The manager plays the sound map alone again.
    audio.consume = base;
    delete (audio as RefusalAudio).refuse;
    states.delete(audio);
    voices.clear();
    out.disconnect();
    liveNodes--;
    cutUntil = 0;
    audio.updateDuck();
  };
}

/**
 * Half a second of white noise, made once per battle and shared by every noise voice. View-only and never observed by a
 * test or the sim, so `Math.random` is fine here (the hit pitch, which a test pins, uses a fixed cycle).
 */
function whiteNoise(ctx: SynthContext): unknown {
  const buf = ctx.createBuffer(1, ctx.sampleRate >> 1, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Mounts the layers on the Arena's battle audio if `held` (read when the battle mounted its Arcade view) is still the
 * Arena's when the chunk arrives, and takes them off when the Arena shuts down or is destroyed.
 */
export function mountArcadeAudio(arena: Phaser.Scene & { readonly audio?: ArenaAudio }, held: ArenaAudio | undefined, sudden?: () => boolean): void {
  if (!held || arena.audio !== held) return;
  const dispose = addArcadeLayer(held.audio, () => document.hidden, sudden);
  const off = (): void => {
    arena.events.off('shutdown', off).off('destroy', off);
    dispose();
  };
  arena.events.once('shutdown', off).once('destroy', off);
}
