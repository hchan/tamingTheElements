/**
 * The Arcade numbers table (FUN-DESIGN 2.13, WP-arcade-numbers): Arcade-only per-race life and damage, and Arcade
 * cooldown overrides. Sim data like src/core/data/arcade.ts (changing a value bumps SIM_VERSION); Classic never reads
 * an Arcade value (`cooldownTicksFor` hands Classic the legacy cooldown).
 */
import { SNAG_ABILITY, SNAG_COOLDOWN_TICKS } from '../data/arcade';
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
/** Races outside the table (the dummy): the plain base life x4 and legacy damage. */
export const ARCADE_RACE_DEFAULT: ArcadeRaceNumbers = [4000, 1000];
export const ARCADE_RACE_NUMBERS: Readonly<Record<string, ArcadeRaceNumbers>> = {
  // Not a pick: the World Tour's final boss, alone against three heroes (FUN-DESIGN 2.18). 580 pm of its Classic 1000
  // life (580 HP at the Tour's 0 XP; 4000 before SIM_VERSION 25, which no AI team ever beat), legacy damage. Set with
  // tools/sim/boss-probe.ts so Normal AI heroes win about 38% (Easy 48%, Hard 39%; 96 matches each) and no round times out.
  'eternal-void': [580, 1000],
  // Ice Shock melee plus a 10 s fan: has to close in through fire. Re-fit in SIM_VERSION 27 (Snag replaced Shards of Ice; was [6140, 1420]) and in 30 (was [6300, 1560]: 86-88% Arcade win rate, now 60%; 6000/1250 -> 5800/1200 in 31).
  curomo: [5800, 1200],
  // Tornado stun into Wind Cone is the natural combo; near the legacy power. Re-fit in SIM_VERSION 31 (was [4490, 1010]); life 4800 -> 5000 in 37.
  cyclonius: [5000, 1080],
  // Hurricane halves each hit and Fade only defends: one of the weakest kits (24% before). Snag replaced Fade; re-fit in SIM_VERSION 27 (was [6360, 1840]). Re-fit in SIM_VERSION 31 (was [5300, 1530]).
  echo: [6200, 1600],
  // Fireball starts at 0.25x and Fire Heal is a 40 s heal. Damage 1750 -> 1450 in SIM_VERSION 27 (the Snag heroes' lines fed her wins). Re-fit in SIM_VERSION 31 (was [5140, 1450]).
  fiara: [5400, 1520],
  // Slime Blast 10 per 1.5 s, the lowest sustained damage in data.json. Life 6180 -> 6400 in SIM_VERSION 27.
  ishimi: [6400, 1550],
  // Crimson Fire is fast and wide: strong. Life 3320 -> 3500 in SIM_VERSION 27, 3500 -> 3900 in 36, 3900 -> 4000 in 37.
  lavax: [4000, 870],
  // Icicles every 15 ticks plus the Ice Blast slow: strong. Re-fit in SIM_VERSION 31 (was [3370, 930]).
  morblass: [3950, 1070],
  // Ground Shock 25 per 3 s melee; Adrenaline helps it close (9% before, the weakest). Life 5870 -> 5300 in SIM_VERSION 27.
  pax: [5300, 1580],
  // Rock Armour takes 75% off and Rock Pellet fires every 20 ticks: the strongest kit (87% before). Life 2470 -> 2600 in SIM_VERSION 37.
  rokcore: [2600, 690],
  // Fire Blast 40 per 30 ticks (67/s) plus Translucent Flame: strong.
  sindarosa: [2620, 650],
  // Snag (30 damage, 20-tick stun) replaced Entangling Vines and Strangling Branches is melee: weak in the AI's hands. Re-fit in SIM_VERSION 27 (was [8470, 1640]).
  treenoc: [6500, 1270],
  // Snag replaced Sonar Blast (67/s), leaving Steal Health: life 3490 -> 7900, damage 800 -> 1400 in SIM_VERSION 27. Re-fit in SIM_VERSION 31 (was [7900, 1400]).
  wispera: [7300, 1280],
};

/**
 * Tag team life (FUN-DESIGN 2.13, WP-arcade-2v2-tune): in a 2v2 roster a hero's life is its 1v1 `hpPm` times
 * ARCADE_2V2_LIFE_PM[race] per mille (ARCADE_2V2_LIFE_DEFAULT_PM for a race not in the table), since a team has two life
 * bars and a bench heal to get through. A 1v1 roster is untouched (exact).
 */
export const ARCADE_2V2_LIFE_DEFAULT_PM = 600;
export const ARCADE_2V2_LIFE_PM: Readonly<Record<string, number>> = {
  curomo: 760,
  cyclonius: 740,
  echo: 560,
  fiara: 613,
  ishimi: 600,
  lavax: 537,
  morblass: 960,
  pax: 500,
  rokcore: 670,
  sindarosa: 840,
  treenoc: 690,
  wispera: 1050,
};
/** Race life `hpPm` of `slug` for a roster of `size` heroes. */
export function arcadeLifePm(hpPm: number, size: number, slug: string): number {
  return size < 2 ? hpPm : Math.floor((hpPm * (ARCADE_2V2_LIFE_PM[slug] ?? ARCADE_2V2_LIFE_DEFAULT_PM)) / 1000);
}

/** The Arcade numbers of race `slug`: its ARCADE_RACE_NUMBERS row, else ARCADE_RACE_DEFAULT. */
export function arcadeRaceNumbers(slug: string): ArcadeRaceNumbers {
  return ARCADE_RACE_NUMBERS[slug] ?? ARCADE_RACE_DEFAULT;
}

/**
 * Arcade cooldown overrides in game ticks, by ability slug (FUN-DESIGN 2.13, WP-arcade-numbers); every other ability
 * keeps its legacy cooldown. Two pairs fired at the same cadence along the start row, so every shot met the other's
 * in a clash that destroyed both and the match stood still (every round-robin stalemate was in these pairs): Fireball
 * and Fire Blast (both 30 ticks, fire against fire) and Crimson Fire against Rock Pellet (both 20). A few ticks off
 * the cadence lets one shot in a few through. Entangling Vines is the Snag throw in Arcade (FUN-DESIGN 2.20).
 */
export const ARCADE_COOLDOWN_TICKS: Readonly<Partial<Record<string, number>>> = {
  fireball: 26, // 30 in Classic: off Fire Blast's 30
  'crimson-fire': 18, // 20 in Classic: off Rock Pellet's 20
  [SNAG_ABILITY]: SNAG_COOLDOWN_TICKS, // Snag (WP-snag)
};

/** The cooldown `def` books: its Arcade override in Arcade, else (and always in Classic) the legacy `cooldownTicks`. */
export function cooldownTicksFor(def: AbilityDef, arcade: boolean): number {
  return arcade ? (ARCADE_COOLDOWN_TICKS[def.id] ?? def.cooldownTicks) : def.cooldownTicks;
}

/**
 * Stage terrain rows (FUN-DESIGN 2.15, WP-arcade-terrain), all integers in per mille unless named. A hero of the stage's
 * own element standing on a patch (its centre inside): fire deals TERRAIN_FIRE_PM damage, water heals
 * TERRAIN_WATER_HEAL_PM of max HP every TERRAIN_WATER_EVERY game ticks (10 pm is 1 HP at the 100 HP reference), air moves
 * at TERRAIN_AIR_PM speed (not stacked with a dash: the dash sets its own, larger speed). Earth patches are rocks for the
 * other elements. TERRAIN_CAP_PM caps the total damage modifier of the element chart, weather and terrain together
 * (against the plain hit) and the speed modifier. A swap lands TERRAIN_TELEGRAPH_TICKS after the cast.
 */
export const TERRAIN_FIRE_PM = 2000;
export const TERRAIN_WATER_HEAL_PM = 10;
export const TERRAIN_WATER_EVERY = 50;
export const TERRAIN_AIR_PM = 2000;
export const TERRAIN_CAP_PM = 2500;
export const TERRAIN_TELEGRAPH_TICKS = 30;
/**
 * Patch layout: 3 to 5 patches (TERRAIN_COUNT_MIN + int(TERRAIN_COUNT_SPAN)), sides TERRAIN_SIDE_MIN + k * TERRAIN_SIDE_STEP
 * for k below TERRAIN_SIDE_STEPS, every patch at least one hero (TERRAIN_GAP) from the walls, from each other and from
 * every hero, spawn and projectile; TERRAIN_TRIES draws per patch (pair). The centre patch goes first, and a layout
 * below the minimum count is drawn again (TERRAIN_DRAWS times).
 */
export const TERRAIN_COUNT_MIN = 3;
export const TERRAIN_COUNT_SPAN = 3;
export const TERRAIN_SIDE_MIN = 80;
export const TERRAIN_SIDE_STEP = 20;
export const TERRAIN_SIDE_STEPS = 5;
export const TERRAIN_GAP = 80;
export const TERRAIN_TRIES = 64;
export const TERRAIN_DRAWS = 8;
