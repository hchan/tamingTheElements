import type { AbilityId, CharacterId } from './ids';
import type { Element } from './elements';

export type Alignment = 'good' | 'neutral' | 'evil';
export type AbilityKind = 'range' | 'omni' | 'melee' | 'buff' | 'debuff' | 'heal' | 'capture';

/** Simulation tick length in milliseconds (50 Hz). */
export const TICK_MS = 20;

/** Convert milliseconds to whole ticks; throws unless ms is a non-negative multiple of TICK_MS. */
export function msToTicks(ms: number): number {
  if (!Number.isInteger(ms) || ms < 0 || ms % TICK_MS !== 0) {
    throw new Error(`msToTicks: ${String(ms)} ms is not a non-negative multiple of ${String(TICK_MS)}`);
  }
  return ms / TICK_MS;
}

export interface CharacterDef {
  readonly id: CharacterId;
  readonly element: Element;
  readonly alignment: Alignment;
  readonly maxHealth: number;
  readonly speed: number;
  readonly abilities: readonly AbilityId[];
  readonly sprite: string;
}

export interface AbilityDef {
  readonly id: AbilityId;
  readonly kind: AbilityKind;
  readonly sprite: string;
  readonly damage?: number;
  readonly heal?: number;
  readonly speed?: number;
  readonly w?: number;
  readonly h?: number;
  readonly maxActive: number;
  /** Legacy millisecond fields, kept verbatim. */
  readonly cooldownMs: number;
  readonly durationMs?: number;
  readonly delayAfterAttackMs?: number;
  /** Derived via msToTicks. */
  readonly cooldownTicks: number;
  readonly durationTicks?: number;
  readonly delayAfterAttackTicks?: number;
}
