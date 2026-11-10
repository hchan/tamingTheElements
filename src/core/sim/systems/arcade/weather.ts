import {
  METER_WEATHER, WEATHER_CHARGE_FULL, WEATHER_COOLDOWN_TICKS, WEATHER_ELEMENTS, WEATHER_PM, WEATHER_TICKS,
} from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import type { Element } from '../../../data/elements';
import { now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, TEAM_COUNT, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { pending, Press, usePress } from './buffer';
import { gainMeter, weatherCharge } from './meter';
import { canAct } from './stun';
import { elementKind } from './terrain';
import { castTerrain } from './terrain-layout';

const KIND = ARCADE_WORLD_BASE + ArcadeW.weather;
const UNTIL = ARCADE_WORLD_BASE + ArcadeW.weatherUntil;
const TEAM = ARCADE_WORLD_BASE + ArcadeW.weatherTeam;

/**
 * `dmg` of an attacker of element `el` under the current weather (FUN-DESIGN 2.14): the favoured element `* WEATHER_PM
 * / 1000`, its counter `* 1000 / WEATHER_PM`, anything else (and no weather) unchanged, so it stays the exact value.
 * Float64 like the Classic chart: each `*` and `/` is one correctly rounded IEEE operation, the same in every engine.
 */
export function weatherDamage(s: SimState, dmg: number, el: Element): number {
  const row = WEATHER_ELEMENTS[(s.arcade[KIND] ?? 0) - 1];
  return row?.[0] === el ? (dmg * WEATHER_PM) / 1000 : row?.[1] === el ? (dmg * 1000) / WEATHER_PM : dmg;
}

/** Clears the weather slot, with `weatherEnded {weather}` when a weather was up (expiry and the round reset). */
export function endWeather(s: SimState, sink: EventSink): void {
  const kind = s.arcade[KIND] ?? 0;
  if (kind === 0) return;
  s.arcade.fill(0, KIND, TEAM + 1);
  sink.emit(0, SimEventKind.weatherEnded, { weather: kind });
}

/**
 * The `input` slot's weather pass (FUN-DESIGN 2.14), on unfrozen ticks after the dash and guard: a weather whose timer
 * ran out ends, then each team (0 first, so team 1's cast replaces a same-tick cast of team 0) casts on a pending
 * weather press (buffered like the dash) when its controlled character `canAct` and its weather is ready: the weather
 * of its element for WEATHER_TICKS (a replacement, or a refresh of the same kind), WEATHER_COOLDOWN_TICKS of lockout to the next
 * cast (the recovery is read from it, see `isFree`), METER_WEATHER and `weatherChanged {weather, prev, team}` (prev
 * == weather: a refresh).
 */
export function weatherTick(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const a = s.arcade;
  const g = now(s);
  if (g >= (a[UNTIL] ?? 0)) endWeather(s, sink);
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    const e = id * ARCADE_E + ArcadeE.weatherReadyAt;
    if (id < 0 || !pending(s, team, Press.weather) || g < (a[e] ?? 0) || weatherCharge(s, team) < WEATHER_CHARGE_FULL || !canAct(world, id)) continue;
    const el = CHARACTERS[s.defId[id] ?? 0]?.element;
    const kind = elementKind(el);
    const prev = a[KIND] ?? 0;
    a[KIND] = kind;
    a[UNTIL] = g + WEATHER_TICKS;
    a[TEAM] = team;
    a[e] = g + WEATHER_COOLDOWN_TICKS;
    a[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.weatherCharge] = 0;
    usePress(s, team, Press.weather);
    castTerrain(s, sink, kind, g);
    sink.emit(id, SimEventKind.weatherChanged, { weather: kind, prev, team });
    gainMeter(s, sink, id, team, METER_WEATHER);
  }
}
