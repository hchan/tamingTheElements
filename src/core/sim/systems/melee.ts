import { aabbOverlap, type Aabb } from '../../math/aabb';
import { ABILITIES_A } from '../../data/abilities-a';
import { ABILITIES_B, type AbilityDefB } from '../../data/abilities-b';
import { CHARACTERS } from '../../data/characters';
import type { AbilityDef } from '../../data/types';
import { computeDamage, computeHeal, damageDealt } from '../../rules/damage';
import { allocEntity, freeEntity } from '../alloc';
import { Cmd, hasCmd, type Command } from '../commands';
import { cooldownIdx, countIdx, EntityFlag, EntityKind, TEAM_COUNT, MAX_ENTITIES } from '../state';
import type { SimWorld } from '../world';
import { controlledId } from './movement';
import { damageDecreasePct } from './status';
import type { EventSink } from '../events';
import { isArcade, now } from '../clock';
import { applyArcadeHit, HIT_STUN } from './arcade/hit';
import { bufferedCmd, onArcadeCast } from './arcade/buffer';
import { applyStun, canAct, isInvulnerable } from './arcade/stun';
import { releaseCount } from './ability-info';
import { castDir } from './arcade/aim';

/** Every ability def in a stable order; an ability's defId is its index here (A then B, 30 < MAX_ABILITY_DEFS). */
export const ABILITY_DEFS: readonly (AbilityDef | AbilityDefB)[] = [...ABILITIES_A, ...ABILITIES_B];
const DEF_INDEX = new Map<string, number>(ABILITY_DEFS.map((d, i) => [d.id, i]));

const VINES = DEF_INDEX.get('entangling-vines') ?? -1;
const HURRICANE = DEF_INDEX.get('hurricane') ?? -1;
const GROUND_SHOCK = DEF_INDEX.get('ground-shock') ?? -1;
const STEAL_HEALTH = DEF_INDEX.get('steal-health') ?? -1;
const ICE_SHOCK = DEF_INDEX.get('ice-shock') ?? -1;

const HIT = 1;
const NORTH = 2;
const WEST = 4;
const SOUTH = 6;

// ---------------------------------------------------------------------------------------------
// Legacy range helpers (GameHelper.isInRangeDirectional / isInRangeExplosion). Used by AI and
// tests; positions are legacy top-left corners.
//
// KNOWN-BUG:melee-range-axes  The legacy helpers compare deltaX with target.h/2 (x-axis test)
// and deltaY with target.w/2, and both branches then compare deltaX (never deltaY) with the
// range. Replicated verbatim so the tables in abilities-effects.json hold.
// ---------------------------------------------------------------------------------------------

function inRange(
  attX: number, attY: number, tgt: Aabb, rangeW: number, rangeH: number, scale: number,
): boolean {
  const deltaX = Math.abs(tgt.x - attX);
  const deltaY = Math.abs(tgt.y - attY);
  if (deltaX <= tgt.h / 2 && deltaX < rangeW * scale) return true;
  return deltaY <= tgt.w / 2 && deltaX < rangeH * scale;
}

export function isInRangeDirectional(attX: number, attY: number, tgt: Aabb, rangeW: number, rangeH: number): boolean {
  return inRange(attX, attY, tgt, rangeW, rangeH, 1);
}

export function isInRangeExplosion(attX: number, attY: number, tgt: Aabb, rangeW: number, rangeH: number): boolean {
  return inRange(attX, attY, tgt, rangeW, rangeH, 0.5);
}

/**
 * Legacy `Melee.reposition`: the (rotation-aware) box a directional melee occupies in front of its caster. Diagonals
 * (odd dir8, Arcade 8-way aim only) take a square of side (w + h) / 2 off the caster's corner on the aim side.
 */
export function directionalBox(dir: number, cx: number, cy: number, cw: number, ch: number, w: number, h: number): Aabb {
  if ((dir & 1) === 1) {
    const d = (w + h) / 2;
    return { x: dir < 3 || dir > 5 ? cx + cw : cx - d, y: dir < 4 ? cy - d : cy + ch, w: d, h: d };
  }
  if (dir === WEST) return { x: cx - w, y: cy + (ch - h) / 2, w, h };
  if (dir === SOUTH) return { x: cx + (cw - h) / 2, y: cy + ch, w: h, h: w }; // rotated 90 deg
  if (dir === NORTH) return { x: cx + (cw - h) / 2, y: cy - w, w: h, h: w }; // rotated 270 deg
  return { x: cx + cw, y: cy + (ch - h) / 2, w, h }; // east, and legacy's null default
}

// ---------------------------------------------------------------------------------------------

function isDead(world: SimWorld, id: number): boolean {
  return ((world.state.flags[id] ?? 0) & EntityFlag.alive) === 0;
}

function setFlag(world: SimWorld, id: number, flag: number, on: boolean): void {
  const f = world.state.flags[id] ?? 0;
  world.state.flags[id] = on ? f | flag : f & ~flag;
}

/** Legacy `character.removeMelee`: frees the melee and decrements its caster's active count. */
function release(world: SimWorld, id: number): void {
  const s = world.state;
  releaseCount(s, s.owner[id] ?? 0, s.defId[id] ?? 0);
  freeEntity(s, id);
}

function damageOf(def: AbilityDef | AbilityDefB): number {
  return def.damage ?? 0;
}

/**
 * Applies one melee hit's damage to the victim, using legacy `applyDamage` arithmetic.
 * KNOWN-BUG:damage-uses-target-mult  the multiplier and element come from the victim's current
 * target (the attacker team's ACTIVE character), not from the casting entity.
 * The victim's damageDecreasePercentage comes from its active Adrenaline / Rock Armour statuses.
 * Returns the health actually removed. In Arcade the hit goes through `applyArcadeHit` (same attacker, same arithmetic)
 * for hit-stop and the hit events; `id` is the melee entity.
 */
function applyHit(world: SimWorld, sink: EventSink, id: number, caster: number, victim: number, base: number): number {
  const s = world.state;
  const attacker = controlledId(world, s.team[caster] ?? 0);
  const a = attacker >= 0 ? attacker : caster;
  if (isArcade(s)) return applyArcadeHit(world, sink, id, a, victim, base, s.defId[id] ?? 0, s.dir[id] ?? 0);
  const dmg = computeDamage({
    base,
    attackerMult: s.dmgMult[a] ?? 1,
    attEl: CHARACTERS[s.defId[a] ?? 0]?.element ?? 'void',
    defEl: CHARACTERS[s.defId[victim] ?? 0]?.element ?? 'void',
    defReductionPct: damageDecreasePct(s, victim),
  });
  const before = s.hp[victim] ?? 0;
  s.hp[victim] = before - dmg;
  return damageDealt(before, dmg);
}

function meleeHit(world: SimWorld, sink: EventSink, id: number, victim: number): void {
  const s = world.state;
  const defId = s.defId[id] ?? 0;
  const def = ABILITY_DEFS[defId];
  if (!def) return;
  const caster = s.owner[id] ?? 0;
  const tick = now(s);
  const victimTranslucent = ((s.flags[victim] ?? 0) & EntityFlag.translucent) !== 0;

  if (defId === HURRICANE) {
    if (victimTranslucent) return;
    // Legacy: damage when more than the interval has elapsed since the last hit (hitMask = last tick + 1),
    // and the hurricane's own damage halves after every hit (stored in hp).
    const interval = (def as AbilityDefB).damageIntervalTicks ?? 0;
    const last = s.hitMask[id] ?? 0;
    if (last === 0 || tick - (last - 1) > interval) {
      applyHit(world, sink, id, caster, victim, s.hp[id] ?? 0);
      s.hitMask[id] = tick + 1;
      s.hp[id] = (s.hp[id] ?? 0) / 2;
    }
    return;
  }

  if (defId === VINES) {
    if (victimTranslucent) return;
    if (isArcade(s)) {
      // Arcade: one 60-tick stun per cast that obeys the juggle and stun caps, instead of the 150-tick freeze.
      if ((s.hitMask[id] ?? 0) === 0) applyStun(world, sink, id, victim, HIT_STUN[VINES] ?? 0);
      s.hitMask[id] = HIT;
      return;
    }
    setFlag(world, victim, EntityFlag.frozen, true);
    // KNOWN-BUG:vines-stacking  legacy schedules an unfreeze per overlapping frame; one per cast is
    // kept here (later ones are no-ops unless something else froze the target). Each cast's expiry
    // unfreezes regardless of other casts, and never fires if the caster is dead.
    if ((s.hitMask[id] ?? 0) === 0) {
      s.hitMask[id] = HIT;
      const fx = allocEntity(s);
      if (fx < 0) return;
      s.kind[fx] = EntityKind.effect;
      s.defId[fx] = VINES;
      s.team[fx] = s.team[caster] ?? 0;
      s.owner[fx] = caster;
      s.hitMask[fx] = victim; // victim id
      s.expireTick[fx] = tick + (def.durationTicks ?? 0);
    }
    return;
  }

  if ((s.hitMask[id] ?? 0) !== 0) return; // Melee.hasHit
  if (defId === STEAL_HEALTH) {
    // KNOWN-BUG:steal-health-translucent  legacy tests the CASTER's translucency (victim.targetPlayer),
    // so a translucent victim is still hit and a translucent caster cannot hit.
    if (((s.flags[caster] ?? 0) & EntityFlag.translucent) !== 0) return;
    const dealt = applyHit(world, sink, id, caster, victim, s.hp[id] ?? 0);
    s.hp[caster] = computeHeal(s.hp[caster] ?? 0, dealt, s.healMult[caster] ?? 1, s.maxHp[caster] ?? 0);
  } else if (defId === ICE_SHOCK) {
    // KNOWN-BUG:ice-shock-ignores-translucent  legacy Ice Shock has no translucency check.
    applyHit(world, sink, id, caster, victim, s.hp[id] ?? 0);
  } else {
    if (victimTranslucent) return;
    applyHit(world, sink, id, caster, victim, s.hp[id] ?? 0);
  }
  s.hitMask[id] = HIT;
}

function updateMelee(world: SimWorld, sink: EventSink, id: number, tick: number): void {
  const s = world.state;
  const defId = s.defId[id] ?? 0;
  const caster = s.owner[id] ?? 0;
  const def = ABILITY_DEFS[defId];
  const casterDead = isDead(world, caster);

  if (defId === HURRICANE) {
    if (casterDead) {
      release(world, id);
      return;
    }
    // Follows the caster (legacy EnterFrame), centred on it.
    s.x[id] = (s.x[caster] ?? 0) - ((s.w[id] ?? 0) - (s.w[caster] ?? 0)) / 2;
    s.y[id] = (s.y[caster] ?? 0) - ((s.h[id] ?? 0) - (s.h[caster] ?? 0)) / 2;
    if (tick >= (s.expireTick[id] ?? 0)) {
      release(world, id);
      return;
    }
  } else if (tick >= (s.expireTick[id] ?? 0) && !casterDead) {
    // KNOWN-BUG:melee-dead-caster-lingers  legacy only removes the melee (and unfreezes the caster)
    // if the caster is alive, so a dead caster's melee stays and can still land its single hit.
    if ((def?.delayAfterAttackTicks ?? 0) !== 0) setFlag(world, caster, EntityFlag.frozen, false);
    release(world, id);
    return;
  }

  const victim = controlledId(world, 1 - (s.team[id] ?? 0));
  if (victim < 0) return;
  if (isInvulnerable(s, victim)) return; // Arcade only
  const box: Aabb = { x: s.x[victim] ?? 0, y: s.y[victim] ?? 0, w: s.w[victim] ?? 0, h: s.h[victim] ?? 0 };
  const mine: Aabb = { x: s.x[id] ?? 0, y: s.y[id] ?? 0, w: s.w[id] ?? 0, h: s.h[id] ?? 0 };
  if (aabbOverlap(mine, box)) meleeHit(world, sink, id, victim);
}

function updateEffect(world: SimWorld, id: number, tick: number): void {
  const s = world.state;
  if (s.defId[id] !== VINES || tick < (s.expireTick[id] ?? 0)) return;
  const caster = s.owner[id] ?? 0;
  const victim = s.hitMask[id] ?? 0;
  if (!isDead(world, caster) && !isDead(world, victim)) setFlag(world, victim, EntityFlag.frozen, false);
  freeEntity(s, id);
}

function cast(world: SimWorld, sink: EventSink, team: number, slot: number, tick: number): void {
  const s = world.state;
  const caster = controlledId(world, team);
  if (caster < 0 || !canAct(world, caster)) return;
  const abilityId = CHARACTERS[s.defId[caster] ?? 0]?.abilities[slot];
  const defId = abilityId === undefined ? undefined : DEF_INDEX.get(abilityId);
  const def = defId === undefined ? undefined : ABILITY_DEFS[defId];
  if (defId === undefined || def?.kind !== 'melee') return;

  // Cooldown and active count belong to the caster (legacy abilitiesInfo is per character).
  const cd = cooldownIdx(caster, slot);
  const ci = countIdx(caster, slot);
  if (tick < (s.abil[cd] ?? 0) || (s.abil[ci] ?? 0) >= def.maxActive) return;

  const id = allocEntity(s);
  if (id < 0) return;
  // Legacy: usable when elapsed > cooldown, hence the +1 tick.
  s.abil[cd] = tick + def.cooldownTicks + 1;
  s.abil[ci] = (s.abil[ci] ?? 0) + 1;
  onArcadeCast(s, sink, caster, team, slot);

  const w = def.w ?? 0;
  const h = def.h ?? 0;
  const cx = s.x[caster] ?? 0;
  const cy = s.y[caster] ?? 0;
  const cw = s.w[caster] ?? 0;
  const ch = s.h[caster] ?? 0;
  const aim = castDir(s, caster);
  const box =
    defId === GROUND_SHOCK || defId === HURRICANE
      ? { x: cx - (w - cw) / 2, y: cy - (h - ch) / 2, w, h }
      : directionalBox(aim, cx, cy, cw, ch, w, h);
  s.kind[id] = EntityKind.melee;
  s.defId[id] = defId;
  s.team[id] = team;
  s.owner[id] = caster;
  s.dir[id] = aim;
  s.x[id] = box.x;
  s.y[id] = box.y;
  s.w[id] = box.w;
  s.h[id] = box.h;
  s.hp[id] = damageOf(def); // current damage; Hurricane halves it per hit
  const delay = def.delayAfterAttackTicks ?? 0;
  s.expireTick[id] = tick + (defId === HURRICANE ? (def.durationTicks ?? 0) : delay);
  if (delay !== 0) setFlag(world, caster, EntityFlag.frozen, true);
}

/**
 * Melee abilities: Ground Shock, Steal Health, Ice Shock, Strangling Branches, Entangling Vines and
 * Hurricane. Existing melee/effect entities update first (so a new one first hits one tick after
 * its cast, as in legacy), then new casts spawn from the primary (slot 0) / secondary (slot 1) bits.
 * Classic emits no events (as before); Arcade hits emit `damage`, `hitConfirmed` and `hitStop` (arcade/hit.ts).
 */
export function meleeSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  const tick = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (isDead(world, id)) continue;
    const kind = s.kind[id];
    if (kind === EntityKind.melee) updateMelee(world, sink, id, tick);
    else if (kind === EntityKind.effect) updateEffect(world, id, tick);
  }
  for (let team = 0; team < TEAM_COUNT; team++) {
    const cmd = bufferedCmd(s, team, cmds[team] ?? 0);
    if (hasCmd(cmd, Cmd.primary)) cast(world, sink, team, 0, tick);
    if (hasCmd(cmd, Cmd.secondary)) cast(world, sink, team, 1, tick);
  }
}
