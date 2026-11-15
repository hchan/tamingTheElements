import { abilityDefB as def, type AbilityDefB } from './abilities-b';

/**
 * Roster-24 batch 1 abilities (Kindrel, Nykra, Quarrak, Hyalia), set C. Appended after set B, so def indices 0-29 never move
 * (the index is hashed: see abilities-order.test.ts). `hurl-rock` (Quarrak) is reused from set A. Melee sizes are pixels (as in set B); range and omni sizes are fractions of the character box (as in set A, px / 80).
 */
export const ABILITIES_C: readonly AbilityDefB[] = [
  def({ id: 'ember-bite', kind: 'melee', sprite: 'emberBite', cooldownMs: 500, maxActive: 2, damage: 12, delayAfterAttackMs: 250, w: 56, h: 36, description: 'A fast jab chain' }),
  def({ id: 'cinder-spray', kind: 'omni', sprite: 'cinderSpray', cooldownMs: 4000, maxActive: 1, damage: 8, speed: 6, w: 20 / 80, h: 20 / 80, description: 'A close ring of embers' }),
  def({ id: 'hoof-crash', kind: 'melee', sprite: 'hoofCrash', cooldownMs: 1000, maxActive: 2, damage: 20, delayAfterAttackMs: 250, w: 70, h: 50 }),
  def({ id: 'kelp-lash', kind: 'melee', sprite: 'kelpLash', cooldownMs: 2500, maxActive: 1, damage: 14, delayAfterAttackMs: 250, w: 130, h: 30, description: 'A long whip' }),
  def({ id: 'boulder-roll', kind: 'range', sprite: 'boulderRoll', cooldownMs: 3500, maxActive: 1, damage: 26, speed: 4, w: 64 / 80, h: 48 / 80, description: 'A slow, large ground roller' }),
  def({ id: 'stinging-filament', kind: 'range', sprite: 'stingingFilament', cooldownMs: 900, maxActive: 2, damage: 10, speed: 12, w: 110 / 80, h: 10 / 80, description: 'A fast filament that stuns' }),
  def({ id: 'bell-pulse', kind: 'omni', sprite: 'bellPulse', cooldownMs: 5000, maxActive: 1, damage: 6, speed: 5, w: 24 / 80, h: 24 / 80, description: 'A push ring that keeps melee foes off' }),
];
