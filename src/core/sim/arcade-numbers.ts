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
  curomo: [5880, 1243], // Re-fit in SIM_VERSION 114 (was [5420, 1243]; 35.9% 1v1, 33.2% 2v2: +8.5% life at every size)
  // Tornado stun into Wind Cone is the natural combo; near the legacy power. Re-fit in SIM_VERSION 31 (was [4490, 1010]); life 4800 -> 5000 in 37.
  cyclonius: [5264, 1072], // SIM_VERSION 118 (was [5600, 1072]; 66.6% 1v1 after v117: -6% life, 2v2 810 -> 905 keeps team life); Re-fit in SIM_VERSION 111 (was [5600, 1100]; damage -2.5%)
  // Hurricane halves each hit and Fade only defends: one of the weakest kits (24% before). Snag replaced Fade; re-fit in SIM_VERSION 27 (was [6360, 1840]). Re-fit in SIM_VERSION 31 (was [5300, 1530]).
  echo: [7800, 1600], // SIM_VERSION 118 (was [7464, 1600]; 38.6% 1v1 after v117, +4.5% life, 2v2 680 -> 651 keeps team life); Re-fit in SIM_VERSION 112 (was [7250, 1600]; life +3%, 2v2 700 -> 680 keeps team life); 108 (was [6750, 1600]; v104 stun shift)
  // Fireball starts at 0.25x and Fire Heal is a 40 s heal. Damage 1750 -> 1450 in SIM_VERSION 27 (the Snag heroes' lines fed her wins). Re-fit in SIM_VERSION 31 (was [5140, 1450]). Ranged since SIM_VERSION 69 (roster WP 0.4: no Charge, weather charge by casting): 50.0%, numbers kept. Re-fit in SIM_VERSION 99 (was [4210, 1373]; stun-immunity retune after v98).
  fiara: [4235, 1470], // Re-fit in SIM_VERSION 114 (was [4508, 1470]; 61.1% 1v1, -6.1% life, 2v2 682 -> 726 keeps team life)
  // Slime Blast 10 per 1.5 s, the lowest sustained damage in data.json. Life 6180 -> 6400 in SIM_VERSION 27. Re-fit in SIM_VERSION 69 (was [5000, 1420]: 38.6% once four heroes changed style in roster WP 0.4).
  ishimi: [5400, 1535], // a 1.5x mid-size (data/size.ts) adds x1.225 life and x1.06 damage on top: 6400 / 1550 before size (5400 / 1480 was 62.5% in the Arcade tournament)
  // Crimson Fire is fast and wide: strong. Life 3320 -> 3500 in SIM_VERSION 27, 3500 -> 3900 in 36, 3900 -> 4000 in 37.
  lavax: [3680, 848], // Re-fit in SIM_VERSION 108 (was [4000, 870]; v104 stun shift); damage 870 -> 848 in SIM_VERSION 111
  // Icicles every 15 ticks plus the Ice Blast slow: strong. Re-fit in SIM_VERSION 31 (was [3370, 930]). Ranged since SIM_VERSION 69 (roster WP 0.4): 50.0%, numbers kept.
  morblass: [3600, 1092], // SIM_VERSION 118 (was [4080, 1092]; 67.9% 1v1 after v117: -11.8% life, 2v2 810 -> 842 keeps team life); Re-fit in SIM_VERSION 111 (was [4080, 1120]; damage -2.5%)
  // Ground Shock 25 per 3 s melee; Adrenaline helps it close (9% before, the weakest). Life 5870 -> 5300 in SIM_VERSION 27. Re-fit in SIM_VERSION 99 (was [4600, 1442]; stun-immunity retune after v98).
  pax: [4677, 1364], // Re-fit in SIM_VERSION 112 (was [4540, 1364]; life +3%, 2v2 647 -> 628 keeps team life); 108 (was [4351, 1364]; v104 stun shift)
  // Rock Armour takes 75% off and Rock Pellet fires every 20 ticks: the strongest kit (87% before). Life 2470 -> 2600 in SIM_VERSION 37. Ranged since SIM_VERSION 69 (roster WP 0.4): 51.7%, numbers kept. Re-fit in SIM_VERSION 99 (was [1850, 640]; stun-immunity retune after v98).
  rokcore: [1881, 674], // SIM_VERSION 118 (was [1949, 674]; 62.0% 1v1 after v117, -3.5% life, 2v2 740 -> 767 keeps team life); a 2x giant (data/size.ts) adds x1.45 life and x1.12 damage on top: 2600 / 690 before giants
  // Fire Blast 40 per 30 ticks (67/s) plus Translucent Flame: strong. Arcade falloff since SIM_VERSION 71 (FUN-DESIGN 2.27): full damage to about 257 px, 45% past about 600 px. Re-fit in SIM_VERSION 99 (was [2860, 724]; stun-immunity retune after v98).
  sindarosa: [2708, 760], // SIM_VERSION 118 (was [2806, 760]; 62.0% 1v1 after v117, -3.5% life, 2v2 785 -> 813 keeps team life); Re-fit in SIM_VERSION 114 (was [3001, 760]; 63.0% 1v1, abyssor-led 2v2 66.8%: -6.5% life at every size)
  // Snag (30 damage, 20-tick stun) replaced Entangling Vines and Strangling Branches is melee: weak in the AI's hands. Re-fit in SIM_VERSION 27 (was [8470, 1640]). Life 6050 -> 6215 in SIM_VERSION 86 (2v2 factor 714 -> 695 keeps its 2v2 and 3v3 life bit-identical). Re-fit in SIM_VERSION 99 (was [6215, 1180]; stun-immunity retune after v98).
  treenoc: [6540, 1253], // Re-fit in SIM_VERSION 114 (was [6540, 1139]; 38.3% 1v1, +10% damage, not supers); SIM_VERSION 108 (was [5998, 1139]; v104 stun shift)
  // Snag replaced Sonar Blast (67/s), leaving Steal Health: life 3490 -> 7900, damage 800 -> 1400 in SIM_VERSION 27. Re-fit in SIM_VERSION 31 (was [7900, 1400]). Melee since SIM_VERSION 69 (roster WP 0.4: Charge, weather charge by walking): re-fit (was [7950, 1355], 57.4%). Life 7575 -> 7365 in SIM_VERSION 86 (2v2 factor 632 -> 650 keeps its 2v2 and 3v3 life bit-identical). Re-fit in SIM_VERSION 99 (was [7365, 1291]; stun-immunity retune after v98).
  wispera: [7041, 1198], // Re-fit in SIM_VERSION 112 (was [6833, 1198]; life +3.04%, 2v2 710 -> 689 keeps team life 4851)
  // Roster-24 batch 1 (SIM_VERSION 72), fitted with tools/sim/low-races/mat.sh.
  kindrel: [6680, 1537], // R2 round 3: 39% 1v1 at 6426 (life +4%, 2v2 800 -> 770); // SIM_VERSION 118 (was [6120, 1537]; 37.5% 1v1, 28.3% 2v2 after v117, +5% life, 2v2 730 -> 800)
  nykra: [5788, 1215], // SIM_VERSION 118 (was [5435, 1215]; 35.1% 1v1 after v117, +6.5% life, 2v2 692 -> 595)
  quarrak: [3515, 760], // Re-fit in SIM_VERSION 110 (was [3365, 760]; team life 2271 -> 2372 with 2v2 675 kept)
  hyalia: [7334, 2108], // SIM_VERSION 118 (was [7600, 2108]; 62.4% 1v1, 64.4% 2v2 after v117, -3.5% life, 2v2 650 -> 613)
  // Roster-24 batch 2 (SIM_VERSION 73), provisional until fitted with tools/sim/low-races/mat.sh.
  brazgor: [5600, 850], // SIM_VERSION 118 (was [4151, 727]; 16.8% 1v1 after v117: +35% life, +17% damage, 2v2 570 -> 400); SIM_VERSION 115 (was [4030, 727]; +3.0% life at every size); re-fit in SIM_VERSION 113 (was [4478, 727]; -10% life); SIM_VERSION 110 (was [4688, 727])
  glimmaw: [7200, 2027], // SIM_VERSION 118 (was [7531, 2027]; 65.8% 1v1 and 2v2 after v117, -4.4% life, 2v2 670 -> 617)
  durrok: [4892, 1058], // Re-fit in SIM_VERSION 110 (was [4689, 1058]; 2v2 675 -> 647 keeps team life)
  zephra: [6100, 2423], // R2 round 3: 63% 1v1 at 6300 (life -3.2%, 2v2 889 -> 918); // R2 round 2: 65% at 6509, life -3.2% (2v2 860 -> 889 keeps team life); SIM_VERSION 118 (was [6745, 2423]; 62.4% 1v1 after v117, -3.5% life, 2v2 830 -> 860 keeps team life)
  // Roster-24 batch 3 (SIM_VERSION 74), provisional until fitted with tools/sim/low-races/mat.sh.
  ouroth: [6650, 1264], // R2 round 3: 40% 1v1 at 6423 (life +3.5%, 2v2 572 -> 552); // SIM_VERSION 118 (was [6031, 1264]; 35.3% 1v1 after v117, +6.5% life, 2v2 628 -> 572); Re-fit in SIM_VERSION 113 (was [6419, 1264]; 64.0% 1v1, -6% life, 2v2 590 -> 628 keeps team life)
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
  curomo: 777, // 700 before SIM_VERSION 118 (2v2 32.6%); 740 before SIM_VERSION 101
  cyclonius: 905, // SIM_VERSION 118 (was 810; 1v1 life cut, 2v2 33.7% at 862); 770 before SIM_VERSION 86
  echo: 651, // 680 before SIM_VERSION 118 (1v1 life +4.5%, team life kept); 700 before SIM_VERSION 112 (1v1 life +3%, team life unchanged); 661 before SIM_VERSION 109; 710 before SIM_VERSION 108 (1v1 life re-fit, team life unchanged); 680 before SIM_VERSION 101; 650 before SIM_VERSION 100
  fiara: 639, // 726 before SIM_VERSION 118 (2v2 67.9%); 682 before SIM_VERSION 114 (1v1 life cut, team life 3074 kept); 730 before SIM_VERSION 109; 700 before SIM_VERSION 69 (roster WP 0.4: ranged, so a fiara + sindarosa team is all ranged); 760 before SIM_VERSION 86
  ishimi: 765, // round 3: 37% 2v2; // 630 before SIM_VERSION 118 (2v2 21.7%); 670 before SIM_VERSION 101; 720 before SIM_VERSION 86
  lavax: 826, // 874 before SIM_VERSION 118 (2v2 60.9%); 804 before SIM_VERSION 108 (1v1 life re-fit, team life unchanged)
  morblass: 842, // SIM_VERSION 118 (was 810; 1v1 life cut, team life kept, 38% 2v2 at 817); 865 before SIM_VERSION 109; 881 before SIM_VERSION 69 (roster WP 0.4); 920 before SIM_VERSION 86
  pax: 628, // 647 before SIM_VERSION 112 (1v1 life +3%, team life unchanged); 675 before SIM_VERSION 108 (1v1 life re-fit, team life unchanged); 660 before SIM_VERSION 100
  rokcore: 767, // 740 before SIM_VERSION 118 (1v1 life cut, team life kept); 670 before SIM_VERSION 69 (roster WP 0.4)
  sindarosa: 838, // round 3: 37% 2v2; // 785 before SIM_VERSION 118 (1v1 life cut, team life kept); 830 before SIM_VERSION 106; 800 before SIM_VERSION 101
  treenoc: 733, // 695 before SIM_VERSION 118 (2v2 39.7%); 720 before SIM_VERSION 116 (2v2/3v3 only: takes back the team-mode side of the v114 +10% damage); 785 before SIM_VERSION 108 (1v1 life re-fit, team life unchanged); 695 before SIM_VERSION 101; 714 before SIM_VERSION 86
  wispera: 658, // 689 before SIM_VERSION 118 (2v2 60.3%); 710 before SIM_VERSION 112 (1v1 life +3.04%, team life unchanged); 690 before SIM_VERSION 101; 650 before SIM_VERSION 100; 632 before SIM_VERSION 86
  hyalia: 613, // 650 before SIM_VERSION 118 (2v2 64.4%)
  quarrak: 675, // 725 before SIM_VERSION 102
  kindrel: 770, // 730 before SIM_VERSION 118 (2v2 28.3%); 710 before SIM_VERSION 116 (kindrel-led 2v2 was the lowest entry); 755 before SIM_VERSION 103; 725 before 102; 650 before SIM_VERSION 90 (the lighter Ember Bite chain: 37.1% in 2v2 at 650, 59.7% at 780)
  nykra: 595, // 692 before SIM_VERSION 118 (1v1 life +6.5%, 2v2 62.5%); 655 before SIM_VERSION 109; 740 before SIM_VERSION 102
  brazgor: 400, // SIM_VERSION 118 (was 570; 1v1 life +35%, team life 2912 at 2v2 after 520/570 rounds); 513 before SIM_VERSION 113; 490 before SIM_VERSION 110; 460 before SIM_VERSION 102
  glimmaw: 600, // round 3: 60% 2v2; // 670 before SIM_VERSION 118 (2v2 68.2%, team life -8%)
  durrok: 630, // round 3: 41% 2v2; // round 2: 59.8% 2v2 at 647; // 675 before SIM_VERSION 110; 625 before SIM_VERSION 109; 590 before SIM_VERSION 102
  zephra: 918, // 830 before SIM_VERSION 118 (1v1 life cut, team life kept); 760 before SIM_VERSION 102
  ouroth: 552, // 628 before SIM_VERSION 118 (1v1 life +6.5%); 590 before SIM_VERSION 113 (1v1 life cut, team life kept)
  abyssor: 485, // round 2: 63% 2v2 at 510; // 560 before SIM_VERSION 118 (2v2 65.2%); 590 before SIM_VERSION 115 (abyssor-led 2v2 63.0%); 550 before SIM_VERSION 106; 475 before SIM_VERSION 103; 430 before 102
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
  tornado: 350, // SIM_VERSION 117: a rarer stun (300 in Classic)
  'ice-blast': 350, // SIM_VERSION 117: a rarer freeze
  'wyrm-coil': 175, // SIM_VERSION 117: a rarer hold
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
