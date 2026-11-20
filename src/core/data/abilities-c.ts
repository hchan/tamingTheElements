import { abilityDefB as def, type AbilityDefB } from './abilities-b';

/**
 * Roster-24 batch 1 abilities (Kindrel, Nykra, Quarrak, Hyalia), set C. Appended after set B, so def indices 0-29 never move
 * (the index is hashed: see abilities-order.test.ts). `hurl-rock` (Quarrak) is reused from set A. Melee sizes are pixels (as in set B); range and omni sizes are fractions of the character box (as in set A, px / 80).
 */
export const ABILITIES_C: readonly AbilityDefB[] = [
  def({ id: 'ember-bite', kind: 'melee', sprite: 'emberBite', cooldownMs: 340, maxActive: 3, damage: 8, delayAfterAttackMs: 160, w: 48, h: 34, description: 'A rapid chain of light bites' }),
  def({ id: 'cinder-spray', kind: 'omni', sprite: 'cinderSpray', cooldownMs: 4000, maxActive: 1, damage: 8, speed: 6, w: 20 / 80, h: 20 / 80, description: 'A close ring of embers' }),
  def({ id: 'hoof-crash', kind: 'melee', sprite: 'hoofCrash', cooldownMs: 1000, maxActive: 2, damage: 20, delayAfterAttackMs: 250, w: 70, h: 50 }),
  def({ id: 'kelp-lash', kind: 'melee', sprite: 'kelpLash', cooldownMs: 2500, maxActive: 1, damage: 14, delayAfterAttackMs: 250, w: 130, h: 30, description: 'A long whip' }),
  def({ id: 'boulder-roll', kind: 'range', sprite: 'boulderRoll', cooldownMs: 3500, maxActive: 1, damage: 26, speed: 4, w: 64 / 80, h: 48 / 80, description: 'A slow, large ground roller' }),
  def({ id: 'stinging-filament', kind: 'range', sprite: 'stingingFilament', cooldownMs: 900, maxActive: 2, damage: 10, speed: 12, w: 110 / 80, h: 10 / 80, description: 'A fast filament that stuns' }),
  def({ id: 'bell-pulse', kind: 'omni', sprite: 'bellPulse', cooldownMs: 5000, maxActive: 1, damage: 6, speed: 5, w: 24 / 80, h: 24 / 80, description: 'A push ring that keeps melee foes off' }),
  // Roster-24 batch 2 (Brazgor, Glimmaw, Durrok, Zephra): def indices 37-44.
  def({ id: 'forge-gore', kind: 'melee', sprite: 'forgeGore', cooldownMs: 2000, maxActive: 1, damage: 30, delayAfterAttackMs: 600, w: 70, h: 80, description: 'A slow overhead anvil blow' }),
  def({ id: 'molten-hide', kind: 'buff', sprite: 'moltenHide', cooldownMs: 12000, maxActive: 100, durationMs: 3000, damageDecreasePercentage: 50, thornsDamage: 4, description: 'Armour that burns melee attackers' }),
  def({ id: 'lure-orb', kind: 'range', sprite: 'lureOrb', cooldownMs: 1200, maxActive: 2, damage: 14, speed: 6, w: 28 / 80, h: 28 / 80, hoverStopPx: 360, hoverLingerTicks: 80, description: 'A glowing orb that hovers as a hazard' }),
  def({ id: 'abyss-flash', kind: 'melee', sprite: 'abyssFlash', cooldownMs: 6000, maxActive: 1, damage: 6, delayAfterAttackMs: 240, w: 100, h: 100, centred: true, description: 'A close burst that stuns' }),
  def({ id: 'tusk-gore', kind: 'melee', sprite: 'tuskGore', cooldownMs: 3000, maxActive: 1, damage: 22, delayAfterAttackMs: 400, w: 80, h: 50, lungePx: 180, description: 'A lunging gore' }),
  def({ id: 'bristle-stomp', kind: 'melee', sprite: 'bristleStomp', cooldownMs: 800, maxActive: 2, damage: 15, delayAfterAttackMs: 250, w: 70, h: 40 }),
  def({ id: 'static-mote', kind: 'range', sprite: 'staticMote', cooldownMs: 400, maxActive: 3, damage: 8, speed: 10, w: 16 / 80, h: 16 / 80, description: 'A fast spark' }),
  def({ id: 'skitter', kind: 'buff', sprite: 'skitter', cooldownMs: 3000, maxActive: 1, lungePx: -140, description: 'A quick hop backward' }),
  // Roster-24 batch 3 (Ouroth, Abyssor, Vortigal, Umbrel): def indices 45-52.
  def({ id: 'wyrm-coil', kind: 'melee', sprite: 'wyrmCoil', cooldownMs: 2500, maxActive: 1, damage: 22, delayAfterAttackMs: 400, w: 80, h: 70, grab: true, grabThrowPx: 160, description: 'A grab that beats Guard' }),
  def({ id: 'scorch-breath', kind: 'melee', sprite: 'scorchBreath', cooldownMs: 1800, maxActive: 1, damage: 14, delayAfterAttackMs: 300, w: 110, h: 70, description: 'A short, tall gout of flame' }),
  def({ id: 'tentacle-lash', kind: 'melee', sprite: 'tentacleLash', cooldownMs: 1200, maxActive: 2, damage: 18, delayAfterAttackMs: 300, w: 160, h: 30, description: 'A long lash' }),
  def({ id: 'abyssal-pull', kind: 'range', sprite: 'abyssalPull', cooldownMs: 6000, maxActive: 1, damage: 8, speed: 14, w: 40 / 80, h: 24 / 80, hoverStopPx: 280, hoverLingerTicks: 1, pullPx: 120, description: 'A tendril that drags the foe in' }),
  def({ id: 'stoop', kind: 'melee', sprite: 'stoop', cooldownMs: 3500, maxActive: 1, damage: 22, delayAfterAttackMs: 400, w: 90, h: 60, lungePx: 200, description: 'A diving strike' }),
  def({ id: 'talon-rake', kind: 'melee', sprite: 'talonRake', cooldownMs: 900, maxActive: 2, damage: 12, delayAfterAttackMs: 250, w: 60, h: 40, woundDamage: 3, woundTicks: 90, description: 'A rake that leaves a wound' }),
  def({ id: 'spore-burst', kind: 'range', sprite: 'sporeBurst', cooldownMs: 1400, maxActive: 2, damage: 6, speed: 5, w: 40 / 80, h: 40 / 80, woundDamage: 4, woundTicks: 90, description: 'A spore cloud that festers' }),
  def({ id: 'mycelium-mend', kind: 'heal', sprite: 'myceliumMend', cooldownMs: 30000, maxActive: 100, heal: 8 }),
];
