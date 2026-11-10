import { SimEventKind, type SimEvent } from '@core/index';
import type { SoundId } from '../assets/keys';

export type Bus = 'music' | 'sfx' | 'ui';

export interface SoundCue {
  readonly id: SoundId;
  readonly bus: Bus;
  /** Duck the music bus while this cue plays. */
  readonly duck: boolean;
}

/** Sim event kind to cue. Sound ids come from the legacy asset manifest; unmapped kinds are silent. */
const CUES: Readonly<Record<number, SoundCue>> = {
  [SimEventKind.damage]: { id: 'damage', bus: 'sfx', duck: false },
  [SimEventKind.died]: { id: 'death', bus: 'sfx', duck: true },
  [SimEventKind.swapped]: { id: 'swap', bus: 'sfx', duck: false },
  [SimEventKind.captured]: { id: 'capture', bus: 'sfx', duck: true },
  [SimEventKind.matchEnded]: { id: 'victory', bus: 'sfx', duck: true },
  // Arcade only: the super cinematic's sound, with the music duck (FUN-DESIGN section 3).
  [SimEventKind.superStarted]: { id: 'whoosh', bus: 'sfx', duck: true },
};

export function cueFor(e: SimEvent): SoundCue | undefined {
  return CUES[e.kind];
}
