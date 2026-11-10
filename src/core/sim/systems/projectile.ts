import { ABILITIES_A } from '../../data/abilities-a';
import { ABILITIES_B } from '../../data/abilities-b';
import { CHARACTER_HEIGHT, CHARACTER_WIDTH } from '../../data/chapters';
import { CHARACTERS } from '../../data/characters';
import type { AbilityDef } from '../../data/types';
import { aabbOverlap } from '../../math/aabb';
import { DIR8_X, DIR8_Y } from '../../math/dir8';
import { computeDamage } from '../../rules/damage';
import { allocEntity, freeEntity } from '../alloc';
import { Cmd, hasCmd, type Command } from '../commands';
import { SimEventKind, type EventSink } from '../events';
import {
  EntityFlag, EntityKind, MAX_ENTITIES, TEAM_ACTIVE_COUNTS, TEAM_COOLDOWNS, TEAM_COUNT, TEAM_STRIDE,
  World as W,
} from '../state';
import type { SimWorld } from '../world';
import { onProjectileHit } from './debuffs';
import { damageDecreasePct } from './status';
import { controlledId } from './movement';

/** Ability index used for SimState.defId and the per-team activeCount table (set A then set B). */
export const ABILITY_DEFS: readonly AbilityDef[] = [...ABILITIES_A, ...ABILITIES_B];

/** Dir8 indices of the omni fan, in the legacy order n, s, e, w, nw, ne, sw, se. */
const OMNI_DIRS: readonly number[] = [2, 6, 0, 4, 3, 1, 5, 7];

const SONAR = 'sonar-blast';
const FIREBALL = 'fireball';
const GROW_H_LIMIT = CHARACTER_HEIGHT * 0.5;

/** Legacy canFire: not frozen, curCount < maxActive and elapsed time strictly above the cooldown. */
function canFire(world: SimWorld, team: number, charId: number, slot: number, def: AbilityDef, defIdx: number): boolean {
  const s = world.state;
  if (((s.flags[charId] ?? 0) & EntityFlag.frozen) !== 0) return false;
  const base = team * TEAM_STRIDE;
  if (def.maxActive <= (s.teams[base + TEAM_ACTIVE_COUNTS + defIdx] ?? 0)) return false;
  return (s.world[W.tick] ?? 0) >= (s.teams[base + TEAM_COOLDOWNS + slot] ?? 0);
}

/** Spawns one bullet; false when the entity table is full. */
function spawnBullet(world: SimWorld, charId: number, defIdx: number, def: AbilityDef, dir: number): boolean {
  const s = world.state;
  const id = allocEntity(s);
  if (id < 0) return false;
  // Set A sizes are fractions of the character box; set B (Ice Blast, the only projectile there) stores pixels.
  const w = def.kind === 'debuff' ? (def.w ?? 0) : (def.w ?? 0) * CHARACTER_WIDTH;
  const h = def.kind === 'debuff' ? (def.h ?? 0) : (def.h ?? 0) * CHARACTER_HEIGHT;
  const x = (s.x[charId] ?? 0) + ((s.w[charId] ?? 0) - w) / 2;
  const y = (s.y[charId] ?? 0) + ((s.h[charId] ?? 0) - h) / 2;
  const speed = def.speed ?? 0;
  s.kind[id] = EntityKind.projectile;
  s.defId[id] = defIdx;
  s.team[id] = s.team[charId] ?? 0;
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
  // hp holds the bullet's current damage. Fireball starts at a quarter and grows (legacy myTween).
  s.hp[id] = (def.damage ?? 0) * (def.id === FIREBALL ? 0.25 : 1);
  s.flags[id] = EntityFlag.alive;
  return true;
}

function fire(world: SimWorld, team: number, charId: number, slot: number, tick: number): void {
  const s = world.state;
  const abilityId = CHARACTERS[s.defId[charId] ?? 0]?.abilities[slot];
  const defIdx = ABILITY_DEFS.findIndex((d) => d.id === abilityId);
  const def = ABILITY_DEFS[defIdx];
  if (def === undefined || (def.kind !== 'range' && def.kind !== 'omni' && def.kind !== 'debuff')) return;
  if (!canFire(world, team, charId, slot, def, defIdx)) return;
  if (def.kind === 'omni') {
    // KNOWN-BUG:omni-no-cooldown: initAbility of an omni ability never goes through doRange, so curCount is
    // not incremented and the maxActive cap never applies. Replicated. The cooldown, however, is booked by
    // doAbility (`lastUsed = now`) for every ability cast from a slot, so it does apply (abilities-range.json
    // canFireAtCooldown 10000 false / 10001 true).
    for (const d of OMNI_DIRS) spawnBullet(world, charId, defIdx, def, d);
    s.teams[team * TEAM_STRIDE + TEAM_COOLDOWNS + slot] = tick + def.cooldownTicks + 1;
    return;
  }
  // A full entity table means no bullet: the cast must not book a cooldown or leak an active count.
  if (!spawnBullet(world, charId, defIdx, def, s.dir[charId] ?? 0)) return;
  const base = team * TEAM_STRIDE;
  s.teams[base + TEAM_ACTIVE_COUNTS + defIdx] = (s.teams[base + TEAM_ACTIVE_COUNTS + defIdx] ?? 0) + 1;
  // Legacy cooldown is strict (>) in ms, so the next fire is one tick after the cooldown elapses.
  s.teams[base + TEAM_COOLDOWNS + slot] = tick + def.cooldownTicks + 1;
}

/** Frees a bullet and decrements its team's active count (omni counts go negative, as in legacy). */
function despawn(world: SimWorld, id: number): void {
  const s = world.state;
  const idx = (s.team[id] ?? 0) * TEAM_STRIDE + TEAM_ACTIVE_COUNTS + (s.defId[id] ?? 0);
  s.teams[idx] = (s.teams[idx] ?? 0) - 1;
  freeEntity(s, id);
}

/** One Delay step of Sonar Blast (decays) or Fireball (grows). Alpha is cosmetic and not simulated. */
function shrinkStep(world: SimWorld, id: number): void {
  const s = world.state;
  const slug = ABILITY_DEFS[s.defId[id] ?? 0]?.id;
  if (slug !== SONAR && slug !== FIREBALL) return;
  const newH = (s.h[id] ?? 0) * 1.015;
  if (newH < GROW_H_LIMIT) s.h[id] = newH;
  else s.w[id] = (s.w[id] ?? 0) * 1.015;
  // KNOWN-BUG:fireball-damage-cap-typo: legacy caps against `defaults.damge` (undefined), so
  // Fireball damage never caps. Replicated.
  s.hp[id] = (s.hp[id] ?? 0) * (slug === SONAR ? 0.98 : 1.02);
}

export function projectileSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  const a = world.arena;
  const tick = s.world[W.tick] ?? 0;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] !== EntityKind.projectile || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0) continue;
    shrinkStep(world, id);
    s.px[id] = s.x[id] ?? 0;
    s.py[id] = s.y[id] ?? 0;
    s.x[id] = (s.x[id] ?? 0) + (s.vx[id] ?? 0);
    s.y[id] = (s.y[id] ?? 0) + (s.vy[id] ?? 0);
    const x = s.x[id] ?? 0;
    const y = s.y[id] ?? 0;
    // Legacy tests only the top-left corner against the viewport.
    if (x > a.x + a.w || x < a.x || y > a.y + a.h || y < a.y) {
      despawn(world, id);
      continue;
    }
    const target = controlledId(world, 1 - (s.team[id] ?? 0));
    if (target < 0 || ((s.flags[target] ?? 0) & EntityFlag.translucent) !== 0) continue;
    const box = { x, y, w: s.w[id] ?? 0, h: s.h[id] ?? 0 };
    const tbox = { x: s.x[target] ?? 0, y: s.y[target] ?? 0, w: s.w[target] ?? 0, h: s.h[target] ?? 0 };
    if (!aabbOverlap(box, tbox)) continue;
    const attacker = s.owner[id] ?? 0;
    const amount = computeDamage({
      base: s.hp[id] ?? 0,
      attackerMult: s.dmgMult[attacker] ?? 1,
      attEl: CHARACTERS[s.defId[attacker] ?? 0]?.element ?? 'void',
      defEl: CHARACTERS[s.defId[target] ?? 0]?.element ?? 'void',
      defReductionPct: damageDecreasePct(s, target),
    });
    s.hp[target] = (s.hp[target] ?? 0) - amount;
    sink.emit(id, SimEventKind.damage, { target, attacker, amount });
    onProjectileHit(world, ABILITY_DEFS[s.defId[id] ?? 0]?.id ?? '', target, attacker);
    despawn(world, id);
  }
  for (let team = 0; team < TEAM_COUNT; team++) {
    const charId = controlledId(world, team);
    if (charId < 0) continue;
    const cmd = cmds[team] ?? 0;
    if (hasCmd(cmd, Cmd.primary)) fire(world, team, charId, 0, tick);
    if (hasCmd(cmd, Cmd.secondary)) fire(world, team, charId, 1, tick);
  }
}
