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
  curomo: [5420, 1243],
  // Tornado stun into Wind Cone is the natural combo; near the legacy power. Re-fit in SIM_VERSION 31 (was [4490, 1010]); life 4800 -> 5000 in 37.
  cyclonius: [5600, 1100],
  // Hurricane halves each hit and Fade only defends: one of the weakest kits (24% before). Snag replaced Fade; re-fit in SIM_VERSION 27 (was [6360, 1840]). Re-fit in SIM_VERSION 31 (was [5300, 1530]).
  echo: [6750, 1600],
  // Fireball starts at 0.25x and Fire Heal is a 40 s heal. Damage 1750 -> 1450 in SIM_VERSION 27 (the Snag heroes' lines fed her wins). Re-fit in SIM_VERSION 31 (was [5140, 1450]). Ranged since SIM_VERSION 69 (roster WP 0.4: no Charge, weather charge by casting): 50.0%, numbers kept. Re-fit in SIM_VERSION 99 (was [4210, 1373]; stun-immunity retune after v98).
  fiara: [4508, 1470],
  // Slime Blast 10 per 1.5 s, the lowest sustained damage in data.json. Life 6180 -> 6400 in SIM_VERSION 27. Re-fit in SIM_VERSION 69 (was [5000, 1420]: 38.6% once four heroes changed style in roster WP 0.4).
  ishimi: [5400, 1535], // a 1.5x mid-size (data/size.ts) adds x1.225 life and x1.06 damage on top: 6400 / 1550 before size (5400 / 1480 was 62.5% in the Arcade tournament)
  // Crimson Fire is fast and wide: strong. Life 3320 -> 3500 in SIM_VERSION 27, 3500 -> 3900 in 36, 3900 -> 4000 in 37.
  lavax: [4000, 870],
  // Icicles every 15 ticks plus the Ice Blast slow: strong. Re-fit in SIM_VERSION 31 (was [3370, 930]). Ranged since SIM_VERSION 69 (roster WP 0.4): 50.0%, numbers kept.
  morblass: [4080, 1120],
  // Ground Shock 25 per 3 s melee; Adrenaline helps it close (9% before, the weakest). Life 5870 -> 5300 in SIM_VERSION 27. Re-fit in SIM_VERSION 99 (was [4600, 1442]; stun-immunity retune after v98).
  pax: [4351, 1364],
  // Rock Armour takes 75% off and Rock Pellet fires every 20 ticks: the strongest kit (87% before). Life 2470 -> 2600 in SIM_VERSION 37. Ranged since SIM_VERSION 69 (roster WP 0.4): 51.7%, numbers kept. Re-fit in SIM_VERSION 99 (was [1850, 640]; stun-immunity retune after v98).
  rokcore: [1949, 674], // a 2x giant (data/size.ts) adds x1.45 life and x1.12 damage on top: 2600 / 690 before giants
  // Fire Blast 40 per 30 ticks (67/s) plus Translucent Flame: strong. Arcade falloff since SIM_VERSION 71 (FUN-DESIGN 2.27): full damage to about 257 px, 45% past about 600 px. Re-fit in SIM_VERSION 99 (was [2860, 724]; stun-immunity retune after v98).
  sindarosa: [3001, 760],
  // Snag (30 damage, 20-tick stun) replaced Entangling Vines and Strangling Branches is melee: weak in the AI's hands. Re-fit in SIM_VERSION 27 (was [8470, 1640]). Life 6050 -> 6215 in SIM_VERSION 86 (2v2 factor 714 -> 695 keeps its 2v2 and 3v3 life bit-identical). Re-fit in SIM_VERSION 99 (was [6215, 1180]; stun-immunity retune after v98).
  treenoc: [5998, 1139],
  // Snag replaced Sonar Blast (67/s), leaving Steal Health: life 3490 -> 7900, damage 800 -> 1400 in SIM_VERSION 27. Re-fit in SIM_VERSION 31 (was [7900, 1400]). Melee since SIM_VERSION 69 (roster WP 0.4: Charge, weather charge by walking): re-fit (was [7950, 1355], 57.4%). Life 7575 -> 7365 in SIM_VERSION 86 (2v2 factor 632 -> 650 keeps its 2v2 and 3v3 life bit-identical). Re-fit in SIM_VERSION 99 (was [7365, 1291]; stun-immunity retune after v98).
  wispera: [6833, 1198],
  // Roster-24 batch 1 (SIM_VERSION 72), fitted with tools/sim/low-races/mat.sh.
  kindrel: [6120, 1537],
  nykra: [5435, 1215],
  quarrak: [3365, 760],
  hyalia: [7600, 2108],
  // Roster-24 batch 2 (SIM_VERSION 73), provisional until fitted with tools/sim/low-races/mat.sh.
  brazgor: [4688, 727],
  glimmaw: [7531, 2027],
  durrok: [4689, 1058],
  zephra: [6745, 2423],
  // Roster-24 batch 3 (SIM_VERSION 74), provisional until fitted with tools/sim/low-races/mat.sh.
  ouroth: [6419, 1264],
  abyssor: [5707, 1020],
  vortigal: [6110, 1476],
  umbrel: [8296, 2032],
};

/**
 * Tag team life (FUN-DESIGN 2.13, WP-arcade-2v2-tune): in a 2v2 roster a hero's life is its 1v1 `hpPm` times
 * ARCADE_2V2_LIFE_PM[race] per mille (ARCADE_2V2_LIFE_DEFAULT_PM for a race not in the table), since a team has two life
 * bars and a bench heal to get through. A 1v1 roster is untouched (exact). Team size 2 also multiplies by
 * `ARCADE_2V2_LIFE_SCALE_PM` (SIM_VERSION 78); 3v3 uses the table as is.
 */
export const ARCADE_2V2_LIFE_DEFAULT_PM = 600;
/**
 * 2v2 round-length scale (SIM_VERSION 78), per mille, on top of `ARCADE_2V2_LIFE_PM` for team size 2 only: the nightly
 * fun gate wants a 2v2 round median of 50-85 s; v77 measured 44.3 s, 1300 gives 62.2 s (8 seeds, legacy 12).
 * 3v3 uses the table as is (65 s already; 1300 would give 101 s and 29% time-overs). Life only: supers and guard drain
 * are unchanged.
 */
export const ARCADE_2V2_LIFE_SCALE_PM = 1300;
export const ARCADE_2V2_LIFE_PM: Readonly<Record<string, number>> = {
  curomo: 700, // 740 before SIM_VERSION 101
  cyclonius: 810, // 770 before SIM_VERSION 86
  echo: 710, // 680 before SIM_VERSION 101; 650 before SIM_VERSION 100
  fiara: 730, // 700 before SIM_VERSION 69 (roster WP 0.4: ranged, so a fiara + sindarosa team is all ranged); 760 before SIM_VERSION 86
  ishimi: 630, // 670 before SIM_VERSION 101; 720 before SIM_VERSION 86
  lavax: 804,
  morblass: 865, // 881 before SIM_VERSION 69 (roster WP 0.4); 920 before SIM_VERSION 86
  pax: 675, // 660 before SIM_VERSION 100
  rokcore: 740, // 670 before SIM_VERSION 69 (roster WP 0.4)
  sindarosa: 830, // 800 before SIM_VERSION 101
  treenoc: 785, // 695 before SIM_VERSION 101; 714 before SIM_VERSION 86
  wispera: 710, // 690 before SIM_VERSION 101; 650 before SIM_VERSION 100; 632 before SIM_VERSION 86
  hyalia: 650,
  quarrak: 675, // 725 before SIM_VERSION 102
  kindrel: 710, // 755 before SIM_VERSION 103; 725 before 102; 650 before SIM_VERSION 90 (the lighter Ember Bite chain: 37.1% in 2v2 at 650, 59.7% at 780)
  nykra: 655, // 740 before SIM_VERSION 102
  brazgor: 490, // 460 before SIM_VERSION 102
  glimmaw: 670,
  durrok: 625, // 590 before SIM_VERSION 102
  zephra: 830, // 760 before SIM_VERSION 102
  ouroth: 590,
  abyssor: 550, // 475 before SIM_VERSION 103; 430 before 102
  vortigal: 650, // 740 before SIM_VERSION 102; 665 before SIM_VERSION 94 (41.6% in 2v2)
  umbrel: 660,
};
/**
 * Race life `hpPm` of `slug` for a roster of `size` heroes. A hero below 1x (data/size.ts SIZE_MIN..99) then gets
 * `sizeLifePm(size)` on top of this at spawn: linear below 1000 pm (x0.82 at size 60, x0.775 at SIZE_MIN), so a small
 * hero's `hpPm` must be fitted with that factor in mind.
 */
export function arcadeLifePm(hpPm: number, size: number, slug: string): number {
  if (size < 2) return hpPm;
  const team = Math.floor((hpPm * (ARCADE_2V2_LIFE_PM[slug] ?? ARCADE_2V2_LIFE_DEFAULT_PM)) / 1000);
  return size === 2 ? Math.floor((team * ARCADE_2V2_LIFE_SCALE_PM) / 1000) : team;
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
  'hurl-rock': 90, // 25 in Classic: Quarrak's sustained zoning, 500 ms is a pellet stream (roster-24 B1)
  'crimson-fire': 18, // 20 in Classic: off Rock Pellet's 20
  [SNAG_ABILITY]: SNAG_COOLDOWN_TICKS, // Snag (WP-snag)
};

/** The cooldown `def` books: its Arcade override in Arcade, else (and always in Classic) the legacy `cooldownTicks`. */
export function cooldownTicksFor(def: AbilityDef, arcade: boolean): number {
  return arcade ? (ARCADE_COOLDOWN_TICKS[def.id] ?? def.cooldownTicks) : def.cooldownTicks;
}

/**
 * Fire Blast falloff (FUN-DESIGN 2.27, Arcade only): the blast grows FIRE_BLAST_GROW_PX per axis per tick (centred) for
 * its first FIRE_BLAST_GROW_TICKS steps, keeps full damage for FIRE_BLAST_FULL_TICKS steps, then loses
 * FIRE_BLAST_DECAY_PM per tick down to FIRE_BLAST_FLOOR_PM. Integers only (DETERMINISM.md).
 */
export const FIRE_BLAST_ABILITY = 'fire-blast';
export const FIRE_BLAST_FULL_TICKS = 20;
export const FIRE_BLAST_DECAY_PM = 10;
export const FIRE_BLAST_FLOOR_PM = 450;
export const FIRE_BLAST_GROW_TICKS = 20;
export const FIRE_BLAST_GROW_PX = 2;
/** View only: the sprite alpha at the damage floor (1000 at full damage). */
export const FIRE_BLAST_ALPHA_FLOOR_PM = 350;

/** Fire Blast damage in pm of its spawn damage after `age` projectile steps (1000 up to FIRE_BLAST_FULL_TICKS). */
export function fireBlastFadePm(age: number): number {
  if (age <= FIRE_BLAST_FULL_TICKS) return 1000;
  return Math.max(FIRE_BLAST_FLOOR_PM, 1000 - FIRE_BLAST_DECAY_PM * (age - FIRE_BLAST_FULL_TICKS));
}

/** View only: sprite alpha in pm for a Fire Blast holding `hp` of its `base` damage (clash cuts fade it too). */
export function fireBlastAlphaPm(hp: number, base: number): number {
  const ratio = base > 0 ? Math.min(1000, Math.floor((hp * 1000) / base)) : 1000;
  const t = Math.max(0, ratio - FIRE_BLAST_FLOOR_PM);
  return FIRE_BLAST_ALPHA_FLOOR_PM + Math.floor(((1000 - FIRE_BLAST_ALPHA_FLOOR_PM) * t) / (1000 - FIRE_BLAST_FLOOR_PM));
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
