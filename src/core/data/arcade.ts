/**
 * Arcade ruleset tuning (docs/FUN-DESIGN.md sections 2 and 2.13). Skeleton: each Arcade work package adds its table
 * here as starting values, tuned by the fun metrics. Sim data: changing a value bumps SIM_VERSION. Classic never reads
 * this file. The per-race Arcade numbers (WP-arcade-numbers) are in `src/core/sim/arcade-numbers.ts`.
 */
import type { Aabb } from '../math/aabb';
import { ARENA_HEIGHT, ARENA_WIDTH, CHARACTER_HEIGHT, CHARACTER_WIDTH } from './chapters';
import type { Element } from './elements';

/** Hit strength tier, the index into every per-strength table (hit-stop, stun, knockback). */
export const HitStrength = { light: 0, medium: 1, heavy: 2, super: 3 } as const;
export type HitStrengthValue = (typeof HitStrength)[keyof typeof HitStrength];

/** One value per HitStrength tier, in tier order. */
export type PerStrength = readonly [light: number, medium: number, heavy: number, superHit: number];

/** Hit-stop length in ticks by strength (FUN-DESIGN 2.2): light 4, medium 6, heavy 8, super hit 10. */
export const HIT_STOP_TICKS: PerStrength = [4, 6, 8, 10];
/** Hit-stop of a parry (WP-arcade-guard-parry) and of a KO (a hit that empties the victim's HP), in ticks. */
export const PARRY_HIT_STOP_TICKS = 10;
export const KO_HIT_STOP_TICKS = 30;

/** `hitStop.cause` payload values (FUN-DESIGN 2.1 event table). */
export const HitStopCause = { hit: 0, parry: 1, super: 2, ko: 3 } as const;

/** Strength from the base damage at level 0: light under 15, medium 15 to 29, heavy 30 or more. */
export const MEDIUM_MIN_DAMAGE = 15;
export const HEAVY_MIN_DAMAGE = 30;

/**
 * Per-ability strength overrides (by ability slug), applied instead of the damage rule and the melee tier bump.
 * Hurricane hits every 25 ticks for a damage that halves each hit, so its hits stay light.
 */
export const HIT_STRENGTH_OVERRIDE: Readonly<Partial<Record<string, HitStrengthValue>>> = {
  hurricane: HitStrength.light,
};

/**
 * Strength tier of an ability's hit: the damage rule, plus one tier for melee (capped at heavy, since only supers
 * are strength 3), unless HIT_STRENGTH_OVERRIDE names the ability.
 */
export function hitStrengthFor(slug: string, baseDamage: number, melee: boolean): HitStrengthValue {
  const forced = HIT_STRENGTH_OVERRIDE[slug];
  if (forced !== undefined) return forced;
  const tier = baseDamage >= HEAVY_MIN_DAMAGE ? 2 : baseDamage >= MEDIUM_MIN_DAMAGE ? 1 : 0;
  return (melee && tier < 2 ? tier + 1 : tier) as HitStrengthValue;
}

/**
 * Hit-stun in game ticks by strength (FUN-DESIGN 2.3): light 32, medium 38, heavy 44, super 48. Each hit taken while
 * already stunned (`juggle`) takes JUGGLE_STUN_STEP off, never below MIN_HIT_STUN_TICKS. WP-arcade-numbers raised them
 * from the first 12/16/22/26: the projectile cooldowns are 15-30 game ticks (Fire Blast, Sonar Blast and Fireball 30,
 * Wind Cone and Rock Pellet 20, Icicles 15), so a stun shorter than the cooldown ended before any follow-up could land and median combo
 * was 1 hit; at 32 a light hit covers one cooldown (median combo 2+ in the round robin). The caps below still bound it.
 */
export const HIT_STUN_TICKS: PerStrength = [32, 38, 44, 48];
export const JUGGLE_STUN_STEP = 2;
export const MIN_HIT_STUN_TICKS = 6;
/** At `juggle >= JUGGLE_LIMIT` the next hit deals damage but no stun and the victim recovers. */
export const JUGGLE_LIMIT = 5;
/** A combo's stun chain never exceeds this many game ticks (3 s): the hit that would pass it ends the stun instead. */
export const COMBO_STUN_CAP_TICKS = 150;
/** Invulnerability after either cap ends a combo (`recovered` reason 1 or 2), so a capped combo cannot restart at once. */
export const RECOVERY_INVULN_TICKS = 20;
/** Tornado stuns (heavy, obeying the caps) instead of the Classic 150-tick freeze. */
export const FREEZE_STUN_TICKS = 60;
/** WP-snag-tune: hit-stun of the Snag hit in game ticks (the Vines' 60 stun would chain into the root; FUN-DESIGN 2.20). */
export const SNAG_STUN_TICKS = 20;
export const HIT_STUN_OVERRIDE: Readonly<Partial<Record<string, number>>> = {
  tornado: FREEZE_STUN_TICKS,
  'entangling-vines': SNAG_STUN_TICKS,
};

/** Base hit-stun of an ability's hit: the override, else the strength table. */
export function hitStunFor(slug: string, strength: HitStrengthValue): number {
  return HIT_STUN_OVERRIDE[slug] ?? HIT_STUN_TICKS[strength];
}

/** `recovered.reason` payload values (FUN-DESIGN 2.1 event table). */
/**
 * Charge (FUN-DESIGN 2.17, WP 36), in game ticks. A melee hero's charge press rushes along the 8-way line towards the
 * opponent for CHARGE_TICKS at CHARGE_SPEED_MULT x `speed`, at most CHARGE_MAX_STEP_PX per axis and tick (so 360 px in
 * all), not invulnerable. Touching a vulnerable opponent lands a light-strength hit of CHARGE_DAMAGE base damage and
 * CHARGE_STUN_TICKS of hit-stun, gives the charger METER_CHARGE and buffers its primary for the next tick. The next
 * charge is ready CHARGE_COOLDOWN_TICKS after the start. A diagonal needs each axis offset under twice the other.
 * `ChargeEnd` is the `chargeEnded` reason; the AI charges from CHARGE_AI_MIN_DIST px (centre distance, per axis).
 */
export const CHARGE_TICKS = 12;
export const CHARGE_SPEED_MULT = 5;
export const CHARGE_MAX_STEP_PX = 30;
export const CHARGE_COOLDOWN_TICKS = 300;
export const CHARGE_STUN_TICKS = 20;
export const CHARGE_DAMAGE = 8;
export const METER_CHARGE = 40;
export const CHARGE_AI_MIN_DIST = 200;
export const ChargeEnd = { expired: 0, arrived: 1, blocked: 2, interrupted: 3 } as const;

export const RecoveredReason = { stunEnded: 0, juggleCap: 1, stunCap: 2 } as const;

/**
 * Snag (FUN-DESIGN 2.20, WP-snag), in game ticks and px. A rope throw that roots: the Entangling Vines melee on the
 * ARCADE_SNAG_SLOT slot of these heroes (Arcade only; Classic data unchanged), a SNAG_RANGE_PX x SNAG_WIDTH_PX box along
 * the aim, ready SNAG_COOLDOWN_TICKS after a throw. A hit roots the target SNAG_ROOT_TICKS (no walking, Dash or Charge;
 * it can still turn, aim, cast and guard); a guarding target wastes the throw. A shot of SNAG_FIRE_ABILITIES or a Sun
 * weather frees it at once. Freed or expired, the target is immune to a new root for SNAG_IMMUNE_TICKS.
 * `SnagEvent` is the `snag` event reason; the payload `id` is the target, `sourceId` the rope (rooted, guarded), the
 * fire shot or Sun caster (freed), or the target itself (expired).
 */
export const ARCADE_SNAG_SLOT: Readonly<Partial<Record<string, number>>> = { treenoc: 0, wispera: 0, curomo: 1, echo: 0 };
export const SNAG_ABILITY = 'entangling-vines';
export const SNAG_RANGE_PX = 240;
export const SNAG_WIDTH_PX = 40;
export const SNAG_COOLDOWN_TICKS = 400;
export const SNAG_ROOT_TICKS = 60;
/** WP-snag-tune: the throw also hurts, base damage before the thrower's `damagePm` (the Classic vines deal 0). */
export const SNAG_DAMAGE = 30;

export const SNAG_IMMUNE_TICKS = 75;
export const SNAG_FIRE_ABILITIES: readonly string[] = ['fireball', 'crimson-fire', 'fire-blast', 'elemental-advantage-fire-cone'];
export const SnagEvent = { rooted: 0, guarded: 1, freed: 2, expired: 3 } as const;

/**
 * Traps (WP 39, ideas/in-progress/wp39-bomb-trap.md), game ticks and px. `Cmd.trap` plants the caster's element trap
 * TRAP_PLACE_PX ahead along its aim; it arms after TRAP_ARM_TICKS, then fires when a foe touches its TRAP_BOX_PX box
 * inflated by TRAP_TRIGGER_PX, or when its life (TRAP_LIFE_TICKS by kind, from arming) runs out. TrapKind: 1 Fire Bomb
 * (a TRAP_BLAST_PX blast), 2 Puddle (TRAP_PUDDLE_SLOW_PM walk speed, TRAP_PUDDLE_LINGER_TICKS after leaving; it stays
 * until its life ends), 3 Spike (one hit, longer stun), 4 Gust (a heavy shove, no damage). TrapReason is the
 * `trapTriggered` reason.
 */
export const TrapKind = { none: 0, fireBomb: 1, puddle: 2, spike: 3, gust: 4 } as const;
export const TrapReason = { overlap: 0, timeout: 1, doused: 2 } as const;
export const TRAP_PLACE_PX = 72;
export const TRAP_CAST_TICKS = 14;
export const TRAP_ARM_TICKS = 30;
/** Life after arming by TrapKind (index 0 unused). */
export const TRAP_LIFE_TICKS: readonly number[] = [0, 150, 300, 200, 200];
export const TRAP_BOX_PX = 56;
export const TRAP_TRIGGER_PX = 24;
export const TRAP_BLAST_PX = 112;
export const TRAP_FIRE_DAMAGE = 22;
export const TRAP_SPIKE_DAMAGE = 18;
export const TRAP_SPIKE_STUN_TICKS = 50;
export const TRAP_PUDDLE_SLOW_PM = 600;
export const TRAP_PUDDLE_LINGER_TICKS = 40;
/** A heavy hit's knockback (KNOCKBACK_Q4[heavy]): about 105 px, into the wall bounce. */
export const TRAP_GUST_KB_Q4 = 224;
export const TRAP_COOLDOWN_TICKS = 500;
export const TRAP_TEAM_MAX = 2;
export const TRAP_MIN_GAP_PX = 64;

/**
 * Knockback start speed in Q4 (1/16 px per tick) by strength: light 96 (6 px per tick), medium 144, heavy 224, super
 * 256. It decays by KNOCKBACK_DECAY_Q4 (1 px per tick) every game tick, so light travels 21 px, medium 45, heavy 105.
 */
export const KNOCKBACK_Q4: PerStrength = [96, 144, 224, 256];
export const KNOCKBACK_DECAY_Q4 = 16;
export const Q4_ONE = 16;

/**
 * Combo damage scaling in pm by hit index (FUN-DESIGN 2.4): hits 1..6 of a combo take COMBO_SCALE_PM[hit - 1], later
 * hits COMBO_SCALE_FLOOR_PM. A super keeps at least SUPER_COMBO_FLOOR_PM (a super that starts a combo is hit 1: 1000).
 */
export const COMBO_SCALE_PM = [1000, 1000, 900, 800, 700, 600] as const;
export const COMBO_SCALE_FLOOR_PM = 500;
export const SUPER_COMBO_FLOOR_PM = 600;

/** Damage scale (pm) of combo hit `hit` (1-based) at `strength`. */
export function comboScalePm(hit: number, strength: HitStrengthValue): number {
  const pm = COMBO_SCALE_PM[hit - 1] ?? COMBO_SCALE_FLOOR_PM;
  return strength === HitStrength.super ? Math.max(pm, SUPER_COMBO_FLOOR_PM) : pm;
}

/**
 * Hyper meter (FUN-DESIGN 2.5): per team, 0..METER_MAX in bars of METER_BAR. Gains are level-independent: dealing
 * damage gives `floor(dealt * METER_DEAL_PM / victimMaxHp)` (a full life bar dealt is 0.8 bars), taking it
 * `floor(dealt * METER_TAKE_PM / victimMaxHp)`; each cast +METER_CAST, a parry +METER_PARRY, a perfect dodge
 * +METER_PERFECT_DODGE and a clash +METER_CLASH to each side.
 */
export const METER_BAR = 1000;
export const METER_BARS = 3;
export const METER_MAX = METER_BAR * METER_BARS;
export const METER_DEAL_PM = 800;
export const METER_TAKE_PM = 600;
export const METER_CAST = 20;
export const METER_PARRY = 150;
export const METER_PERFECT_DODGE = 100;
export const METER_CLASH = 50;

/**
 * Elemental clash (FUN-DESIGN 2.9, WP 18): overlapping projectiles of opposing teams clash by their owners' elements.
 * The advantaged one survives with damage `max(hp - loserHp / CLASH_LOSER_DIV, hp / CLASH_FLOOR_DIV)`; any other
 * relation destroys both. Both divisors are powers of two, so the divisions are exact in binary floating point (no
 * rounding; only the IEEE subtraction rounds, the same in every engine). Each side gains METER_CLASH.
 */
export const CLASH_LOSER_DIV = 2;
export const CLASH_FLOOR_DIV = 4;

/**
 * Super (FUN-DESIGN 2.5, WP 8): costs SUPER_COST meter and `canAct`; freezes the game SUPER_FREEZE_TICKS (the
 * cinematic) with the caster invulnerable through it and SUPER_INVULN_AFTER_TICKS game ticks past it. The generic
 * "Elemental Burst" (every race until the archetype WPs) is the Fire Inferno Beam shape: a SUPER_BAND_PX band from the
 * caster's centre to the arena wall on its facing side, active SUPER_ACTIVE_TICKS, one strength-3 hit of
 * SUPER_HIT_DAMAGE every SUPER_HIT_EVERY ticks (5 hits). The caster cannot act until `superEnded`.
 */
export const SUPER_COST = METER_BAR;
export const SUPER_FREEZE_TICKS = 40;
export const SUPER_INVULN_AFTER_TICKS = 8;
export const SUPER_ACTIVE_TICKS = 30;
export const SUPER_HIT_EVERY = 6;
export const SUPER_HIT_DAMAGE = 12;
export const SUPER_BAND_PX = 160;
/** `superStarted.superId` of the generic Elemental Burst; the race variants of the archetype WPs get their own ids. */
export const SUPER_ELEMENTAL_BURST = 0;

/**
 * Input windows (FUN-DESIGN 2.12), in game ticks (a freeze does not age a press). A press of primary, secondary or super
 * that cannot run at once runs on the first tick it can within BUFFER_TICKS of the press (age 0..BUFFER_TICKS), once.
 * Primary and secondary pressed within SUPER_CHORD_TICKS of each other (0..SUPER_CHORD_TICKS apart) are a super press
 * when the team has SUPER_COST meter and no super running. The dash and parry windows are with the dash and guard tables.
 */
export const BUFFER_TICKS = 8;
export const SUPER_CHORD_TICKS = 3;

/**
 * Rounds (FUN-DESIGN 2.10, WP 13): `ArcadeW.phase` values. A fresh Arcade world is in `intro` of round 0; the `cleanup`
 * slot (`arcadeRound`) starts round 1 on the first tick. `over` follows the last `roundEnd`, and `endSystem` then emits
 * `matchEnded`. Only `fight` lets characters act or be hit.
 */
export const RoundPhase = { intro: 0, fight: 1, ko: 2, roundEnd: 3, over: 4 } as const;
/**
 * Phase lengths in `W.tick` ticks (real time; a phase ends on the first tick that runs its systems at or past the
 * deadline): the intro, the KO phase after the KO hit-stop (its first KO_SLOWMO_TICKS run at half speed: the game clock
 * advances every second tick), and the round end. The round timer is in game ticks, so it pauses during freezes.
 */
export const ROUND_INTRO_TICKS = 90;
export const KO_PHASE_TICKS = 120;
export const KO_SLOWMO_TICKS = 60;
export const ROUND_END_TICKS = 60;
export const ROUND_TIMER_TICKS = 4500;
/** Best of 3: the match ends once a team has this many round wins (a draw round scores for both). */
export const ROUNDS_TO_WIN = 2;
/** Time over compares the sum of `floor(hp * HP_PM / maxHp)` over each team's roster: higher wins, equal is a draw. */
export const HP_PM = 1000;

/**
 * Dash (FUN-DESIGN 2.7, WP 15), in game ticks. A dash press (`Cmd.dash`, buffered like the attacks) or the same
 * direction pressed twice within DOUBLE_TAP_TICKS (rising edges, 0..DOUBLE_TAP_TICKS apart) starts a dash: DASH_TICKS
 * at DASH_SPEED_MULT x `speed` along the held direction (or the aim), invulnerable on dash ticks DASH_INVULN_FROM ..
 * DASH_INVULN_TO (1-based), then DASH_RECOVERY_TICKS without acting; the next dash is ready DASH_COOLDOWN_TICKS after
 * the start. An enemy projectile overlapping the dasher on its invulnerable ticks is a perfect dodge (METER_PERFECT_DODGE,
 * once per dash). A dash within DASH_CANCEL_TICKS of the team's last confirmed hit cancels the dasher's melee recovery.
 */
export const DASH_TICKS = 12;
export const DASH_SPEED_MULT = 3;
export const DASH_INVULN_FROM = 2;
export const DASH_INVULN_TO = 7;
export const DASH_RECOVERY_TICKS = 6;
export const DASH_COOLDOWN_TICKS = 30;
export const DOUBLE_TAP_TICKS = 12;
export const DASH_CANCEL_TICKS = 10;

/**
 * Guard and parry (FUN-DESIGN 2.8, WP 16), in game ticks. Holding `Cmd.guard` blocks every hit but a super: the hit
 * deals GUARD_CHIP_PM of its damage, the light knockback and BLOCK_STUN_TICKS of block-stun (no hit-stun, no combo),
 * and drains `floor(chip * GUARD_DRAIN_PM / maxHp)` of the guard meter (GUARD_MAX), which regenerates GUARD_REGEN per
 * game tick while not guarding. Emptied: `guardBroken` and GUARD_BREAK_STUN_TICKS of stun. A guard press starts a
 * parry window: a hit 0..PARRY_TICKS game ticks later is parried (no damage, PARRY_HIT_STOP_TICKS, METER_PARRY; a
 * projectile is reflected, a melee attacker is stunned PARRY_STUN_TICKS). A window that ends without a hit locks new
 * parries for PARRY_LOCK_TICKS; a press meanwhile is dropped.
 */
export const GUARD_CHIP_PM = 250;
export const BLOCK_STUN_TICKS = 8;
export const GUARD_MAX = 1000;
/**
 * 2000 before WP-arcade-numbers. The drain is a share of the guard's max HP, and Arcade lives are now about 4x the
 * damage that hits them (ARCADE_RACE_NUMBERS: `hpPm / damagePm` is about 4 for every race), so at 2000 a guard took
 * about 4x the blocked hits to break (a guard held against Fire Blast never broke); 4 x 2000 keeps the hit count.
 */
export const GUARD_DRAIN_PM = 8000;
export const GUARD_REGEN = 5;
export const GUARD_BREAK_STUN_TICKS = 60;
export const PARRY_TICKS = 8;
export const PARRY_STUN_TICKS = 20;
export const PARRY_LOCK_TICKS = 20;

/**
 * Weather (FUN-DESIGN 2.14, WP 29), in game ticks. A `Cmd.weather` press (buffered like the dash) by a character that
 * `canAct` and whose weather is ready calls the weather of its element (the WEATHER_ELEMENTS row whose favoured element
 * is the caster's) for WEATHER_TICKS; a new weather replaces the old one, the same weather only refreshes its timer.
 * The caster is in recovery for WEATHER_RECOVERY_TICKS (medium: it cannot act and a hit on it is a counter hit), gains
 * METER_WEATHER, and its next cast is ready WEATHER_COOLDOWN_TICKS after this one (per character, like the ability
 * cooldowns). While a weather is up, every Arcade hit by an attacker of the favoured element deals `* WEATHER_PM /
 * 1000` and one by an attacker of the counter element `* 1000 / WEATHER_PM` (exactly /1.2, not 833 pm), after the
 * element chart and before the combo scale. Both teams feel it.
 */
export const Weather = { none: 0, sun: 1, rain: 2, sandstorm: 3, gale: 4, eclipse: 5 } as const;
/** By weather kind - 1: [favoured element, its counter (null: Eclipse leaves every other element at x1.0)]. */
export const WEATHER_ELEMENTS: readonly (readonly [Element, Element | null])[] = [
  ['fire', 'water'], ['water', 'fire'], ['earth', 'air'], ['air', 'earth'], ['void', null],
];
export const WEATHER_PM = 1200;
export const WEATHER_TICKS = 500;
/**
 * Weather power (FUN-DESIGN 2.14, WP 35): the cooldown became a lockout of WEATHER_COOLDOWN_TICKS (a held key cannot
 * double-cast). A cast needs the team's weather charge (per mille, 0..WEATHER_CHARGE_FULL) full, spends all of it, and
 * the round reset empties it. Ranged heroes (primary ability kind in WEATHER_RANGED_KINDS) gain WEATHER_CHARGE_CAST per
 * primary or secondary cast; every other hero gains WEATHER_CHARGE_STEP per tick it walks or runs (a moved tick, not a
 * dash, not blocked by a wall).
 */
export const WEATHER_COOLDOWN_TICKS = 50;
export const WEATHER_CHARGE_FULL = 1000;
export const WEATHER_CHARGE_CAST = 30;
export const WEATHER_CHARGE_STEP = 4;
export const WEATHER_RANGED_KINDS: readonly string[] = ['range', 'omni'];
export const WEATHER_RECOVERY_TICKS = 16;
export const METER_WEATHER = 50;
/**
 * Secondary effects by weather kind - 1 (FUN-DESIGN 2.14). Data only and OFF in this slice (WEATHER_EFFECTS_ON is
 * false and no system reads the rows): Sun melts freeze 10 ticks faster, Rain puts out burning, Sandstorm slows
 * projectiles to 900 pm, Gale pushes knockback to 1100 pm, Eclipse has none.
 */
export const WEATHER_EFFECTS_ON = false;
export const WEATHER_EFFECTS = [
  { effect: 'meltFreezeTicks', value: 10 }, { effect: 'extinguishBurn', value: 1 },
  { effect: 'projectileSpeedPm', value: 900 }, { effect: 'knockbackPm', value: 1100 }, { effect: 'none', value: 0 },
] as const;

/**
 * Tag team (FUN-DESIGN 2.6, WP 19), in game ticks. A tag (the swap keys) needs the active character free (`isFree`, and
 * not in cast recovery) and books TAG_COOLDOWN_TICKS (Classic 250). The partner enters at the outgoing character's
 * position, facing and aim, invulnerable TAG_INVULN_TICKS (KO_ENTRANCE_INVULN_TICKS when the death auto-swap brought it
 * in), and casts its primary at once for free (the entrance attack: its cooldown is left as it was). Benched characters
 * heal REST_HEAL_PM of max HP every REST_HEAL_EVERY game ticks up to the rest cap (Classic 5 pm every 50 ticks; 10 pm in SIM_VERSION 18-21, 3 pm from 22 so a 2v2 round does not drag on), and
 * only while benched (KNOWN-BUG `rest-heal-enemy-in-play` fixed in Arcade).
 */
export const TAG_COOLDOWN_TICKS = 150;
export const TAG_INVULN_TICKS = 20;
export const KO_ENTRANCE_INVULN_TICKS = 60;
export const REST_HEAL_EVERY = 10;
export const REST_HEAL_PM = 3;

/**
 * Playfield (FUN-DESIGN 2.1, WP-arcade-playfield-bounds), in integer logical px. The Arcade arena is not the full canvas:
 * fighters, knockback, dashes, projectiles and the super band stay inside the rectangle between the top HUD (health bars,
 * round timer, hyper meters y 124-134, the weather badge plate to y 200 on a phone) and the action bar (y 640). It is
 * ARCADE_ARENA_WIDTH wide (WP 38d, SIM_VERSION 32: 1.5 screens; the view camera pans over it, `src/game/fx/arena-pan.ts`).
 * The view's own constants are asserted against these in `tests/repo/arcade-playfield-hud.test.ts`.
 * Classic keeps the legacy arena (`DEFAULT_ARENA`, y 100-720, 1280 wide).
 */
export const ARCADE_ARENA_WIDTH = 1920;
export const PLAYFIELD_INSET_TOP = 200;
export const PLAYFIELD_INSET_BOTTOM = 80;
const PLAYFIELD: Aabb = { x: 0, y: PLAYFIELD_INSET_TOP, w: ARCADE_ARENA_WIDTH, h: ARENA_HEIGHT - PLAYFIELD_INSET_TOP - PLAYFIELD_INSET_BOTTOM };
/** The one Arcade walkable rectangle (the terrain patches of FUN-DESIGN 2.15 use it too). Do not mutate. */
export function arcadePlayfield(): Aabb {
  return PLAYFIELD;
}
/** Arcade start row: fighters vertically centred in the playfield. */
export const ARCADE_START_Y = PLAYFIELD_INSET_TOP + (PLAYFIELD.h - CHARACTER_HEIGHT) / 2;
/**
 * Arcade start columns (WP 38d): the Classic spots (160 px inside a 1280 span) on the 1280 span centred in the wider
 * arena, so a round starts as it looked on the 1280 arena (P1 x 480, P2 x 1360). Wider spawns are a later tuning WP.
 */
export const ARCADE_SPAWN_SPAN_X = (ARCADE_ARENA_WIDTH - ARENA_WIDTH) / 2;
export const ARCADE_SPAWN_INSET = 160;
export const ARCADE_P1_START_X = ARCADE_SPAWN_SPAN_X + ARCADE_SPAWN_INSET;
export const ARCADE_P2_START_X = ARCADE_SPAWN_SPAN_X + ARENA_WIDTH - ARCADE_SPAWN_INSET - CHARACTER_WIDTH;
