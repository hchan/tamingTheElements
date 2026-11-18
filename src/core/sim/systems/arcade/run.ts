import { RUN_COOLDOWN_TICKS, RUN_TICKS, RunEnd } from '../../../data/arcade';
import { now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT } from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { pending, Press, usePress } from './buffer';
import { endRun, isRunning, runsAway } from './run-move';
import { isRooted } from './snag';
import { canAct } from './stun';

/**
 * Starts or stops `team`'s run (FUN-DESIGN 2.29) on a pending run press, for the controlled hero. While running, a press
 * stops the run. A direction that rose on or after the press wins (nothing starts). Otherwise it starts when there is a
 * foe, the hero is ready, can act (not frozen, stunned, guarding...) and is not rooted; else the press stays buffered.
 * A start sets `runUntil` to now + RUN_TICKS and a provisional `runReadyAt` (RUN_COOLDOWN_TICKS after that end, for the
 * HUD; `endRun` counts the real one), clears `dirRise` and emits `runStarted {away, until}`. Called by the `input` slot on
 * unfrozen ticks; movement (arcade/run-move.ts `runTick`) ends it and steps it.
 */
export function startRun(world: SimWorld, sink: EventSink, team: number): void {
  const s = world.state;
  const id = controlledId(world, team);
  if (id < 0 || !pending(s, team, Press.run)) return;
  const e = id * ARCADE_E;
  const t = ARCADE_TEAM_BASE + team * ARCADE_T;
  if (isRunning(s, id)) {
    usePress(s, team, Press.run);
    endRun(s, sink, id, RunEnd.broken);
    return;
  }
  if ((s.arcade[t + ArcadeT.dirRise] ?? 0) >= (s.arcade[t + ArcadeT.pressTick + Press.run] ?? 0)) {
    usePress(s, team, Press.run);
    return;
  }
  const g = now(s);
  if (controlledId(world, 1 - team) < 0 || g < (s.arcade[e + ArcadeE.runReadyAt] ?? 0) || !canAct(world, id) || isRooted(s, id)) return;
  const until = g + RUN_TICKS;
  s.arcade[t + ArcadeT.dirRise] = 0;
  s.arcade[e + ArcadeE.runUntil] = until;
  s.arcade[e + ArcadeE.runReadyAt] = until + RUN_COOLDOWN_TICKS;
  usePress(s, team, Press.run);
  sink.emit(id, SimEventKind.runStarted, { away: runsAway(s, id) ? 1 : 0, until });
}
