import {
  HitStopCause, SUPER_ACTIVE_TICKS, SUPER_BAND_PX, SUPER_COST, SUPER_FREEZE_TICKS, SUPER_HIT_DAMAGE, SUPER_HIT_EVERY,
  SUPER_ELEMENTAL_BURST, SUPER_INVULN_AFTER_TICKS,
} from '../../../data/arcade';
import { aabbOverlap, type Aabb } from '../../../math/aabb';
import { DIR8_X, DIR8_Y } from '../../../math/dir8';
import { allocEntity, freeEntity } from '../../alloc';
import { isArcade, now } from '../../clock';
import { Cmd, hasCmd, type Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, EntityKind, TEAM_COUNT, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { applyArcadeHit, hitStop, SUPER_DEF } from './hit';
import { meterOf, spendMeter } from './meter';
import { canAct, isInvulnerable } from './stun';

const stateIndex = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.superState;
const box = (s: SimState, id: number): Aabb => ({ x: s.x[id] ?? 0, y: s.y[id] ?? 0, w: s.w[id] ?? 0, h: s.h[id] ?? 0 });

/**
 * Places super entity `fx` as the Elemental Burst band: SUPER_BAND_PX across, centred on the caster, from its centre
 * to the arena wall on its facing side (horizontal unless the facing has no x part).
 */
function placeBand(world: SimWorld, fx: number, caster: number, dir: number): void {
  const s = world.state;
  const a = world.arena;
  const cx = (s.x[caster] ?? 0) + (s.w[caster] ?? 0) / 2;
  const cy = (s.y[caster] ?? 0) + (s.h[caster] ?? 0) / 2;
  const dx = DIR8_X[dir] ?? 1;
  if (dx !== 0) {
    s.x[fx] = dx > 0 ? cx : a.x;
    s.w[fx] = dx > 0 ? a.x + a.w - cx : cx - a.x;
    s.y[fx] = cy - SUPER_BAND_PX / 2;
    s.h[fx] = SUPER_BAND_PX;
  } else {
    const down = (DIR8_Y[dir] ?? 1) > 0;
    s.y[fx] = down ? cy : a.y;
    s.h[fx] = down ? a.y + a.h - cy : cy - a.y;
    s.x[fx] = cx - SUPER_BAND_PX / 2;
    s.w[fx] = SUPER_BAND_PX;
  }
}

/** Frees `team`'s super entity and emits `superEnded {caster}`. */
function endSuper(world: SimWorld, sink: EventSink, team: number, fx: number): void {
  const s = world.state;
  const caster = s.owner[fx] ?? 0;
  freeEntity(s, fx);
  s.arcade[stateIndex(team)] = 0;
  sink.emit(caster, SimEventKind.superEnded, { caster });
}

/**
 * Runs `team`'s live super for one game tick: one hit on the opposing controlled character every SUPER_HIT_EVERY
 * ticks while it overlaps the band (not translucent, not invulnerable). The super ends after SUPER_ACTIVE_TICKS, when
 * its caster leaves play (KO or bench), or when a hit KOs the victim.
 */
function runSuper(world: SimWorld, sink: EventSink, team: number): void {
  const s = world.state;
  const fx = (s.arcade[stateIndex(team)] ?? 0) - 1;
  if (fx < 0) return;
  const caster = s.owner[fx] ?? 0;
  const g = now(s);
  const inPlay = ((s.flags[caster] ?? 0) & (EntityFlag.alive | EntityFlag.dead | EntityFlag.benched)) === EntityFlag.alive;
  if (!inPlay || g >= (s.expireTick[fx] ?? 0)) {
    endSuper(world, sink, team, fx);
    return;
  }
  const t = g - (s.spawnTick[fx] ?? 0);
  if (t < 0 || t % SUPER_HIT_EVERY !== 0) return;
  const victim = controlledId(world, 1 - team);
  if (victim < 0 || ((s.flags[victim] ?? 0) & EntityFlag.translucent) !== 0 || isInvulnerable(s, victim)) return;
  if (!aabbOverlap(box(s, fx), box(s, victim))) return;
  applyArcadeHit(world, sink, fx, caster, victim, SUPER_HIT_DAMAGE, SUPER_DEF, s.dir[fx] ?? 0);
  if ((s.hp[victim] ?? 0) <= 0) endSuper(world, sink, team, fx);
}

/**
 * Starts `team`'s super when its controlled character can act, has no super running and the team has SUPER_COST meter:
 * spends it, spawns the band as an `effect` entity (def SUPER_DEF, active from the first game tick after the freeze),
 * makes the caster invulnerable through the freeze and SUPER_INVULN_AFTER_TICKS past it, emits `superStarted` and
 * freezes the game SUPER_FREEZE_TICKS (`hitStop` cause super).
 */
function startSuper(world: SimWorld, sink: EventSink, team: number): void {
  const s = world.state;
  const caster = controlledId(world, team);
  if (caster < 0 || (s.arcade[stateIndex(team)] ?? 0) !== 0 || meterOf(s, team) < SUPER_COST || !canAct(world, caster)) return;
  const fx = allocEntity(s);
  if (fx < 0) return;
  spendMeter(s, sink, caster, team, SUPER_COST);
  const g = now(s);
  const dir = s.dir[caster] ?? 0;
  placeBand(world, fx, caster, dir);
  s.kind[fx] = EntityKind.effect;
  s.defId[fx] = SUPER_DEF;
  s.team[fx] = team;
  s.owner[fx] = caster;
  s.dir[fx] = dir;
  // The game clock advances once after this tick, then stands still through the freeze.
  s.spawnTick[fx] = g + 1;
  s.expireTick[fx] = g + 1 + SUPER_ACTIVE_TICKS;
  s.arcade[stateIndex(team)] = fx + 1;
  const inv = caster * ARCADE_E + ArcadeE.invulnUntil;
  s.arcade[inv] = Math.max(s.arcade[inv] ?? 0, g + 1 + SUPER_INVULN_AFTER_TICKS);
  sink.emit(caster, SimEventKind.superStarted, { caster, superId: SUPER_ELEMENTAL_BURST });
  hitStop(world, sink, caster, SUPER_FREEZE_TICKS, HitStopCause.super);
}

/**
 * The `health` slot (FUN-DESIGN 2.1), `arcadeSuper`: live supers run first, then `Cmd.super` starts new ones (team 0,
 * then team 1). Returns at once in Classic, where `inputMaskFor` also masks the super bit.
 */
export function arcadeSuperSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  if (!isArcade(world.state)) return;
  for (let team = 0; team < TEAM_COUNT; team++) runSuper(world, sink, team);
  for (let team = 0; team < TEAM_COUNT; team++) {
    if (hasCmd(cmds[team] ?? 0, Cmd.super)) startSuper(world, sink, team);
  }
}
