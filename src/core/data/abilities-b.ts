import { abilityId } from './ids';
import { msToTicks, TICK_MS } from './types';
import type { AbilityDef } from './types';

/** Legacy effect parameters not covered by the shared AbilityDef. */
export interface AbilityEffectParams {
  /** Buff/debuff speed delta (legacy `speedIncrease`, negative for debuffs). */
  readonly speedDelta?: number;
  /** Incoming damage reduction percentage while active. */
  readonly damageDecreasePercentage?: number;
  readonly effectSprite?: string;
  readonly longSprite?: string;
  /** Legacy `nextDamgeInterval` (typo in legacy), kept verbatim in ms. */
  readonly damageIntervalMs?: number;
  readonly damageIntervalTicks?: number;
  readonly description?: string;
}

export type AbilityDefB = AbilityDef & AbilityEffectParams;

/**
 * Legacy delays of 250 ms are not multiples of the 20 ms tick; they round UP to whole ticks
 * (250 ms -> 13 ticks) so msToTicks stays strict for everything else.
 */
function ceilTicks(ms: number): number {
  return Math.ceil(ms / TICK_MS);
}

interface Src {
  readonly id: string;
  readonly kind: AbilityDef['kind'];
  readonly sprite: string;
  readonly cooldownMs: number;
  readonly maxActive: number;
  readonly damage?: number;
  readonly heal?: number;
  readonly speed?: number;
  readonly w?: number;
  readonly h?: number;
  readonly durationMs?: number;
  readonly delayAfterAttackMs?: number;
  readonly speedDelta?: number;
  readonly damageDecreasePercentage?: number;
  readonly effectSprite?: string;
  readonly longSprite?: string;
  readonly damageIntervalMs?: number;
  readonly description?: string;
}

function def(s: Src): AbilityDefB {
  const { id, durationMs, delayAfterAttackMs, damageIntervalMs, ...rest } = s;
  return {
    ...rest,
    id: abilityId(id),
    cooldownTicks: msToTicks(s.cooldownMs),
    ...(durationMs !== undefined && { durationMs, durationTicks: msToTicks(durationMs) }),
    ...(delayAfterAttackMs !== undefined && {
      delayAfterAttackMs,
      delayAfterAttackTicks: ceilTicks(delayAfterAttackMs),
    }),
    ...(damageIntervalMs !== undefined && { damageIntervalMs, damageIntervalTicks: ceilTicks(damageIntervalMs) }),
  };
}

export const ABILITIES_B: readonly AbilityDefB[] = [
  def({
    id: 'ground-shock', kind: 'melee', sprite: 'groundShock', cooldownMs: 3000, maxActive: 1, damage: 25,
    delayAfterAttackMs: 250, w: 240, h: 240, description: 'Omni-directional melee attack',
  }),
  def({
    id: 'adrenaline', kind: 'buff', sprite: 'adrenaline', cooldownMs: 15000, maxActive: 100, durationMs: 3000,
    speedDelta: 5, damageDecreasePercentage: 25,
  }),
  def({
    id: 'translucent-flame', kind: 'buff', sprite: 'translucentFlame', cooldownMs: 6000, maxActive: 100,
    durationMs: 1500, description: "Become translucent (opponent's attacks will go through you)",
  }),
  def({
    id: 'ice-blast', kind: 'debuff', sprite: 'iceBlast', cooldownMs: 6000, maxActive: 100, damage: 15, speed: 8,
    w: 60, h: 60, durationMs: 3000, speedDelta: -2, effectSprite: 'iceSheet',
    description: "Inflicts damage and reduces opponent's speed",
  }),
  def({
    id: 'steal-health', kind: 'melee', sprite: 'stealHealth', cooldownMs: 1000, maxActive: 2, damage: 10,
    delayAfterAttackMs: 250, w: 240, h: 40, description: 'Will heal you for the amount of damage done',
  }),
  def({ id: 'fire-heal', kind: 'heal', sprite: 'fireHeal', cooldownMs: 40000, maxActive: 100, heal: 10 }),
  def({
    id: 'ice-shock', kind: 'melee', sprite: 'iceShock', cooldownMs: 1000, maxActive: 2, damage: 20,
    delayAfterAttackMs: 250, w: 240, h: 40,
  }),
  def({
    id: 'rock-armour', kind: 'buff', sprite: 'rockArmour', cooldownMs: 15000, maxActive: 100, durationMs: 3000,
    damageDecreasePercentage: 75,
  }),
  def({
    id: 'hurricane', kind: 'melee', sprite: 'hurricane', cooldownMs: 6000, maxActive: 100, damage: 13,
    delayAfterAttackMs: 0, durationMs: 3000, w: 240, h: 240, damageIntervalMs: 500,
    description: 'Melee attack that moves with the player and inflicts damage when opponent is inside the hurricane',
  }),
  def({
    id: 'fade', kind: 'buff', sprite: 'fade', cooldownMs: 10000, maxActive: 100, durationMs: 3000,
    description: "Become translucent (opponent's attacks will go through you)",
  }),
  def({
    id: 'fire-dance', kind: 'buff', sprite: 'fireDance', cooldownMs: 16000, maxActive: 100, durationMs: 5000,
    speedDelta: 2,
  }),
  def({
    id: 'strangling-branches', kind: 'melee', sprite: 'stranglingBranches', cooldownMs: 1000, maxActive: 2,
    damage: 20, delayAfterAttackMs: 250, w: 120, h: 40,
  }),
  def({
    id: 'entangling-vines', kind: 'melee', sprite: 'entanglingVines', cooldownMs: 5000, maxActive: 2, damage: 0,
    delayAfterAttackMs: 250, durationMs: 3000, w: 360, h: 40, effectSprite: 'vineTrap',
    longSprite: 'entanglingVinesLong', description: 'Entangles the opponent so it cannot move or cast any abilities',
  }),
];
