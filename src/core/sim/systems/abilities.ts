import { CHARACTERS } from '../../data/characters';
import { Cmd, hasCmd, type Command } from '../commands';
import { EntityFlag, TEAM_COOLDOWNS, TEAM_COUNT, TEAM_STRIDE } from '../state';
import type { SimWorld } from '../world';
import { ABILITY_DEFS } from './projectile';
import { controlledId } from './movement';
import { applyBuff, applyHeal } from './status';
import { now } from '../clock';

/**
 * Self-targeted abilities (kind buff or heal): Adrenaline, Rock Armour, Fire Dance, Translucent Flame,
 * Fade and Fire Heal. Legacy runs them through `doAbility`: canDoAbility (not frozen, curCount below
 * maxActive, elapsed strictly above the cooldown) then `initAbility` and `lastUsed = now`. The
 * effect itself lives in systems/status.ts (applyBuff / applyHeal). curCount is never incremented for
 * these, so maxActive (100) can only be reached by the 8 status slots filling up.
 * Cooldowns are booked per ability slot (primary 0, secondary 1) like the other cast systems.
 */
function castSelf(world: SimWorld, team: number, slot: number, tick: number): void {
  const s = world.state;
  const caster = controlledId(world, team);
  if (caster < 0 || ((s.flags[caster] ?? 0) & EntityFlag.frozen) !== 0) return;
  const abilityId = CHARACTERS[s.defId[caster] ?? 0]?.abilities[slot];
  const def = ABILITY_DEFS.find((d) => d.id === abilityId);
  if (def?.kind !== 'buff' && def?.kind !== 'heal') return;
  const cd = team * TEAM_STRIDE + TEAM_COOLDOWNS + slot;
  if (tick < (s.teams[cd] ?? 0)) return;
  if (def.kind === 'heal') applyHeal(world, caster, def.id);
  else if (!applyBuff(world, caster, def.id)) return;
  s.teams[cd] = tick + def.cooldownTicks + 1;
}

export function abilitiesSystem(world: SimWorld, cmds: readonly [Command, Command]): void {
  const tick = now(world.state);
  for (let team = 0; team < TEAM_COUNT; team++) {
    const cmd = cmds[team] ?? 0;
    if (hasCmd(cmd, Cmd.primary)) castSelf(world, team, 0, tick);
    if (hasCmd(cmd, Cmd.secondary)) castSelf(world, team, 1, tick);
  }
}
