import { ROUND_TIMER_TICKS, RoundPhase, WEATHER_CHARGE_FULL } from '../../../data/arcade';
import { ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeT, ArcadeW, TEAM_COUNT } from '../../state';
import type { SimWorld } from '../../world';

/**
 * Test support only (never imported by production code): puts a fresh Arcade world straight into round 1's `fight`
 * phase with a full timer, as if its 90-tick intro had played (FUN-DESIGN 2.10), so a rule test can act on tick 0. A
 * state edit outside `step`, like the tests' own placement edits. No-op in Classic (the block is empty).
 */
export function skipIntro(world: SimWorld): SimWorld {
  const a = world.state.arcade;
  if (a.length === 0) return world;
  a[ARCADE_WORLD_BASE + ArcadeW.round] = 1;
  a[ARCADE_WORLD_BASE + ArcadeW.phase] = RoundPhase.fight;
  a[ARCADE_WORLD_BASE + ArcadeW.phaseUntil] = 0;
  a[ARCADE_WORLD_BASE + ArcadeW.roundTimer] = ROUND_TIMER_TICKS;
  return world;
}

/** Test support: fills both teams' weather charge (WP-arcade-weather-charge), so a rule test can cast at once. No-op in Classic. */
export function chargedWeather(world: SimWorld): SimWorld {
  const a = world.state.arcade;
  if (a.length === 0) return world;
  for (let team = 0; team < TEAM_COUNT; team++) a[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.weatherCharge] = WEATHER_CHARGE_FULL;
  return world;
}
