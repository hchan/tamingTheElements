import {
  CHARGE_COOLDOWN_TICKS, CHARGE_DAMAGE, CHARGE_MAX_STEP_PX, CHARGE_SPEED_MULT, CHARGE_TICKS, ChargeEnd, METER_CHARGE,
} from '../../../data/arcade';
import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../../math/dir8';
import { isAlive } from '../../alloc';
import { isArcade, now } from '../../clock';
import type { Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, TEAM_COUNT, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { castDir, setAim } from './aim';
import { pending, Press, usePress } from './buffer';
import { applyArcadeHit, CHARGE_DEF } from './hit';
import { gainMeter, RANGED } from './meter';
import { controlledId } from '../movement';
import { endCharge } from './charge-move';
import { canAct, chargeTick, isInvulnerable, isStunned } from './stun';

const alive = (s: SimState, id: number): boolean => id >= 0 && isAlive(s, id);

/** The 8-way direction from `id` towards `foe` (FUN-DESIGN 2.17): a diagonal unless one axis offset is 2x the other. */
function chargeDir(s: SimState, id: number, foe: number): number {
  const dx = (s.x[foe] ?? 0) + (s.w[foe] ?? 0) / 2 - (s.x[id] ?? 0) - (s.w[id] ?? 0) / 2;
  const dy = (s.y[foe] ?? 0) + (s.h[foe] ?? 0) / 2 - (s.y[id] ?? 0) - (s.h[id] ?? 0) / 2;
  const d = dir8FromSigns(Math.abs(dx) * 2 <= Math.abs(dy) ? 0 : dx, Math.abs(dy) * 2 <= Math.abs(dx) ? 0 : dy);
  return d >= 0 ? d : castDir(s, id);
}

/**
 * Starts `team`'s charge (FUN-DESIGN 2.17) on a pending charge press when the controlled melee hero (primary not
 * ranged) is ready, free, out of cast recovery and not guarding. It rushes towards `foe` (the cast direction without
 * one) at min(CHARGE_SPEED_MULT x `speed`, CHARGE_MAX_STEP_PX) per axis (in `vx`/`vy`; `stepCharge` moves it).
 * Emits `chargeStarted {dir}`. Called by the `input` slot on unfrozen ticks with the controlled ids of the team and its opponent.
 */
export function startCharge(world: SimWorld, sink: EventSink, team: number, id: number, foe: number): void {
  const s = world.state;
  const g = now(s);
  if (id < 0 || !pending(s, team, Press.charge) || RANGED[s.defId[id] ?? 0] !== 0) return;
  if (g < (s.arcade[id * ARCADE_E + ArcadeE.chargeReadyAt] ?? 0) || !canAct(world, id)) return;
  const dir = alive(s, foe) ? chargeDir(s, id, foe) : castDir(s, id);
  const step = Math.min((s.speed[id] ?? 0) * CHARGE_SPEED_MULT, CHARGE_MAX_STEP_PX);
  s.vx[id] = (DIR8_X[dir] ?? 0) * step;
  s.vy[id] = (DIR8_Y[dir] ?? 0) * step;
  setAim(s, id, dir);
  s.arcade[id * ARCADE_E + ArcadeE.chargeUntil] = g + CHARGE_TICKS;
  s.arcade[id * ARCADE_E + ArcadeE.chargeReadyAt] = g + CHARGE_COOLDOWN_TICKS;
  usePress(s, team, Press.charge);
  sink.emit(id, SimEventKind.chargeStarted, { dir });
}

/**
 * The contact half of a charge tick, run after movement in the `collision` slot for each team's controlled hero:
 * touching a vulnerable `foe` ends the charge as `arrived` with the arrival hit (a light CHARGE_DAMAGE hit with
 * CHARGE_STUN_TICKS of hit-stun: guard chips it, a parry stuns the charger), METER_CHARGE and a free primary for the
 * next tick. A foe on invulnerable ticks (a dash) is passed through. The last tick ends it as `expired`.
 */
export function chargeSystem(world: SimWorld, _cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  if (!isArcade(s)) return;
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    if (id < 0 || chargeTick(s, id) === 0) continue;
    const foe = controlledId(world, 1 - team);
    const touch = alive(s, foe) && !isInvulnerable(s, foe) &&
      (s.x[id] ?? 0) < (s.x[foe] ?? 0) + (s.w[foe] ?? 0) && (s.x[foe] ?? 0) < (s.x[id] ?? 0) + (s.w[id] ?? 0) &&
      (s.y[id] ?? 0) < (s.y[foe] ?? 0) + (s.h[foe] ?? 0) && (s.y[foe] ?? 0) < (s.y[id] ?? 0) + (s.h[id] ?? 0);
    if (touch) {
      endCharge(s, sink, id, ChargeEnd.arrived);
      applyArcadeHit(world, sink, id, id, foe, CHARGE_DAMAGE, CHARGE_DEF, castDir(s, id));
      gainMeter(s, sink, id, team, METER_CHARGE);
      if (!isStunned(s, id)) {
        const b = ARCADE_TEAM_BASE + team * ARCADE_T;
        s.arcade[b + ArcadeT.pressTick + Press.primary] = now(s) + 1;
        s.arcade[b + ArcadeT.pressUsed] = (s.arcade[b + ArcadeT.pressUsed] ?? 0) & ~(1 << Press.primary);
      }
    } else if (chargeTick(s, id) === CHARGE_TICKS) endCharge(s, sink, id, ChargeEnd.expired);
  }
}
