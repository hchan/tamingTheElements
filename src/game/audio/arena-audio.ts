import manifest from '../assets/manifest.generated.json';
import { AudioManager, type AudioContextLike } from './audio-manager';

export const MUTE_STORAGE_KEY = 'Taming the Elements.muted';

export interface GestureTarget {
  addEventListener(type: string, listener: () => void, options?: { capture?: boolean }): void;
  removeEventListener(type: string, listener: () => void, options?: { capture?: boolean }): void;
}

interface MiniStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const GESTURES = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * Unlocks audio on the first user gesture (browsers keep a new AudioContext suspended until then), then
 * stops listening. Returns a disposer that removes any listener still registered.
 */
export function unlockOnFirstGesture(audio: Pick<AudioManager, 'unlock'>, target: GestureTarget): () => void {
  const done = (): void => {
    audio.unlock();
    dispose();
  };
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const g of GESTURES) target.removeEventListener(g, done, { capture: true });
  };
  for (const g of GESTURES) target.addEventListener(g, done, { capture: true });
  return dispose;
}

export function readMuted(storage: Pick<MiniStorage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface ArenaAudio {
  readonly audio: AudioManager;
  dispose(): void;
}

export interface ArenaAudioDeps {
  readonly ctx: AudioContextLike | undefined;
  /** Decoded buffer for a manifest sound id, if loaded. */
  readonly buffer: (id: string) => unknown;
  readonly gestures: GestureTarget;
  readonly storage?: MiniStorage;
}

/**
 * Builds the battle's AudioManager from the sounds Phaser already loaded and decoded, restores the saved mute
 * choice and arms the first-gesture unlock. Returns undefined when the browser has no Web Audio.
 */
export function createArenaAudio(deps: ArenaAudioDeps): ArenaAudio | undefined {
  if (!deps.ctx) return undefined;
  const buffers = new Map<string, unknown>();
  for (const s of manifest.sounds) {
    const b = deps.buffer(s.id);
    if (b !== undefined && b !== null) buffers.set(s.id, b);
  }
  const storage = deps.storage;
  const audio = new AudioManager({
    ctx: deps.ctx,
    buffers,
    muted: readMuted(storage),
    onMuteChange: (m) => {
      try {
        storage?.setItem(MUTE_STORAGE_KEY, m ? '1' : '0');
      } catch {
        // mute still applies for this session
      }
    },
  });
  const off = unlockOnFirstGesture(audio, deps.gestures);
  return { audio, dispose: off };
}
