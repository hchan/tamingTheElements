import { ELEMENTAL_ARMOR_PM, ELEMENTAL_DAMAGE_PM, ELEMENTAL_SPEED_PM } from '../../../data/arcade';
import { now } from '../../clock';
import { ARCADE_E, ArcadeE, type SimState } from '../../state';
import { kindOf } from './terrain';

/**
 * The timed half of the elemental ability (FUN-DESIGN 2.24): queries the hit and movement paths make, kept apart from
 * the cast (arcade/elemental.ts) so movement.ts can read them without an import cycle. All read 0 in Classic (no
 * Arcade block), so every factor stays 1000 there.
 */

const FIRE = 1;
const EARTH = 3;
const AIR = 4;

/** True while `id`'s Ember, Gale or Stoneskin runs (its `elemUntil` is ahead of the game clock). */
export function elementalOn(s: SimState, id: number): boolean {
  return id >= 0 && now(s) < (s.arcade[id * ARCADE_E + ArcadeE.elemUntil] ?? 0);
}

/**
 * The per-mille damage factor of a hit by `attacker` on `victim`: Ember (a fire attacker's buff) ELEMENTAL_DAMAGE_PM,
 * Stoneskin (an earth victim's) ELEMENTAL_ARMOR_PM, both multiply; 1000 with neither.
 */
export function elementalDamagePm(s: SimState, attacker: number, victim: number): number {
  const up = elementalOn(s, attacker) && kindOf(s, attacker) === FIRE ? ELEMENTAL_DAMAGE_PM : 1000;
  const down = elementalOn(s, victim) && kindOf(s, victim) === EARTH ? ELEMENTAL_ARMOR_PM : 1000;
  return down === 1000 ? up : Math.trunc((up * down) / 1000);
}

/** `id`'s walk speed per mille from Gale (an air hero's buff): ELEMENTAL_SPEED_PM while it runs, else 1000. */
export function elementalSpeedPm(s: SimState, id: number): number {
  return elementalOn(s, id) && kindOf(s, id) === AIR ? ELEMENTAL_SPEED_PM : 1000;
}
