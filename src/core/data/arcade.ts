/**
 * Arcade ruleset tuning (docs/FUN-DESIGN.md sections 2 and 2.13). Skeleton: each Arcade work package adds its table
 * here as starting values, tuned by the fun metrics. Sim data: changing a value bumps SIM_VERSION. Classic never reads
 * this file.
 */

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
 * Hit-stun in game ticks by strength (FUN-DESIGN 2.3): light 12, medium 16, heavy 22, super 26. Each hit taken while
 * already stunned (`juggle`) takes JUGGLE_STUN_STEP off, never below MIN_HIT_STUN_TICKS.
 */
export const HIT_STUN_TICKS: PerStrength = [12, 16, 22, 26];
export const JUGGLE_STUN_STEP = 2;
export const MIN_HIT_STUN_TICKS = 6;
/** At `juggle >= JUGGLE_LIMIT` the next hit deals damage but no stun and the victim recovers. */
export const JUGGLE_LIMIT = 5;
/** A combo's stun chain never exceeds this many game ticks (3 s): the hit that would pass it ends the stun instead. */
export const COMBO_STUN_CAP_TICKS = 150;
/** Invulnerability after either cap ends a combo (`recovered` reason 1 or 2), so a capped combo cannot restart at once. */
export const RECOVERY_INVULN_TICKS = 20;
/** Tornado and Entangling Vines stun (heavy, obeying the caps) instead of the Classic 150-tick freeze. */
export const FREEZE_STUN_TICKS = 60;
export const HIT_STUN_OVERRIDE: Readonly<Partial<Record<string, number>>> = {
  tornado: FREEZE_STUN_TICKS,
  'entangling-vines': FREEZE_STUN_TICKS,
};

/** Base hit-stun of an ability's hit: the override, else the strength table. */
export function hitStunFor(slug: string, strength: HitStrengthValue): number {
  return HIT_STUN_OVERRIDE[slug] ?? HIT_STUN_TICKS[strength];
}

/** `recovered.reason` payload values (FUN-DESIGN 2.1 event table). */
export const RecoveredReason = { stunEnded: 0, juggleCap: 1, stunCap: 2 } as const;

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
 * `floor(dealt * METER_TAKE_PM / victimMaxHp)`; each cast +METER_CAST. Parry, perfect dodge and clash gains are used by
 * their work packages (guard and parry, dash, clash).
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
 * when the team has SUPER_COST meter and no super running. The dash and parry windows arrive with their work packages.
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
