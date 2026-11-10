export interface CinematicKey {
  readonly code: string;
  readonly repeat: boolean;
}

export type CinematicKeyAction = 'skip' | 'advance' | 'none';

/**
 * What a key press does in a cinematic: Escape or Enter skips the whole chain (keyboard equivalent of the Skip
 * button); any other key advances a "press a key" step. Auto-repeat does nothing, so a key still held from the
 * menu that started the cinematic cannot skip or advance it.
 */
export function cinematicKeyAction(k: CinematicKey): CinematicKeyAction {
  if (k.repeat) return 'none';
  if (k.code === 'Escape' || k.code === 'Enter' || k.code === 'NumpadEnter') return 'skip';
  return 'advance';
}
