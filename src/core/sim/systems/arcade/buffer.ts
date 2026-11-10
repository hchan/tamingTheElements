import { BUFFER_TICKS, DOUBLE_TAP_TICKS, SUPER_CHORD_TICKS, SUPER_COST } from '../../../data/arcade';
import { isArcade, now } from '../../clock';
import { Cmd, inputMaskFor, type Command } from '../../commands';
import type { EventSink } from '../../events';
import { ARCADE_T, ARCADE_TEAM_BASE, ArcadeT, TEAM_COUNT, type SimState } from '../../state';
import { meterOf, meterOnCast } from './meter';

/** Presses in `ArcadeT.pressTick` order (FUN-DESIGN 2.12); primary and secondary are also the ability slots 0 and 1. */
export const Press = { primary: 0, secondary: 1, dash: 2, guard: 3, super: 4 } as const;
/** Command bit of each press: dash and guard are the Arcade bits 11 and 12. */
export const PRESS_BITS = [Cmd.primary, Cmd.secondary, Cmd.dash, Cmd.guard, Cmd.super] as const;
/** Presses `bufferedCmd` replays; the dash press is read by arcade/dash.ts, the guard press by arcade/guard.ts. */
const REPLAYED = [Press.primary, Press.secondary, Press.super] as const;
/** `pressUsed` flag: the pending super press came from a chord, so held primary and secondary are masked meanwhile. */
export const CHORD_FLAG = 1 << 5;
const ATTACK = Cmd.primary | Cmd.secondary;
/** Bits an Arcade match accepts: `prevCmd` keeps only these, so reserved bits never reach the hash. */
const ARCADE_MASK = inputMaskFor({ rulesetArcade: true });

const teamBase = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T;

/** Game ticks since `team`'s last rising edge of press `k` (`now` included), or -1 when there is none. */
export function pressAge(s: SimState, team: number, k: number): number {
  const at = s.arcade[teamBase(team) + ArcadeT.pressTick + k] ?? 0;
  return at === 0 ? -1 : now(s) - (at - 1);
}

const DIRS = Cmd.up | Cmd.down | Cmd.left | Cmd.right;

/** Press `k` of `team` is pending: pressed BUFFER_TICKS or fewer game ticks ago and not used yet. */
export function pending(s: SimState, team: number, k: number): boolean {
  const age = pressAge(s, team, k);
  return age >= 0 && age <= BUFFER_TICKS && ((s.arcade[teamBase(team) + ArcadeT.pressUsed] ?? 0) & (1 << k)) === 0;
}

const withinChord = (age: number): boolean => age >= 0 && age <= SUPER_CHORD_TICKS;

/**
 * Records `team`'s rising edges of `cmd` (from `prevCmd`) as press ticks, then turns a primary and secondary pair within
 * SUPER_CHORD_TICKS into a super press when the team has SUPER_COST meter and no super running: the pair's press ticks
 * are cleared (an edge feeds one chord) and CHORD_FLAG masks the held buttons while that super press is pending.
 * A rising direction edge (the lowest bit when several rise) that repeats `lastDir` within DOUBLE_TAP_TICKS is a dash
 * press (FUN-DESIGN 2.7) and clears `lastDirPress`, so a third tap starts a new pair.
 */
function recordTeam(s: SimState, team: number, cmd: Command, g: number): void {
  const a = s.arcade;
  const b = teamBase(team);
  const at = b + ArcadeT.pressTick;
  const rise = cmd & ~(a[b + ArcadeT.prevCmd] ?? 0);
  a[b + ArcadeT.prevCmd] = cmd;
  if (rise === 0) return;
  let used = a[b + ArcadeT.pressUsed] ?? 0;
  PRESS_BITS.forEach((bit, k) => {
    if ((rise & bit) === 0) return;
    a[at + k] = g + 1;
    used &= ~(1 << k);
  });
  if ((rise & Cmd.super) !== 0) used &= ~CHORD_FLAG;
  const dir = rise & DIRS & -(rise & DIRS);
  if (dir !== 0) {
    const last = a[b + ArcadeT.lastDirPress] ?? 0;
    const tap = last !== 0 && a[b + ArcadeT.lastDir] === dir && g + 1 - last <= DOUBLE_TAP_TICKS;
    a[b + ArcadeT.lastDir] = dir;
    a[b + ArcadeT.lastDirPress] = tap ? 0 : g + 1;
    if (tap) {
      a[at + Press.dash] = g + 1;
      used &= ~(1 << Press.dash);
    }
  }
  const chord =
    (rise & ATTACK) !== 0 &&
    withinChord(pressAge(s, team, Press.primary)) &&
    withinChord(pressAge(s, team, Press.secondary)) &&
    meterOf(s, team) >= SUPER_COST &&
    (a[b + ArcadeT.superState] ?? 0) === 0;
  if (chord) {
    a[at + Press.primary] = 0;
    a[at + Press.secondary] = 0;
    a[at + Press.super] = g + 1;
    used = (used & ~(1 << Press.super)) | CHORD_FLAG;
  }
  a[b + ArcadeT.pressUsed] = used;
}

/**
 * The `input` slot's edge pass (FUN-DESIGN 2.12): runs every Arcade tick, frozen ones included, so a press made during
 * hit-stop is kept (the game clock stands still, so the freeze does not age it). No-op in Classic.
 */
export function recordPresses(s: SimState, cmds: readonly [Command, Command]): void {
  if (!isArcade(s)) return;
  const g = now(s);
  for (let team = 0; team < TEAM_COUNT; team++) recordTeam(s, team, (cmds[team] ?? 0) & ARCADE_MASK, g);
}

/**
 * `team`'s command as the cast systems see it: `raw` plus every pending press of primary, secondary and super, minus
 * held primary and secondary while a chord's super press is pending. Returns `raw` in Classic. Pure: reading it never
 * uses a press; a cast does (`onArcadeCast`, and the super start).
 */
export function bufferedCmd(s: SimState, team: number, raw: Command): Command {
  if (!isArcade(s)) return raw;
  let cmd = raw;
  if (((s.arcade[teamBase(team) + ArcadeT.pressUsed] ?? 0) & CHORD_FLAG) !== 0 && pending(s, team, Press.super)) {
    cmd &= ~ATTACK;
  }
  for (const k of REPLAYED) if (pending(s, team, k)) cmd |= PRESS_BITS[k];
  return cmd;
}

/** Marks `team`'s press `k` as used, so the buffer never replays it again. */
export function usePress(s: SimState, team: number, k: number): void {
  const i = teamBase(team) + ArcadeT.pressUsed;
  s.arcade[i] = (s.arcade[i] ?? 0) | (1 << k);
}

/**
 * A cast from ability slot `slot` (0 primary, 1 secondary) by `caster` of `team`: +METER_CAST and the slot's press is
 * used. Returns at once in Classic.
 */
export function onArcadeCast(s: SimState, sink: EventSink, caster: number, team: number, slot: number): void {
  if (!isArcade(s)) return;
  meterOnCast(s, sink, caster, team);
  usePress(s, team, slot);
}
