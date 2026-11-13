import type { Element } from '@core/index';
import { readVolumes } from '../platform/volume-setting';
import type { SfxContext, SfxKind, Synth } from './element-sfx';
import type { SampleContext, Sampler } from './sample-sfx';

/**
 * `playSfx(kind, element)`: the one call UI clicks, sim-event views and future abilities (a Cleanse, see
 * ideas/brainstorm/elemental-cleanse.md) use for the elemental sound vocabulary. This file is tiny and eager; the
 * synth is the lazy `element-sfx` chunk, fetched on the first gesture. Nothing is created before a user gesture
 * (autoplay policy): until then `playSfx` is a silent no-op, and the first pointer, key or touch creates and resumes
 * the AudioContext and loads the synth (that gesture's own cue is skipped). Honours the saved mute flag and the
 * Settings sound-effect volume. A cue with a generated sample (`sample-sfx.ts`, a second lazy chunk, tools/audio-gen) plays
 * that; every other cue, and any cue whose sample failed to load, falls back to the synth voice.
 */
export type { SfxKind } from './element-sfx';

/** Same key as `arena-audio.ts` (a test pins it); duplicated so this eager file does not pull the asset manifest. */
export const SFX_MUTE_KEY = 'Taming the Elements.muted';

type Ctx = SfxContext & { resume?(): Promise<void> | void };
type Target = {
  addEventListener(t: string, l: () => void, o?: { capture?: boolean }): void;
  removeEventListener(t: string, l: () => void, o?: { capture?: boolean }): void;
};

export interface SfxDeps {
  /** Creates the AudioContext (undefined where Web Audio is missing). */
  readonly makeContext: () => Ctx | undefined;
  readonly loadSynth: () => Promise<{ createSynth(ctx: SfxContext): Synth }>;
  /** Optional: loads the sampled cues for the context (absent: synth only). */
  readonly loadSamples?: (ctx: Ctx) => Promise<Sampler>;
  readonly storage: Pick<Storage, 'getItem'> | undefined;
  readonly target: Target | undefined;
}

export interface Sfx {
  play(kind: SfxKind, element: Element): void;
  /** Removes the gesture listeners (test teardown). */
  dispose(): void;
  /** True once the synth is loaded. */
  readonly ready: boolean;
}

const GESTURES = ['pointerdown', 'keydown', 'touchstart'];

export function createSfx(deps: SfxDeps): Sfx {
  let synth: Synth | undefined;
  let sampler: Sampler | undefined;
  let loading = false;
  let disposed = false;
  const detach = (): void => { for (const g of GESTURES) deps.target?.removeEventListener(g, unlock, { capture: true }); };
  function unlock(): void {
    if (loading || disposed) return;
    const ctx = deps.makeContext();
    if (!ctx) return;
    loading = true;
    detach();
    void Promise.resolve(ctx.resume?.()).catch(() => undefined);
    deps.loadSynth().then((m) => { if (!disposed) synth = m.createSynth(ctx); }).catch(() => undefined);
    deps.loadSamples?.(ctx).then((s) => { if (!disposed) sampler = s; }).catch(() => undefined);
  }
  for (const g of GESTURES) deps.target?.addEventListener(g, unlock, { capture: true });
  return {
    get ready() { return synth !== undefined; },
    play(kind, element) {
      if (!synth && !sampler) return;
      let muted = false;
      try { muted = deps.storage?.getItem(SFX_MUTE_KEY) === '1'; } catch { /* treat as unmuted */ }
      if (muted) return;
      const volume = readVolumes(deps.storage).sfx;
      if (sampler?.play(kind, element, volume)) return;
      synth?.play(kind, element, volume);
    },
    dispose() { disposed = true; detach(); },
  };
}

let shared: Sfx | undefined;

function sharedSfx(): Sfx {
  shared ??= createSfx({
    makeContext: () => {
      const C = (globalThis as { AudioContext?: new () => Ctx }).AudioContext;
      return C ? new C() : undefined;
    },
    loadSynth: () => import('./element-sfx'),
    loadSamples: (ctx) => import('./sample-sfx').then((m) => m.createSampler(ctx as unknown as SampleContext, m.fetchAsset)),
    storage: typeof localStorage === 'undefined' ? undefined : localStorage,
    target: typeof window === 'undefined' ? undefined : window,
  });
  return shared;
}

/** Arms the first-gesture unlock now, so the very first click of a session already unlocks audio for the next cue. */
export function primeSfx(): void {
  sharedSfx();
}

/** Plays the elemental cue; silent before the first gesture, while muted, or without Web Audio. */
export function playSfx(kind: SfxKind, element: Element): void {
  // Test builds only (statically dead in production): e2e asserts what was asked for, whatever the audio device does.
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    const log = (window as { __TTE__?: { sfxLog?: string[] } }).__TTE__?.sfxLog;
    log?.push(`${kind}:${element}`);
  }
  sharedSfx().play(kind, element);
}
