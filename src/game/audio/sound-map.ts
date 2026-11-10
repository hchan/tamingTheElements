import { SimEventKind, type SimEvent } from '@core/index';
import type { SoundId } from '../assets/keys';

export type Bus = 'music' | 'sfx' | 'ui';

export interface SoundCue {
  readonly id: SoundId;
  readonly bus: Bus;
  /** Duck the music bus while this cue plays. */
  readonly duck: boolean;
}

/**
 * Sim event kind to cue. Sound ids come from the legacy asset manifest; unmapped kinds are silent. Legacy plays no sound
 * for a death that swaps in a teammate (the swap plays 'swap') and none for an enemy death: 'death' only when the
 * player's team is wiped and 'victory' only on the Victory scene, so both hang off `matchEnded`. The boss's
 * `captureFailed` is the evil laugh. Legacy also plays a sound when each ability is cast; the sim emits no cast events
 * yet (docs/PARITY.md U12).
 */
const CUES: Readonly<Record<number, SoundCue>> = {
  [SimEventKind.damage]: { id: 'damage', bus: 'sfx', duck: false },
  [SimEventKind.swapped]: { id: 'swap', bus: 'sfx', duck: false },
  [SimEventKind.captured]: { id: 'capture', bus: 'sfx', duck: true },
  [SimEventKind.captureFailed]: { id: 'evilLaugh', bus: 'sfx', duck: true },
  // Arcade only: the super cinematic's sound, with the music duck (FUN-DESIGN section 3).
  [SimEventKind.superStarted]: { id: 'whoosh', bus: 'sfx', duck: true },
};
const VICTORY: SoundCue = { id: 'victory', bus: 'sfx', duck: true };
const DEFEAT: SoundCue = { id: 'death', bus: 'sfx', duck: true };

export function cueFor(e: SimEvent): SoundCue | undefined {
  if (e.kind === SimEventKind.matchEnded) return e['winner'] === 0 ? VICTORY : DEFEAT;
  return CUES[e.kind];
}
