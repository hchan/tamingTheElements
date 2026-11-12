import { ChargeEnd } from '../../data/arcade';
import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../math/dir8';
import { cmdAxisX, cmdAxisY, type Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import { EntityFlag, EntityKind, MAX_ENTITIES, TEAM_COUNT } from '../state';
import type { SimWorld } from '../world';
import { isArcade } from '../clock';
import { stepKnockback } from './arcade/knockback';
import { endCharge } from './arcade/charge-move';
import { canAct, chargeTick, dashTick, inTrapRecovery, trapSlowPm } from './arcade/stun';
import { dirToward, isDiagonal8, setAim } from './arcade/aim';
import { isRooted } from './arcade/snag';
import { chargeWeather } from './arcade/meter';
import { rockStop, terrainSpeedPm } from './arcade/terrain';

/** Dir8 indices for the four-way facing legacy uses: e, n, w, s. */
const EAST = 0;
const NORTH = 2;
const WEST = 4;
const SOUTH = 6;

/** Legacy bindNewDirection: x wins over y; no input keeps the old facing. */
export function facingFor(ax: number, ay: number, current: number): number {
  if (ax > 0) return EAST;
  if (ax < 0) return WEST;
  if (ay > 0) return SOUTH;
  if (ay < 0) return NORTH;
  return current;
}

/** The character a team's command drives: lowest id that is alive, not benched, kind character. */
export function controlledId(world: SimWorld, team: number): number {
  const s = world.state;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    if ((f & EntityFlag.alive) === 0 || (f & EntityFlag.benched) !== 0) continue;
    if (s.kind[id] === EntityKind.character && s.team[id] === team) return id;
  }
  return -1;
}

function outOfArena(world: SimWorld, id: number): boolean {
  const s = world.state;
  const a = world.arena;
  const x = s.x[id] ?? 0;
  const y = s.y[id] ?? 0;
  return x < a.x || y < a.y || x + (s.w[id] ?? 0) > a.x + a.w || y + (s.h[id] ?? 0) > a.y + a.h;
}

/**
 * Classic wall handling. The player (team 0, legacy Fourway + `stopOnSolids`) undoes the whole step. The enemy (team 1,
 * legacy AI `resetIfOutOfBounds`) restores x; if still blocked it keeps the new x and restores y; if still blocked it
 * restores both. KNOWN-BUG:bounds-y-typo is harmless: the misspelt `this.Y` goes into a variable nobody reads.
 */
function restoreAtWall(world: SimWorld, id: number, team: number): void {
  const s = world.state;
  const nx = s.x[id] ?? 0;
  s.x[id] = s.px[id] ?? 0;
  if (team === 0) {
    s.y[id] = s.py[id] ?? 0;
    return;
  }
  if (!outOfArena(world, id)) return;
  s.x[id] = nx;
  s.y[id] = s.py[id] ?? 0;
  if (outOfArena(world, id)) s.x[id] = s.px[id] ?? 0;
}

/**
 * Arcade movement (FUN-DESIGN 2.3): knockback first (it moves a stunned victim too), then a dash step (FUN-DESIGN 2.7:
 * `vx`/`vy` as the dash set them, clamped to the arena; no `moved` event, like knockback) or the input step when the
 * character can act. Walls hold both axes for both teams, and rocks (FUN-DESIGN 2.15, `rockStop`) hold every step the same
 * way for the other elements. An air patch speeds the input step up (`terrainSpeedPm`). The held input also sets the 8-way
 * aim (arcade/aim.ts).
 */
function arcadeMove(world: SimWorld, id: number, team: number, cmd: Command, sink: EventSink): void {
  const s = world.state;
  stepKnockback(world, id);
  rockStop(s, id, s.px[id] ?? 0, s.py[id] ?? 0);
  const x0 = s.x[id] ?? 0;
  const y0 = s.y[id] ?? 0;
  const charging = chargeTick(s, id) > 0;
  if (charging || dashTick(s, id) > 0) {
    const a = world.arena;
    const tx = (s.x[id] ?? 0) + (s.vx[id] ?? 0);
    const ty = (s.y[id] ?? 0) + (s.vy[id] ?? 0);
    s.x[id] = Math.min(Math.max(tx, a.x), a.x + a.w - (s.w[id] ?? 0));
    s.y[id] = Math.min(Math.max(ty, a.y), a.y + a.h - (s.h[id] ?? 0));
    const blocked = rockStop(s, id, x0, y0) || s.x[id] !== tx || s.y[id] !== ty;
    if (charging && blocked) endCharge(s, sink, id, ChargeEnd.blocked);
    return;
  }
  if (!canAct(world, id)) return;
  const ax = cmdAxisX(cmd);
  const ay = cmdAxisY(cmd);
  const d = dir8FromSigns(ax, ay);
  // Auto-face (FUN-DESIGN 2.22): the aim, and the reel facing that follows it, is the foe's direction unless a diagonal is
  // held (the player's override); with no foe the held input decides, as before.
  const foe = controlledId(world, 1 - team);
  if (foe >= 0 && !isDiagonal8(d)) {
    const toward = dirToward(s, id, foe);
    setAim(s, id, toward);
    s.dir[id] = facingFor(DIR8_X[toward] ?? 0, DIR8_Y[toward] ?? 0, s.dir[id] ?? EAST);
  } else {
    s.dir[id] = facingFor(ax, ay, s.dir[id] ?? EAST);
    if (d >= 0) setAim(s, id, d);
  }
  if (d < 0) return;
  if (isRooted(s, id) || inTrapRecovery(s, id)) return; // a Snag root or a trap cast: turn and aim, no step (FUN-DESIGN 2.20)
  const pm = (terrainSpeedPm(s, id) * trapSlowPm(s, id)) / 1000; // exact when no Puddle slows `id`
  const speed = pm === 1000 ? (s.speed[id] ?? 0) : ((s.speed[id] ?? 0) * pm) / 1000;
  s.vx[id] = (DIR8_X[d] ?? 0) * speed;
  s.vy[id] = (DIR8_Y[d] ?? 0) * speed;
  s.x[id] = x0 + (s.vx[id] ?? 0);
  s.y[id] = y0 + (s.vy[id] ?? 0);
  const walled = outOfArena(world, id);
  if (walled) {
    s.x[id] = x0;
    s.y[id] = y0;
  }
  const blocked = walled || rockStop(s, id, x0, y0);
  if (!blocked) chargeWeather(s, id, team, false);
  sink.emit(id, blocked ? SimEventKind.blocked : SimEventKind.moved, { x: s.x[id] ?? 0, y: s.y[id] ?? 0 });
}

export function movementSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  const arcade = isArcade(s);
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    if (id < 0) continue;
    s.px[id] = s.x[id] ?? 0;
    s.py[id] = s.y[id] ?? 0;
    if (arcade) {
      arcadeMove(world, id, team, cmds[team] ?? 0, sink);
      continue;
    }
    if (!canAct(world, id)) continue;
    const cmd = cmds[team] ?? 0;
    const ax = cmdAxisX(cmd);
    const ay = cmdAxisY(cmd);
    s.dir[id] = facingFor(ax, ay, s.dir[id] ?? EAST);
    const d = dir8FromSigns(ax, ay);
    if (d < 0) continue;
    const speed = s.speed[id] ?? 0;
    s.vx[id] = (DIR8_X[d] ?? 0) * speed;
    s.vy[id] = (DIR8_Y[d] ?? 0) * speed;
    s.x[id] = (s.px[id] ?? 0) + (s.vx[id] ?? 0);
    s.y[id] = (s.py[id] ?? 0) + (s.vy[id] ?? 0);
    if (outOfArena(world, id)) {
      restoreAtWall(world, id, team);
      sink.emit(id, SimEventKind.blocked, { x: s.x[id] ?? 0, y: s.y[id] ?? 0 });
    } else {
      sink.emit(id, SimEventKind.moved, { x: s.x[id] ?? 0, y: s.y[id] ?? 0 });
    }
  }
}
