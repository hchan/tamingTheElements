import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from '../../data/chapters';
import { CHARACTERS } from '../../data/characters';
import { aabbOverlap } from '../../math/aabb';
import { DIR8_X, DIR8_Y } from '../../math/dir8';
import { CAPTURE_DAMAGE } from '../../rules/damage';
import { capturable } from '../../rules/progression';
import { allocEntity, freeEntity } from '../alloc';
import { Cmd, hasCmd, type Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import { cooldownIdx, countIdx, EntityFlag, EntityKind, MAX_ENTITIES, World as W } from '../state';
import type { SimWorld } from '../world';
import { controlledId } from './movement';
import { ABILITY_DEFS, hitHolder } from './projectile';
import { CAPTURE_SLOT, releaseCount } from './ability-info';
import { now } from '../clock';
import { canAct } from './arcade/stun';

/** Bit in world[World.flags]: Capture is granted (set by createMatch from chapter 2 on). Bits 0..15 are sim flags. */
export const CAPTURE_GRANTED_BIT = 1 << 16;

const CAPTURE_IDX = ABILITY_DEFS.findIndex((d) => d.id === 'capture');
const CAPTURE_DEF = ABILITY_DEFS[CAPTURE_IDX];
const BOSS_IDX = CHARACTERS.findIndex((c) => c.id === 'eternal-void');

function canCapture(world: SimWorld, team: number, charId: number, target: number, tick: number): boolean {
  const s = world.state;
  if (CAPTURE_DEF === undefined || team !== 0 || ((s.world[W.flags] ?? 0) & CAPTURE_GRANTED_BIT) === 0) return false;
  if (!canAct(world, charId) || target < 0) return false;
  if (!capturable(s.hp[target] ?? 0, s.maxHp[target] ?? 0)) return false;
  if (CAPTURE_DEF.maxActive <= (s.abil[countIdx(charId, CAPTURE_SLOT)] ?? 0)) return false;
  return tick >= (s.abil[cooldownIdx(charId, CAPTURE_SLOT)] ?? 0);
}

function fire(world: SimWorld, team: number, charId: number, tick: number): void {
  const s = world.state;
  const def = CAPTURE_DEF;
  if (def === undefined || !canCapture(world, team, charId, controlledId(world, 1 - team), tick)) return;
  const id = allocEntity(s);
  if (id < 0) return;
  const w = (def.w ?? 0) * CHARACTER_WIDTH;
  const h = (def.h ?? 0) * CHARACTER_HEIGHT;
  const dir = s.dir[charId] ?? 0;
  const speed = def.speed ?? 0;
  const x = (s.x[charId] ?? 0) + ((s.w[charId] ?? 0) - w) / 2;
  const y = (s.y[charId] ?? 0) + ((s.h[charId] ?? 0) - h) / 2;
  s.kind[id] = EntityKind.effect;
  s.defId[id] = CAPTURE_IDX;
  s.team[id] = team;
  s.owner[id] = charId;
  s.dir[id] = dir;
  s.x[id] = x;
  s.px[id] = x;
  s.y[id] = y;
  s.py[id] = y;
  s.w[id] = w;
  s.h[id] = h;
  s.speed[id] = speed;
  s.vx[id] = (DIR8_X[dir] ?? 0) * speed;
  s.vy[id] = (DIR8_Y[dir] ?? 0) * speed;
  s.hp[id] = CAPTURE_DAMAGE;
  s.flags[id] = EntityFlag.alive;
  const ci = countIdx(charId, CAPTURE_SLOT);
  s.abil[ci] = (s.abil[ci] ?? 0) + 1;
  s.abil[cooldownIdx(charId, CAPTURE_SLOT)] = tick + def.cooldownTicks + 1;
}

/** Frees the bullet; `holder` loses one active Capture (the caster when it leaves, the current character on a hit). */
function despawn(world: SimWorld, id: number, holder: number): void {
  const s = world.state;
  releaseCount(s, holder, CAPTURE_IDX);
  freeEntity(s, id);
}

/**
 * Capture: fired from Cmd.capture only against a capturable (<=25% health) enemy, granted from
 * chapter 2. The bullet flies like a range projectile; on hit the target is flagged captured and
 * killed (the death system emits `died`). Legacy runs its own onHit before the default bullet callback:
 * - the last boss: the evil laugh (`captureFailed`, once per bullet here; legacy replays it every overlapping frame),
 *   no capture, no damage, and the bullet keeps flying;
 * - a faded (translucent) target: KNOWN-BUG:capture-ignores-fade, the captured flag is set (so the target joins the
 *   garrison if it is defeated later) but the default callback skips translucent targets, so there is no damage, no
 *   event, and the bullet keeps flying.
 */
export function captureSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  const a = world.arena;
  const tick = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] !== EntityKind.effect || s.defId[id] !== CAPTURE_IDX || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
    s.px[id] = s.x[id] ?? 0;
    s.py[id] = s.y[id] ?? 0;
    s.x[id] = (s.x[id] ?? 0) + (s.vx[id] ?? 0);
    s.y[id] = (s.y[id] ?? 0) + (s.vy[id] ?? 0);
    const x = s.x[id] ?? 0;
    const y = s.y[id] ?? 0;
    if (x > a.x + a.w || x < a.x || y > a.y + a.h || y < a.y) {
      despawn(world, id, s.owner[id] ?? 0);
      continue;
    }
    const target = controlledId(world, 1 - (s.team[id] ?? 0));
    if (target < 0) continue;
    const box = { x, y, w: s.w[id] ?? 0, h: s.h[id] ?? 0 };
    const tbox = { x: s.x[target] ?? 0, y: s.y[target] ?? 0, w: s.w[target] ?? 0, h: s.h[target] ?? 0 };
    if (!aabbOverlap(box, tbox)) continue;
    const attacker = s.owner[id] ?? 0;
    if (BOSS_IDX >= 0 && s.defId[target] === BOSS_IDX) {
      if ((s.hitMask[id] ?? 0) === 0) sink.emit(id, SimEventKind.captureFailed, { target, attacker });
      s.hitMask[id] = 1;
      continue;
    }
    s.flags[target] = (s.flags[target] ?? 0) | EntityFlag.captured;
    if (((s.flags[target] ?? 0) & EntityFlag.translucent) !== 0) continue;
    s.hp[target] = 0;
    sink.emit(id, SimEventKind.captured, { target, attacker });
    despawn(world, id, hitHolder(world, id));
  }
  const charId = controlledId(world, 0);
  if (charId >= 0 && hasCmd(cmds[0], Cmd.capture)) fire(world, 0, charId, tick);
}
