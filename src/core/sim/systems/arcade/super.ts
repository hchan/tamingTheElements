import {
  HIT_STUN_TICKS, HitStopCause, KNOCKBACK_Q4, SUPER_COST, SUPER_FREEZE_TICKS, SUPER_INVULN_AFTER_TICKS,
} from '../../../data/arcade';
import {
  SUPER_BURST, SUPER_ICICLE_EVERY, SUPER_ICICLE_FAN, SUPER_QUAKE_RING_PX, SUPER_SPECS, SUPER_TIDE_SLOW_TICKS,
  SUPER_TIDE_SPEED_PX, SuperShape, superOf, type SuperSpec,
} from '../../../data/arcade-supers';
import { CHARACTERS } from '../../../data/characters';
import { aabbOverlap, type Aabb } from '../../../math/aabb';
import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../../math/dir8';
import { allocEntity, freeEntity } from '../../alloc';
import { isArcade, now } from '../../clock';
import { Cmd, hasCmd, type Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, EntityKind, TEAM_COUNT, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { abilitySlot } from '../ability-info';
import { controlledId } from '../movement';
import { ABILITY_DEFS, SUPER_BULLET, spawnBulletId } from '../projectile';
import { applyTimedStatus, StatusId } from '../status';
import { bufferedCmd, Press, usePress } from './buffer';
import { applyArcadeHit, hitStop, SUPER_DEF } from './hit';
import { setKnockback } from './knockback';
import { meterOf, spendMeter } from './meter';
import { applyStun, canAct, isInvulnerable } from './stun';

const stateIndex = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.superState;
const box = (s: SimState, id: number): Aabb => ({ x: s.x[id] ?? 0, y: s.y[id] ?? 0, w: s.w[id] ?? 0, h: s.h[id] ?? 0 });
const ICICLES = ABILITY_DEFS.findIndex((d) => d.id === 'icicles');
const LAST_RING = SUPER_QUAKE_RING_PX.length - 1;

/** The super `caster`'s race casts. */
export function superSpecOf(s: SimState, caster: number): SuperSpec {
  return superOf(CHARACTERS[s.defId[caster] ?? 0]?.id ?? '');
}

/**
 * Places super entity `fx` as the Inferno Beam band: `width` px across, centred on the caster, from its centre to the
 * arena wall on its facing side (horizontal unless the facing has no x part).
 */
function placeBand(world: SimWorld, fx: number, caster: number, dir: number, width: number): void {
  const s = world.state;
  const a = world.arena;
  const cx = (s.x[caster] ?? 0) + (s.w[caster] ?? 0) / 2;
  const cy = (s.y[caster] ?? 0) + (s.h[caster] ?? 0) / 2;
  const dx = DIR8_X[dir] ?? 1;
  if (dx !== 0) {
    s.x[fx] = dx > 0 ? cx : a.x;
    s.w[fx] = dx > 0 ? a.x + a.w - cx : cx - a.x;
    s.y[fx] = cy - width / 2;
    s.h[fx] = width;
  } else {
    const down = (DIR8_Y[dir] ?? 1) > 0;
    s.y[fx] = down ? cy : a.y;
    s.h[fx] = down ? a.y + a.h - cy : cy - a.y;
    s.x[fx] = cx - width / 2;
    s.w[fx] = width;
  }
}

/** Places `fx` as a `side` px square centred on the caster (the Vortex box, a Quake ring). */
function placeSquare(s: SimState, fx: number, caster: number, side: number): void {
  s.x[fx] = (s.x[caster] ?? 0) + ((s.w[caster] ?? 0) - side) / 2;
  s.y[fx] = (s.y[caster] ?? 0) + ((s.h[caster] ?? 0) - side) / 2;
  s.w[fx] = side;
  s.h[fx] = side;
}

/** Places the Tidal Wave `width` px thick at the caster's edge on its facing side, across the whole arena. */
function placeWall(world: SimWorld, fx: number, caster: number, dir: number, width: number): void {
  const s = world.state;
  const a = world.arena;
  if ((DIR8_X[dir] ?? 1) !== 0) {
    s.x[fx] = (DIR8_X[dir] ?? 1) > 0 ? (s.x[caster] ?? 0) + (s.w[caster] ?? 0) : (s.x[caster] ?? 0) - width;
    s.w[fx] = width;
    s.y[fx] = a.y;
    s.h[fx] = a.h;
  } else {
    s.y[fx] = (DIR8_Y[dir] ?? 1) > 0 ? (s.y[caster] ?? 0) + (s.h[caster] ?? 0) : (s.y[caster] ?? 0) - width;
    s.h[fx] = width;
    s.x[fx] = a.x;
    s.w[fx] = a.w;
  }
}

/** Frees `team`'s super entity and emits `superEnded {caster}`; `grant` gives the race's after-effects. */
function endSuper(world: SimWorld, sink: EventSink, team: number, fx: number, grant: boolean): void {
  const s = world.state;
  const caster = s.owner[fx] ?? 0;
  const spec = SUPER_SPECS[s.hitMask[fx] ?? 0] ?? SUPER_BURST;
  freeEntity(s, fx);
  s.arcade[stateIndex(team)] = 0;
  if (grant) {
    if (spec.speedTicks > 0) applyTimedStatus(world, caster, StatusId.superSpeed, caster, spec.speedTicks, spec.speedBonus);
    if (spec.translucentTicks > 0) applyTimedStatus(world, caster, StatusId.translucent, caster, spec.translucentTicks, 0);
    if (spec.armourTicks > 0) applyTimedStatus(world, caster, StatusId.superArmour, caster, spec.armourTicks, 0);
  }
  sink.emit(caster, SimEventKind.superEnded, { caster });
}

/** One super hit; the caster takes `drainPm` of the health removed. */
function strike(world: SimWorld, sink: EventSink, fx: number, victim: number, spec: SuperSpec): void {
  const s = world.state;
  const caster = s.owner[fx] ?? 0;
  const dealt = applyArcadeHit(world, sink, fx, caster, victim, spec.damage, SUPER_DEF, s.dir[fx] ?? 0);
  if (spec.drainPm > 0) s.hp[caster] = Math.min((s.hp[caster] ?? 0) + (dealt * spec.drainPm) / 1000, s.maxHp[caster] ?? 0);
}

/** Extra stun (Overgrowth's root, Glacier Crash's freeze) on top of the hit's own, counted as stun. */
function rootVictim(world: SimWorld, sink: EventSink, fx: number, victim: number, ticks: number): void {
  if (ticks > 0 && (world.state.hp[victim] ?? 0) > 0) applyStun(world, sink, fx, victim, HIT_STUN_TICKS[3] + ticks);
}

/** The victim a super hit can land on this tick, or -1 (none, translucent, invulnerable). */
function targetOf(world: SimWorld, team: number): number {
  const s = world.state;
  const victim = controlledId(world, 1 - team);
  return victim < 0 || ((s.flags[victim] ?? 0) & EntityFlag.translucent) !== 0 || isInvulnerable(s, victim) ? -1 : victim;
}

/** Fires Hailstorm icicle `n`, fanned around the facing; it holds no active count (so it never blocks an Icicles cast). */
function fireIcicle(world: SimWorld, fx: number, caster: number, n: number): void {
  const s = world.state;
  const def = ABILITY_DEFS[ICICLES];
  const slot = abilitySlot(s, caster, ICICLES);
  if (def === undefined || slot < 0) return;
  const dir = ((s.dir[fx] ?? 0) + (SUPER_ICICLE_FAN[n % SUPER_ICICLE_FAN.length] ?? 0)) & 7;
  const id = spawnBulletId(world, caster, ICICLES, def, dir);
  if (id >= 0) s.hitMask[id] = SUPER_BULLET;
}

/**
 * The Tidal Wave for one tick: fire due icicles, hit the victim once on contact (damage, the slow, the race's freeze),
 * advance SUPER_TIDE_SPEED_PX along the facing. Returns true when the super is done (spent or off the arena, icicles out).
 */
function runTide(world: SimWorld, sink: EventSink, team: number, fx: number, spec: SuperSpec, t: number): boolean {
  const s = world.state;
  const a = world.arena;
  const caster = s.owner[fx] ?? 0;
  const dir = s.dir[fx] ?? 0;
  if (spec.icicles > 0 && t % SUPER_ICICLE_EVERY === 0 && t / SUPER_ICICLE_EVERY < spec.icicles) {
    fireIcicle(world, fx, caster, t / SUPER_ICICLE_EVERY);
  }
  if ((s.hp[fx] ?? 0) === 0) {
    const victim = targetOf(world, team);
    if (victim >= 0 && aabbOverlap(box(s, fx), box(s, victim))) {
      s.hp[fx] = 1;
      strike(world, sink, fx, victim, spec);
      if ((s.hp[victim] ?? 0) <= 0) return true;
      applyTimedStatus(world, victim, StatusId.superSlow, caster, SUPER_TIDE_SLOW_TICKS, -(s.speed[victim] ?? 0) / 2);
      rootVictim(world, sink, fx, victim, spec.rootTicks);
    }
  }
  if ((DIR8_X[dir] ?? 1) !== 0) s.x[fx] = (s.x[fx] ?? 0) + (DIR8_X[dir] ?? 1) * SUPER_TIDE_SPEED_PX;
  else s.y[fx] = (s.y[fx] ?? 0) + (DIR8_Y[dir] ?? 1) * SUPER_TIDE_SPEED_PX;
  const gone = !aabbOverlap(box(s, fx), { x: a.x, y: a.y, w: a.w, h: a.h });
  const iciclesOut = spec.icicles === 0 || t >= (spec.icicles - 1) * SUPER_ICICLE_EVERY;
  return ((s.hp[fx] ?? 0) !== 0 || gone) && iciclesOut;
}

/**
 * Runs `team`'s live super for one game tick (FUN-DESIGN 2.5), per shape: a hit on the opposing controlled character
 * every `spec.every` ticks while its box overlaps (not translucent, not invulnerable): the Inferno Beam band, the
 * Vortex box (pulling the victim toward the caster) or a Quake ring (160/320/480 px, scaled by the race); or the Tidal
 * Wave's single hit. It ends when its time is up, its caster leaves play (KO or bench), or a hit KOs the victim.
 */
function runSuper(world: SimWorld, sink: EventSink, team: number): void {
  const s = world.state;
  const fx = (s.arcade[stateIndex(team)] ?? 0) - 1;
  if (fx < 0) return;
  const caster = s.owner[fx] ?? 0;
  const spec = SUPER_SPECS[s.hitMask[fx] ?? 0] ?? SUPER_BURST;
  const g = now(s);
  const inPlay = ((s.flags[caster] ?? 0) & (EntityFlag.alive | EntityFlag.dead | EntityFlag.benched)) === EntityFlag.alive;
  if (!inPlay || g >= (s.expireTick[fx] ?? 0)) {
    endSuper(world, sink, team, fx, inPlay);
    return;
  }
  const t = g - (s.spawnTick[fx] ?? 0);
  if (t < 0) return;
  if (spec.shape === SuperShape.tide) {
    if (runTide(world, sink, team, fx, spec, t)) endSuper(world, sink, team, fx, true);
    return;
  }
  if (t % spec.every !== 0) return;
  const ring = t / spec.every;
  if (spec.shape === SuperShape.vortex) placeSquare(s, fx, caster, spec.size);
  else if (spec.shape === SuperShape.quake) {
    if (ring > LAST_RING) return;
    placeSquare(s, fx, caster, Math.floor(((SUPER_QUAKE_RING_PX[ring] ?? 0) * spec.scalePm) / 1000));
  }
  const victim = targetOf(world, team);
  if (victim < 0 || !aabbOverlap(box(s, fx), box(s, victim))) return;
  strike(world, sink, fx, victim, spec);
  if ((s.hp[victim] ?? 0) <= 0) {
    endSuper(world, sink, team, fx, true);
    return;
  }
  if (spec.shape === SuperShape.vortex) {
    const pull = dir8FromSigns(
      Math.sign((s.x[caster] ?? 0) + (s.w[caster] ?? 0) / 2 - ((s.x[victim] ?? 0) + (s.w[victim] ?? 0) / 2)),
      Math.sign((s.y[caster] ?? 0) + (s.h[caster] ?? 0) / 2 - ((s.y[victim] ?? 0) + (s.h[victim] ?? 0) / 2)),
    );
    if (pull >= 0) setKnockback(s, victim, KNOCKBACK_Q4[0], pull);
  } else if (spec.shape === SuperShape.quake && ring === LAST_RING) {
    rootVictim(world, sink, fx, victim, spec.rootTicks);
  }
}

/**
 * Starts `team`'s super when its controlled character can act, has no super running and the team has SUPER_COST meter:
 * spends it, spawns the super's box as an `effect` entity (def SUPER_DEF, the race's super id in `hitMask`, active from
 * the first game tick after the freeze), makes the caster invulnerable through the freeze and SUPER_INVULN_AFTER_TICKS
 * past it, emits `superStarted` with that id and freezes the game SUPER_FREEZE_TICKS (`hitStop` cause super).
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
  const spec = superSpecOf(s, caster);
  let active = spec.active;
  if (spec.shape === SuperShape.beam) placeBand(world, fx, caster, dir, spec.size);
  else if (spec.shape === SuperShape.tide) {
    placeWall(world, fx, caster, dir, spec.size);
    const extent = (DIR8_X[dir] ?? 1) !== 0 ? world.arena.w : world.arena.h;
    active = Math.ceil((extent + spec.size) / SUPER_TIDE_SPEED_PX) + 1 + spec.icicles * SUPER_ICICLE_EVERY;
  } else placeSquare(s, fx, caster, spec.size);
  s.kind[fx] = EntityKind.effect;
  s.defId[fx] = SUPER_DEF;
  s.team[fx] = team;
  s.owner[fx] = caster;
  s.dir[fx] = dir;
  s.hitMask[fx] = spec.id;
  s.hp[fx] = 0;
  // The game clock advances once after this tick, then stands still through the freeze.
  s.spawnTick[fx] = g + 1;
  s.expireTick[fx] = g + 1 + active;
  s.arcade[stateIndex(team)] = fx + 1;
  const inv = caster * ARCADE_E + ArcadeE.invulnUntil;
  s.arcade[inv] = Math.max(s.arcade[inv] ?? 0, g + 1 + SUPER_INVULN_AFTER_TICKS);
  usePress(s, team, Press.super);
  sink.emit(caster, SimEventKind.superStarted, { caster, superId: spec.id });
  hitStop(world, sink, caster, SUPER_FREEZE_TICKS, HitStopCause.super);
}

/** Ends both teams' live supers (the round reset, arcade/round.ts) with `superEnded`; no after-effects. */
export function endLiveSupers(world: SimWorld, sink: EventSink): void {
  for (let team = 0; team < TEAM_COUNT; team++) {
    const fx = (world.state.arcade[stateIndex(team)] ?? 0) - 1;
    if (fx >= 0) endSuper(world, sink, team, fx, false);
  }
}

/**
 * The `health` slot (FUN-DESIGN 2.1), `arcadeSuper`: live supers run first, then `Cmd.super` (held, buffered or a
 * primary and secondary chord, see arcade/buffer.ts) starts new ones (team 0, then team 1); a start uses the super
 * press. Returns at once in Classic, where `inputMaskFor` also masks the super bit.
 */
export function arcadeSuperSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  if (!isArcade(world.state)) return;
  for (let team = 0; team < TEAM_COUNT; team++) runSuper(world, sink, team);
  for (let team = 0; team < TEAM_COUNT; team++) {
    if (hasCmd(bufferedCmd(world.state, team, cmds[team] ?? 0), Cmd.super)) startSuper(world, sink, team);
  }
}
