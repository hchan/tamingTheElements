import { Cmd, hasCmd, type Command } from '../commands';
import { cooldownIdx, TEAM_COUNT } from '../state';
import type { SimWorld } from '../world';
import { ABILITY_DEFS } from './projectile';
import { controlledId } from './movement';
import { applyBuff, applyHeal } from './status';
import { now } from '../clock';
import { bufferedCmd, onArcadeCast } from './arcade/buffer';
import { canAct } from './arcade/stun';
import { slotAbility } from './ability-info';
import type { EventSink } from '../events';

/**
 * Self-targeted abilities (kind buff or heal): Adrenaline, Rock Armour, Fire Dance, Translucent Flame,
 * Fade and Fire Heal. Legacy runs them through `doAbility`: canDoAbility (not frozen, curCount below
 * maxActive, elapsed strictly above the cooldown) then `initAbility` and `lastUsed = now`. The
 * effect itself lives in systems/status.ts (applyBuff / applyHeal). curCount is never incremented for
 * these, so maxActive (100) can only be reached by the 8 status slots filling up.
 * Cooldowns are booked on the caster per ability slot (primary 0, secondary 1) like the other cast systems.
 */
export function castSelf(world: SimWorld, sink: EventSink, team: number, slot: number, tick: number): void {
  const s = world.state;
  const caster = controlledId(world, team);
  if (caster < 0 || !canAct(world, caster)) return;
  const abilityId = slotAbility(s, caster, slot);
  const def = ABILITY_DEFS.find((d) => d.id === abilityId);
  if (def?.kind !== 'buff' && def?.kind !== 'heal') return;
  const cd = cooldownIdx(caster, slot);
  if (tick < (s.abil[cd] ?? 0)) return;
  if (def.kind === 'heal') applyHeal(world, caster, def.id);
  else if (!applyBuff(world, caster, def.id)) return;
  s.abil[cd] = tick + def.cooldownTicks + 1;
  onArcadeCast(s, sink, caster, team, slot);
}

export function abilitiesSystem(world: SimWorld, cmds: readonly [Command, Command], sink: EventSink): void {
  const tick = now(world.state);
  for (let team = 0; team < TEAM_COUNT; team++) {
    const cmd = bufferedCmd(world.state, team, cmds[team] ?? 0);
    if (hasCmd(cmd, Cmd.primary)) castSelf(world, sink, team, 0, tick);
    if (hasCmd(cmd, Cmd.secondary)) castSelf(world, sink, team, 1, tick);
  }
}
