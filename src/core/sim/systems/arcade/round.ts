import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from '../../../data/chapters';
import {
  HP_PM, HitStopCause, KO_HIT_STOP_TICKS, KO_PHASE_TICKS, KO_SLOWMO_TICKS, ROUNDS_TO_WIN, ROUND_END_TICKS,
  ROUND_INTRO_TICKS, ROUND_TIMER_TICKS, RoundPhase, ARCADE_START_Y,
} from '../../../data/arcade';
import { freeEntity } from '../../alloc';
import { isArcade, now } from '../../clock';
import type { Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import { P1_START_X, P2_START_X } from '../../match';
import {
  ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeT, ArcadeW, EntityFlag, EntityKind, MAX_ENTITIES, TEAM_COUNT,
  World as W, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { survivorsOf } from '../end';
import { startRestTimer } from '../rest';
import { teamMembers } from '../swap';
import { endLiveCombos } from './combo';
import { hitStop } from './hit';
import { endLiveSupers } from './super';
import { terrainRound } from './terrain-layout';
import { endWeather } from './weather';

const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const WON = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.roundsWon;
const EAST = 0;
const WEST = 4;

/** Rounds `team` has won (a draw round counts for both). 0 in Classic. */
export function roundsWon(s: SimState, team: number): number {
  return isArcade(s) ? (s.arcade[WON(team)] ?? 0) : 0;
}

/**
 * Sum of `floor(hp * HP_PM / maxHp)` over `team`'s roster (dead members count 0): the time-over score. `full` is the
 * score of the roster at full HP.
 */
export function teamHpPm(s: SimState, team: number): { readonly score: number; readonly full: number } {
  let score = 0;
  let full = 0;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const max = s.maxHp[id] ?? 0;
    if (s.kind[id] !== EntityKind.character || s.team[id] !== team || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
    if (max <= 0) continue;
    score += Math.floor(((s.hp[id] ?? 0) * HP_PM) / max);
    full += HP_PM;
  }
  return { score, full };
}

/**
 * Puts every character back to its match start (FUN-DESIGN 2.10): full HP and rest cap, base speed, start position and
 * facing, the roster's first member active and the rest benched with a fresh rest timer, no statuses, cooldowns,
 * stun, knockback, invulnerability, weather cooldowns or buffered presses. Live combos, supers and the weather end first
 * (with their events), then every other entity goes. Meters and round wins carry over.
 */
function resetRound(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  endLiveCombos(world, sink);
  endLiveSupers(world, sink);
  endWeather(s, sink);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (((s.flags[id] ?? 0) & EntityFlag.alive) !== 0 && s.kind[id] !== EntityKind.character) freeEntity(s, id);
  }
  s.status.fill(0);
  s.abil.fill(0);
  s.teams.fill(0);
  s.arcade.fill(0, 0, ARCADE_TEAM_BASE);
  const g = now(s);
  for (let team = 0; team < TEAM_COUNT; team++) {
    // The input buffer forgets the last round's presses (press ticks, used flags, direction presses); `prevCmd` stays,
    // so a button held across the reset is no new press.
    const b = ARCADE_TEAM_BASE + team * ARCADE_T;
    s.arcade.fill(0, b + ArcadeT.pressTick, b + ArcadeT.lastDir + 1);
    s.arcade[b + ArcadeT.pressUsed] = 0;
    s.arcade[b + ArcadeT.weatherCharge] = 0;
    s.arcade[b + ArcadeT.inPatch] = 0;
    const x = team === 0 ? P1_START_X : P2_START_X;
    teamMembers(world, team).forEach((id, k) => {
      s.flags[id] = EntityFlag.alive | (k === 0 ? 0 : EntityFlag.benched);
      s.x[id] = x;
      s.px[id] = x;
      s.y[id] = ARCADE_START_Y;
      s.py[id] = ARCADE_START_Y;
      s.vx[id] = 0;
      s.vy[id] = 0;
      s.w[id] = CHARACTER_WIDTH;
      s.h[id] = CHARACTER_HEIGHT;
      s.hp[id] = s.maxHp[id] ?? 0;
      s.restCap[id] = s.maxHp[id] ?? 0;
      s.speed[id] = s.baseSpeed[id] ?? 0;
      s.dir[id] = team === 0 ? EAST : WEST;
      s.expireTick[id] = 0;
      if (k !== 0) startRestTimer(s, id, g);
    });
  }
}

/** Starts round `round` (after the reset from round 2 on): `intro` for ROUND_INTRO_TICKS, a full timer, `roundStarted`. */
function startRound(world: SimWorld, sink: EventSink, round: number): void {
  const s = world.state;
  if (round > 1) resetRound(world, sink);
  const a = s.arcade;
  a[AW(ArcadeW.round)] = round;
  a[AW(ArcadeW.phase)] = RoundPhase.intro;
  a[AW(ArcadeW.phaseUntil)] = (s.world[W.tick] ?? 0) + 1 + ROUND_INTRO_TICKS;
  a[AW(ArcadeW.roundTimer)] = ROUND_TIMER_TICKS;
  a[AW(ArcadeW.roundWinner)] = 0;
  sink.emit(0, SimEventKind.roundStarted, { round });
  terrainRound(world, sink);
}

/** Scores the round for `winner` (both teams on a draw, -1), emits `roundEnded` and holds `roundEnd`. */
function endRound(world: SimWorld, sink: EventSink, winner: number): void {
  const s = world.state;
  const a = s.arcade;
  for (let t = 0; t < TEAM_COUNT; t++) if (winner < 0 || winner === t) a[WON(t)] = (a[WON(t)] ?? 0) + 1;
  a[AW(ArcadeW.phase)] = RoundPhase.roundEnd;
  a[AW(ArcadeW.phaseUntil)] = (s.world[W.tick] ?? 0) + 1 + ROUND_END_TICKS;
  sink.emit(0, SimEventKind.roundEnded, { winner, won0: a[WON(0)] ?? 0, won1: a[WON(1)] ?? 0 });
}

/**
 * A whole team is KO'd (both: a draw round). The KO hit-stop holds the game (the hit path's, or one set here when the KO
 * came from elsewhere), then KO_SLOWMO_TICKS of slow motion; the KO phase lasts KO_PHASE_TICKS after the hit-stop.
 * `ko.team` is the KO'd team (-1 for both); `perfect` when the winner's roster is at full HP.
 */
function knockOut(world: SimWorld, sink: EventSink, wiped0: boolean, wiped1: boolean): void {
  const s = world.state;
  const a = s.arcade;
  const tick = s.world[W.tick] ?? 0;
  const winner = wiped0 && wiped1 ? -1 : wiped0 ? 1 : 0;
  const koFreeze = a[AW(ArcadeW.freezeKind)] === HitStopCause.ko && (a[AW(ArcadeW.freezeUntil)] ?? 0) > tick;
  if (!koFreeze) hitStop(world, sink, 0, KO_HIT_STOP_TICKS, HitStopCause.ko);
  const thaw = Math.max(a[AW(ArcadeW.freezeUntil)] ?? 0, tick + 1);
  a[AW(ArcadeW.slowMoUntil)] = thaw + KO_SLOWMO_TICKS;
  a[AW(ArcadeW.phase)] = RoundPhase.ko;
  a[AW(ArcadeW.phaseUntil)] = thaw + KO_PHASE_TICKS;
  a[AW(ArcadeW.roundWinner)] = winner;
  const hp = winner >= 0 ? teamHpPm(s, winner) : undefined;
  const perfect = hp !== undefined && hp.score === hp.full;
  sink.emit(0, SimEventKind.ko, { team: winner < 0 ? -1 : 1 - winner, perfect: perfect ? 1 : 0 });
}

/** Time over: the higher roster HP per mille wins, equal is a draw (FUN-DESIGN 2.10). */
function timeOver(world: SimWorld, sink: EventSink): void {
  const hp0 = teamHpPm(world.state, 0).score;
  const hp1 = teamHpPm(world.state, 1).score;
  sink.emit(0, SimEventKind.timeOver);
  endRound(world, sink, hp0 > hp1 ? 0 : hp1 > hp0 ? 1 : -1);
}

/**
 * The `cleanup` slot, `arcadeRound` (FUN-DESIGN 2.10): runs the round phases on every tick whose systems run (not while
 * a freeze or a KO slow-motion hold stops the game clock). Round 1 starts on the first tick. `intro` -> `fight` (`fight`
 * event) -> `ko` on a wipe, or `roundEnded` straight away on time over (the timer counts fight game ticks) -> `roundEnd`
 * -> the next round, or `over` once a team has ROUNDS_TO_WIN (then `endSystem` emits `matchEnded` in the same tick).
 * Phase deadlines are `W.tick` values: a phase ends on the tick before its deadline. Returns at once in Classic.
 */
export function arcadeRoundSystem(world: SimWorld, _cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  if (!isArcade(s)) return;
  const a = s.arcade;
  const round = a[AW(ArcadeW.round)] ?? 0;
  if (round === 0) {
    startRound(world, sink, 1);
    return;
  }
  const due = (s.world[W.tick] ?? 0) + 1 >= (a[AW(ArcadeW.phaseUntil)] ?? 0);
  switch (a[AW(ArcadeW.phase)]) {
    case RoundPhase.intro:
      if (!due) return;
      a[AW(ArcadeW.phase)] = RoundPhase.fight;
      sink.emit(0, SimEventKind.fight);
      return;
    case RoundPhase.fight: {
      const wiped0 = survivorsOf(s, 0) === 0;
      const wiped1 = survivorsOf(s, 1) === 0;
      if (wiped0 || wiped1) {
        knockOut(world, sink, wiped0, wiped1);
        return;
      }
      const left = (a[AW(ArcadeW.roundTimer)] ?? 0) - 1;
      a[AW(ArcadeW.roundTimer)] = left;
      if (left <= 0) timeOver(world, sink);
      return;
    }
    case RoundPhase.ko:
      if (due) endRound(world, sink, a[AW(ArcadeW.roundWinner)] ?? -1);
      return;
    case RoundPhase.roundEnd:
      if (!due) return;
      if ((a[WON(0)] ?? 0) >= ROUNDS_TO_WIN || (a[WON(1)] ?? 0) >= ROUNDS_TO_WIN) a[AW(ArcadeW.phase)] = RoundPhase.over;
      else startRound(world, sink, round + 1);
      return;
    default:
  }
}
