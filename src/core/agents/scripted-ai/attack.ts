import { Cmd, type Command, NO_COMMAND } from '../../sim/commands';
import { EntityFlag } from '../../sim/state';
import { stateRecord, type Agent, type AgentState, type ObservationView } from '../agent';

/**
 * Port of the legacy EnemyCharacter attack decisions (baseCharacter.js): updateAttackDirection,
 * isInRangeAxis and the doPrimary/doSecondaryAttackIfNecessary preconditions.
 *
 * Determinism notes: the legacy attack path reads no Math.random, so this agent draws no random numbers
 * (only the movement port in ScriptedAI does, from its own `AgentRng`). Legacy wall-clock
 * cooldowns (Date) are replaced by the per-slot tick cooldowns of the ObservationView, and the
 * active-ability counter by the injectable `activeCount`. The agent's only own state is `facing`.
 */

export type Facing = 'n' | 'e' | 's' | 'w';

/** Legacy ability type for decision purposes: Range, Melee, Heal; anything else has no precondition. */
export type AttackType = 'range' | 'melee' | 'heal' | 'other';
/** Which legacy isInRange helper a melee ability uses (explosion halves the range). */
export type MeleeReach = 'explosion' | 'directional';

export interface AttackAbility {
  readonly type: AttackType;
  /** Melee reach in the same units as the view's positions. */
  readonly w?: number;
  readonly h?: number;
  readonly reach?: MeleeReach;
  readonly maxActive: number;
}

export interface AttackProfile {
  readonly primary: AttackAbility;
  readonly secondary?: AttackAbility;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Axes {
  readonly sameX: boolean;
  readonly sameY: boolean;
  readonly deltaX: number;
}

function axes(self: Box, target: Box): Axes {
  const deltaX = Math.abs(target.x - self.x);
  const deltaY = Math.abs(target.y - self.y);
  // Legacy quirk kept for parity: the x axis is compared with the target's height, the y axis with its width.
  return { sameX: deltaX <= target.h / 2, sameY: deltaY <= target.w / 2, deltaX };
}

/** Legacy updateAttackDirection: the y-axis rule (e/w) overrides the x-axis rule (n/s); otherwise unchanged. */
export function updateAttackDirection(self: Box, target: Box, current: Facing): Facing {
  const a = axes(self, target);
  let dir = current;
  if (a.sameX) dir = self.y > target.y ? 'n' : 's';
  if (a.sameY) dir = self.x > target.x ? 'w' : 'e';
  return dir;
}

/** Legacy isInRangeAxis: same direction update, plus whether the target shares either axis. */
export function isInRangeAxis(self: Box, target: Box, current: Facing): { inRange: boolean; facing: Facing } {
  const a = axes(self, target);
  return { inRange: a.sameX || a.sameY, facing: updateAttackDirection(self, target, current) };
}

/** Legacy melee isInRange (GameHelper.isInRangeDirectional / isInRangeExplosion, including its deltaX-on-both-axes quirk). */
export function isInMeleeRange(self: Box, target: Box, w: number, h: number, reach: MeleeReach): boolean {
  const a = axes(self, target);
  const rw = reach === 'explosion' ? w / 2 : w;
  const rh = reach === 'explosion' ? h / 2 : h;
  return (a.sameX && a.deltaX < rw) || (a.sameY && a.deltaX < rh);
}

/** Geometric precondition of the primary attack (before cooldown/active/frozen gating). */
export function primaryInRange(
  ability: AttackAbility,
  self: Box,
  target: Box,
  current: Facing,
): { inRange: boolean; facing: Facing } {
  if (ability.type === 'range') return isInRangeAxis(self, target, current);
  if (ability.type === 'melee') {
    return {
      inRange: isInMeleeRange(self, target, ability.w ?? 0, ability.h ?? 0, ability.reach ?? 'directional'),
      facing: current,
    };
  }
  return { inRange: false, facing: current };
}

/** Legacy doSecondaryAttackIfNecessary early exits: melee needs reach, heal needs missing health. */
export function secondaryPrecondition(ability: AttackAbility, self: Box & { hp: number; maxHp: number }, target: Box): boolean {
  if (ability.type === 'melee') {
    return isInMeleeRange(self, target, ability.w ?? 0, ability.h ?? 0, ability.reach ?? 'directional');
  }
  if (ability.type === 'heal') return self.hp !== self.maxHp;
  return true;
}

const FACING_CMD: Readonly<Record<Facing, number>> = { n: Cmd.up, e: Cmd.right, s: Cmd.down, w: Cmd.left };

export interface AttackAgentOptions {
  readonly id?: string;
  /** Live projectile/effect count for slot 0 (primary) or 1 (secondary); default none. */
  readonly activeCount?: (slot: 0 | 1) => number;
}

/**
 * Scripted attack agent. Emits `primary`/`secondary` bits when the legacy preconditions hold and the
 * ability is ready; a primary shot carries the facing direction bit so the sim fires that way.
 * Movement (doMovement) is a separate port, so no other movement is commanded.
 */
export class AttackAgent implements Agent {
  readonly id: string;
  private readonly profile: AttackProfile;
  private readonly activeCount: (slot: 0 | 1) => number;
  private facing: Facing = 'w';

  constructor(profile: AttackProfile, options: AttackAgentOptions = {}) {
    this.profile = profile;
    this.id = options.id ?? 'scripted-attack';
    this.activeCount = options.activeCount ?? (() => 0);
  }

  get direction(): Facing {
    return this.facing;
  }

  observe(view: ObservationView): Command {
    const self = view.self;
    const target = view.opponent;
    if (self === undefined || target === undefined) return NO_COMMAND;
    // Legacy skips the whole EnterFrame AI while frozen.
    if ((self.flags & EntityFlag.frozen) !== 0) return NO_COMMAND;

    this.facing = updateAttackDirection(self, target, this.facing);
    let cmd: Command = NO_COMMAND;

    const sec = this.profile.secondary;
    if (sec !== undefined && this.ready(view, 1, sec) && secondaryPrecondition(sec, self, target)) {
      cmd |= Cmd.secondary;
    }

    const pri = this.profile.primary;
    // Legacy evaluates the range check (which also turns the character) before the ready gate inside doRange.
    const r = primaryInRange(pri, self, target, this.facing);
    this.facing = r.facing;
    if (r.inRange && this.ready(view, 0, pri)) cmd |= Cmd.primary | FACING_CMD[this.facing];
    return cmd;
  }

  save(): AgentState {
    return { facing: this.facing };
  }

  load(state: AgentState): void {
    const facing = stateRecord(state, this.id)['facing'];
    if (facing !== 'n' && facing !== 'e' && facing !== 's' && facing !== 'w') throw new TypeError(`${this.id}: bad facing`);
    this.facing = facing;
  }

  private ready(view: ObservationView, slot: 0 | 1, ability: AttackAbility): boolean {
    return (view.cooldowns[slot] ?? 0) === 0 && this.activeCount(slot) < ability.maxActive;
  }
}
