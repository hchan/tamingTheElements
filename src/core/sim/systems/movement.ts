import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../math/dir8';
import { cmdAxisX, cmdAxisY, type Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import { EntityFlag, EntityKind, MAX_ENTITIES, TEAM_COUNT } from '../state';
import type { SimWorld } from '../world';

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

export function movementSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    if (id < 0) continue;
    s.px[id] = s.x[id] ?? 0;
    s.py[id] = s.y[id] ?? 0;
    if (((s.flags[id] ?? 0) & EntityFlag.frozen) !== 0) continue;
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
      // bounds-y-typo: legacy reads `this.Y` (undefined), so x is restored and y never is.
      s.x[id] = s.px[id] ?? 0;
      sink.emit(id, SimEventKind.blocked, { x: s.x[id] ?? 0, y: s.y[id] ?? 0 });
    } else {
      sink.emit(id, SimEventKind.moved, { x: s.x[id] ?? 0, y: s.y[id] ?? 0 });
    }
  }
}
