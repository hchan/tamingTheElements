import {
  METER_BAR, METER_CAST, METER_DEAL_PM, METER_MAX,
  METER_TAKE_PM, WEATHER_CHARGE_CAST, WEATHER_CHARGE_FULL, WEATHER_CHARGE_STEP, WEATHER_RANGED_KINDS,
} from '../../../data/arcade';
import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import { CHARACTERS } from '../../../data/characters';
import { isArcade } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_T, ARCADE_TEAM_BASE, ArcadeT, type SimState } from '../../state';

const meterIndex = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.meter;

/** `team`'s hyper meter (0..METER_MAX); 0 in Classic. */
export function meterOf(s: SimState, team: number): number {
  return s.arcade[meterIndex(team)] ?? 0;
}

/** Full bars in a meter value. */
export function meterBars(meter: number): number {
  return Math.floor(meter / METER_BAR);
}

/**
 * Adds `amount` (an integer) to `team`'s meter, capped at METER_MAX, and emits `meterLevel {team, bars}` when the bar
 * count changes (FUN-DESIGN 2.5). Non-positive amounts do nothing.
 */
export function gainMeter(s: SimState, sink: EventSink, source: number, team: number, amount: number): void {
  if (amount <= 0) return;
  const i = meterIndex(team);
  const before = s.arcade[i] ?? 0;
  const after = Math.min(METER_MAX, before + amount);
  if (after === before) return;
  s.arcade[i] = after;
  const bars = meterBars(after);
  if (bars !== meterBars(before)) sink.emit(source, SimEventKind.meterLevel, { team, bars });
}

/** Spends `cost` of `team`'s meter (the caller checked it is there); `meterLevel` when the bar count changes. */
export function spendMeter(s: SimState, sink: EventSink, source: number, team: number, cost: number): void {
  const i = meterIndex(team);
  const before = s.arcade[i] ?? 0;
  s.arcade[i] = before - cost;
  const bars = meterBars(before - cost);
  if (bars !== meterBars(before)) sink.emit(source, SimEventKind.meterLevel, { team, bars });
}

/**
 * Meter for `dealt` health removed from a victim with `maxHp`: `floor(dealt * pm / maxHp)`. A share of the life bar,
 * so the same share gives the same meter at any level. Zero for no damage or no maximum.
 */
export function meterForDamage(dealt: number, maxHp: number, pm: number): number {
  if (!(dealt > 0) || !(maxHp > 0)) return 0;
  return Math.floor((dealt * pm) / maxHp);
}

/** A hit removed `dealt` health from `victim`: the attacker's team gains METER_DEAL_PM of the share, the victim's METER_TAKE_PM. */
export function meterOnHit(s: SimState, sink: EventSink, source: number, attackerTeam: number, victim: number, dealt: number): void {
  const maxHp = s.maxHp[victim] ?? 0;
  gainMeter(s, sink, source, attackerTeam, meterForDamage(dealt, maxHp, METER_DEAL_PM));
  gainMeter(s, sink, source, s.team[victim] ?? 0, meterForDamage(dealt, maxHp, METER_TAKE_PM));
}

/** A cast by `caster` of `team` (projectile, melee, buff or heal; not capture; through `onArcadeCast`): +METER_CAST. */
export function meterOnCast(s: SimState, sink: EventSink, caster: number, team: number): void {
  if (isArcade(s)) gainMeter(s, sink, caster, team, METER_CAST);
}

/** By character def index: 1 when its primary ability is ranged (WEATHER_RANGED_KINDS): it charges weather by casting. */
export const RANGED: readonly number[] = CHARACTERS.map((c) => {
  const kind = [...ABILITIES_A, ...ABILITIES_B].find((d) => d.id === c.abilities[0])?.kind ?? '';
  return WEATHER_RANGED_KINDS.includes(kind) ? 1 : 0;
});

/** `team`'s weather charge (0..WEATHER_CHARGE_FULL, FUN-DESIGN 2.14). */
export function weatherCharge(s: SimState, team: number): number {
  return s.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.weatherCharge] ?? 0;
}

/**
 * `char` of `team` cast (`cast` true) or walked a tick (false): its team's weather charge rises by WEATHER_CHARGE_CAST
 * if it is ranged and cast, by WEATHER_CHARGE_STEP if it is not and walked, capped at WEATHER_CHARGE_FULL.
 */
export function chargeWeather(s: SimState, char: number, team: number, cast: boolean): void {
  const ranged = RANGED[s.defId[char] ?? 0] === 1;
  if (ranged !== cast) return;
  const i = ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.weatherCharge;
  s.arcade[i] = Math.min(WEATHER_CHARGE_FULL, (s.arcade[i] ?? 0) + (cast ? WEATHER_CHARGE_CAST : WEATHER_CHARGE_STEP));
}
