/**
 * The Arcade numbers table (FUN-DESIGN 2.13, WP-arcade-numbers): Arcade-only per-race life and damage, and Arcade
 * cooldown overrides. Sim data like src/core/data/arcade.ts (changing a value bumps SIM_VERSION); Classic never reads
 * an Arcade value (`cooldownTicksFor` hands Classic the legacy cooldown).
 */
import type { AbilityDef } from '../data/types';

/**
 * Arcade numbers (FUN-DESIGN 2.13, WP-arcade-numbers): per race `[hpPm, damagePm]`: Arcade max HP in pm of the Classic
 * max health (floored at spawn) and the damage of its ability hits in pm (after the weather and before the combo scale;
 * the shared super is not scaled). Integers only; Classic never reads them. It lives here, under src/core/sim, and
 * not in data/arcade.ts: only the sim reads it, so it ships in the lazily loaded sim chunk, not the menu's core chunk.
 *
 * How they were set: every race starts at 4000 / 1000 (rounds of 40-50 s instead of about 12), then the Arcade round
 * robin (66 pairings x 8 seeds, Normal AI with a personality drawn per match) moved each race's "power" by
 * `(0.5 / winRate) ^ 0.6-0.8` per pass, split evenly between life and damage (sqrt each), so every race keeps the same
 * life-to-damage ratio of about 4 (`hpPm / damagePm`) and round length stays the same for every pairing. Win rates
 * before and after: docs/BALANCE.md "Arcade numbers". The rationale per race is the kit the AI can use, not a design
 * opinion: a high number is a weak kit, a low one a strong kit.
 */
export type ArcadeRaceNumbers = readonly [hpPm: number, damagePm: number];
/** Races outside the table (the dummy, Eternal Void): the plain base life x4 and legacy damage. */
export const ARCADE_RACE_DEFAULT: ArcadeRaceNumbers = [4000, 1000];
export const ARCADE_RACE_NUMBERS: Readonly<Record<string, ArcadeRaceNumbers>> = {
  // Ice Shock melee plus a 10 s fan: has to close in through fire.
  curomo: [6140, 1420],
  // Tornado stun into Wind Cone is the natural combo; near the legacy power.
  cyclonius: [4490, 1010],
  // Hurricane halves each hit and Fade only defends: one of the weakest kits (24% before).
  echo: [6360, 1840],
  // Fireball starts at 0.25x and Fire Heal is a 40 s heal.
  fiara: [5140, 1750],
  // Slime Blast 10 per 1.5 s, the lowest sustained damage in data.json.
  ishimi: [6180, 1550],
  // Crimson Fire is fast and wide: strong.
  lavax: [3320, 870],
  // Icicles every 15 ticks plus the Ice Blast slow: strong.
  morblass: [3370, 930],
  // Ground Shock 25 per 3 s melee; Adrenaline helps it close (9% before, the weakest).
  pax: [5870, 1580],
  // Rock Armour takes 75% off and Rock Pellet fires every 20 ticks: the strongest kit (87% before).
  rokcore: [2470, 690],
  // Fire Blast 40 per 30 ticks (67/s) plus Translucent Flame: strong.
  sindarosa: [2620, 650],
  // Entangling Vines deals nothing and Strangling Branches is melee: weak in the AI's hands.
  treenoc: [8470, 1640],
  // Sonar Blast 67/s plus Steal Health: strong.
  wispera: [3490, 800],
};

/** The Arcade numbers of race `slug`: its ARCADE_RACE_NUMBERS row, else ARCADE_RACE_DEFAULT. */
export function arcadeRaceNumbers(slug: string): ArcadeRaceNumbers {
  return ARCADE_RACE_NUMBERS[slug] ?? ARCADE_RACE_DEFAULT;
}

/**
 * Arcade cooldown overrides in game ticks, by ability slug (FUN-DESIGN 2.13, WP-arcade-numbers); every other ability
 * keeps its legacy cooldown. Two pairs fired at the same cadence along the start row, so every shot met the other's
 * in a clash that destroyed both and the match stood still (every round-robin stalemate was in these pairs): Fireball
 * and Fire Blast (both 30 ticks, fire against fire) and Crimson Fire against Rock Pellet (both 20). A few ticks off
 * the cadence lets one shot in a few through. Projectile slots only.
 */
export const ARCADE_COOLDOWN_TICKS: Readonly<Partial<Record<string, number>>> = {
  fireball: 26, // 30 in Classic: off Fire Blast's 30
  'crimson-fire': 18, // 20 in Classic: off Rock Pellet's 20
};

/** The cooldown `def` books: its Arcade override in Arcade, else (and always in Classic) the legacy `cooldownTicks`. */
export function cooldownTicksFor(def: AbilityDef, arcade: boolean): number {
  return arcade ? (ARCADE_COOLDOWN_TICKS[def.id] ?? def.cooldownTicks) : def.cooldownTicks;
}
