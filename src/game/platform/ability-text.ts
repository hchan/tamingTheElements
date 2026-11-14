import { TRAP_TEAM_MAX, type Element } from '@core/index';
import {
  BLOCK_STUN_TICKS,
  DASH_INVULN_FROM,
  DASH_INVULN_TO,
  ELEMENTAL_ARMOR_PM,
  ELEMENTAL_DAMAGE_PM,
  ELEMENTAL_NAMES,
  ELEMENTAL_SPEED_PM,
  ELEMENTAL_TICKS,
  GUARD_CHIP_PM,
  PARRY_TICKS,
  SNAG_ROOT_TICKS,
} from '@core/lazy-index';
import { elementalShown } from './cleanse-info';

/**
 * One-line effect text for every action-bar ability, the single source for the Guide cards and the in-fight tooltips
 * (numbers come from the core data tables, so the two can never disagree).
 */

/** Sim ticks per second (50 Hz). */
const TPS = 50;

export const secs = (ticks: number): string => `${String(Math.round((ticks / TPS) * 10) / 10)} s`;

export const COMMON_EFFECT = {
  dash: `Burst of speed along your aim. Safe from hits on ticks ${String(DASH_INVULN_FROM)} to ${String(DASH_INVULN_TO)}: dodge a shot for meter.`,
  guard: `Blocks hits but ${String(GUARD_CHIP_PM / 10)}% still chips through and drains your guard. Press just before a hit (${String(PARRY_TICKS)} ticks) to parry; block-stun ${String(BLOCK_STUN_TICKS)} ticks.`,
  charge: 'Rush at the foe and stun them on touch. Not invulnerable: a foe who sees it coming can hit you.',
  super: 'Spends a bar of hyper meter. The hero unleashes a strike band across the stage. Meter fills as you deal and take damage.',
  trap: `Plant a trap ahead of you (up to ${String(TRAP_TEAM_MAX)} per team). It fires when a foe steps near, or when it times out.`,
  cleanse: 'Ends your own roots and slows. The same for every hero, and it plays out in your hero\'s element.',
  weather: 'Needs a full weather charge. Calls the weather of your element for the whole stage. See the weather cards below.',
  tag: 'Swap in a team-mate, who strikes on entry. Benched heroes slowly heal.',
  snag: `Some heroes throw a rope that roots a foe for ${secs(SNAG_ROOT_TICKS)}. A guarding foe wastes it; fire and the Sun burn it away.`,
} as const;

/** What the hero's own two attack boxes do (the exact moves differ per hero; the Guide lists them). */
export const HERO_EFFECT = {
  primary: 'Your hero\'s main attack. You turn to face the foe on their own; hold a direction to aim by hand.',
  secondary: 'Your hero\'s second attack, with its own cooldown. The shape differs per hero.',
} as const;

const pmPercent = (pm: number): string => `${String(Math.abs(Math.round((pm - 1000) / 10)))}%`;

export function elementalEffect(e: Element): string {
  const t = secs(ELEMENTAL_TICKS);
  switch (e) {
    case 'fire':
      return `${pmPercent(ELEMENTAL_DAMAGE_PM)} more damage dealt for ${t}.`;
    case 'earth':
      return `${pmPercent(ELEMENTAL_ARMOR_PM)} less damage taken for ${t}.`;
    case 'air':
      return `${pmPercent(ELEMENTAL_SPEED_PM)} faster walking for ${t}.`;
    default:
      return 'Instantly ends your roots and slows.';
  }
}


/** Player-facing name of the elemental ability per element kind (1 fire, 2 water, 3 earth, 4 air), from the core table. */
export function elementalTitle(kind: number): string {
  return elementalShown(ELEMENTAL_NAMES[kind] ?? 'Element');
}
