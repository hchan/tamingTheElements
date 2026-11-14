import {
  BEATS,
  METER_BAR,
  TAG_COOLDOWN_TICKS,
  TRAP_COOLDOWN_TICKS,
  WEATHER_ELEMENTS,
  WEATHER_TICKS,
  computeDamage,
  type Element,
} from '@core/index';
import {
  CHARGE_COOLDOWN_TICKS,
  DASH_COOLDOWN_TICKS,
  ELEMENTAL_COOLDOWN_TICKS,
  ELEMENTAL_NAMES,
  SNAG_COOLDOWN_TICKS,
  SUPER_COST,
  WEATHER_COOLDOWN_TICKS,
  WEATHER_PM,
} from '@core/lazy-index';
import { COMMON_EFFECT, elementalEffect, secs } from '../../game/platform/ability-text';
import type { Bindings, GameAction } from '../../game/platform/input/bindings';
import { codeLabel } from '../../game/platform/input/bindings';
import { CLEANSE_COOLDOWN } from '../../game/platform/cleanse-info';
import { elementalShown } from '../../game/platform/cleanse-info';

/** The four wheel elements, clockwise from the top (the order is only the layout; the arrows come from BEATS). */
export const WHEEL_ORDER: readonly Element[] = ['fire', 'air', 'earth', 'water'];

export interface WheelArrow {
  readonly from: Element;
  readonly to: Element;
  /** Damage multiplier of `from` hitting `to`, from the sim's own damage function. */
  readonly mult: number;
  /** Damage multiplier of `to` hitting `from`. */
  readonly back: number;
}

/** Damage multiplier of an attacker element against a defender element, asked of the real damage rule (base 100). */
export function damageFactor(att: Element, def: Element): number {
  return computeDamage({ base: 100, attackerMult: 1, attEl: att, defEl: def, defReductionPct: 0 }) / 100;
}

/** One arrow per advantage in BEATS: `from` has advantage over `to`. */
export function wheelArrows(): readonly WheelArrow[] {
  const out: WheelArrow[] = [];
  for (const from of WHEEL_ORDER) {
    const to = BEATS[from];
    if (to !== undefined) out.push({ from, to, mult: damageFactor(from, to), back: damageFactor(to, from) });
  }
  return out;
}

/** "x1.25" style text, trimmed of trailing zeros. */
export function multText(m: number): string {
  return `x${String(Math.round(m * 100) / 100)}`;
}

export interface AbilityCard {
  readonly id: string;
  readonly name: string;
  /** Key label(s) for Player 1, from the live bindings. */
  readonly key: string;
  /** Cooldown in seconds, or a words-only note where there is none. */
  readonly cooldown: string;
  readonly effect: string;
  /** Icon key (see guide-icons). */
  readonly icon: string;
}

const keyOf = (b: Bindings, a: GameAction): string => b[a].map(codeLabel).join(' / ') || 'unbound';

/** Abilities every fighter has, with numbers read from the data tables. */
export function commonAbilities(b: Bindings): readonly AbilityCard[] {
  return [
    {
      id: 'dash',
      name: 'Dash',
      key: keyOf(b, 'dash'),
      cooldown: secs(DASH_COOLDOWN_TICKS),
      effect: COMMON_EFFECT.dash,
      icon: 'dash',
    },
    {
      id: 'guard',
      name: 'Guard',
      key: `${keyOf(b, 'guard')} (hold)`,
      cooldown: 'None',
      effect: COMMON_EFFECT.guard,
      icon: 'guard',
    },
    {
      id: 'charge',
      name: 'Charge',
      key: keyOf(b, 'charge'),
      cooldown: secs(CHARGE_COOLDOWN_TICKS),
      effect: COMMON_EFFECT.charge,
      icon: 'charge',
    },
    {
      id: 'super',
      name: 'Super',
      key: keyOf(b, 'super'),
      cooldown: `${String(SUPER_COST / METER_BAR)} meter bar`,
      effect: COMMON_EFFECT.super,
      icon: 'super',
    },
    {
      id: 'trap',
      name: 'Trap',
      key: keyOf(b, 'trap'),
      cooldown: secs(TRAP_COOLDOWN_TICKS),
      effect: COMMON_EFFECT.trap,
      icon: 'trap',
    },
    {
      id: 'cleanse',
      name: 'Cleanse',
      key: keyOf(b, 'cleanse'),
      cooldown: secs(CLEANSE_COOLDOWN),
      effect: COMMON_EFFECT.cleanse,
      icon: 'cleanse',
    },
    {
      id: 'weather',
      name: 'Weather',
      key: keyOf(b, 'weather'),
      cooldown: `${secs(WEATHER_COOLDOWN_TICKS)} lockout`,
      effect: COMMON_EFFECT.weather,
      icon: 'weather',
    },
    {
      id: 'tag',
      name: 'Tag',
      key: `${keyOf(b, 'slot3')} / ${keyOf(b, 'slot4')}`,
      cooldown: secs(TAG_COOLDOWN_TICKS),
      effect: COMMON_EFFECT.tag,
      icon: 'tag',
    },
    {
      id: 'snag',
      name: 'Snag',
      key: 'Hero attack',
      cooldown: secs(SNAG_COOLDOWN_TICKS),
      effect: COMMON_EFFECT.snag,
      icon: 'snag',
    },
  ];
}

/** Element kinds in ELEMENTAL_* tables: 1 fire, 2 water, 3 earth, 4 air. */
const ELEMENTAL_KIND: Readonly<Partial<Record<Element, number>>> = { fire: 1, water: 2, earth: 3, air: 4 };

/** The one elemental ability per element, from the Arcade tables (void heroes have none). */
export function elementalAbilities(b: Bindings): readonly (AbilityCard & { readonly element: Element })[] {
  return WHEEL_ORDER.map((element) => {
    const kind = ELEMENTAL_KIND[element] ?? 0;
    return {
      element,
      id: `elemental-${element}`,
      name: elementalShown(ELEMENTAL_NAMES[kind] ?? ''),
      key: keyOf(b, 'elemental'),
      cooldown: secs(ELEMENTAL_COOLDOWN_TICKS[kind] ?? 0),
      effect: elementalEffect(element),
      icon: `elemental-${element}`,
    };
  });
}

export interface WeatherCard {
  readonly id: string;
  readonly name: string;
  readonly caster: Element;
  readonly counter: Element | null;
  readonly favourText: string;
  readonly counterText: string;
  readonly extra: string;
  readonly duration: string;
}

/** Weather names by `Weather` kind - 1 (sun, rain, sandstorm, gale, eclipse), index-matched to WEATHER_ELEMENTS. */
const WEATHER_NAMES: readonly string[] = ['Sun', 'Rain', 'Sandstorm', 'Gale', 'Eclipse'];
const WEATHER_EXTRA: readonly string[] = ['Burns every Snag rope.', '', '', '', 'Only Void fighters are touched.'];

/** One card per weather, favoured and countered elements and multipliers from WEATHER_ELEMENTS and WEATHER_PM. */
export function weatherCards(): readonly WeatherCard[] {
  const up = WEATHER_PM / 1000;
  return WEATHER_ELEMENTS.map(([caster, counter], i) => ({
    id: (WEATHER_NAMES[i] ?? '').toLowerCase(),
    name: WEATHER_NAMES[i] ?? '',
    caster,
    counter,
    favourText: `${caster} fighters deal ${multText(up)} damage`,
    counterText: counter === null ? 'Nobody else is changed' : `${counter} fighters deal ${multText(1 / up)} damage`,
    extra: WEATHER_EXTRA[i] ?? '',
    duration: secs(WEATHER_TICKS),
  }));
}
