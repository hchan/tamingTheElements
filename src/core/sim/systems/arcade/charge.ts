import {
  CHARGE_COOLDOWN_TICKS, CHARGE_DAMAGE, CHARGE_MAX_STEP_PX, CHARGE_SPEED_MULT, CHARGE_TICKS, ChargeEnd, METER_CHARGE,
} from '../../../data/arcade';
import { DIR8_X, DIR8_Y } from '../../../math/dir8';
import { isArcade, now } from '../../clock';
import type { Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ArcadeE, TEAM_COUNT } from '../../state';
import type { SimWorld } from '../../world';
import { castDir, dirToward, setAim } from './aim';
import { pending, Press, usePress } from './buffer';
import { applyArcadeHit, CHARGE_DEF } from './hit';
import { gainMeter, RANGED } from './meter';
import { controlledId, facingFor } from '../movement';
import { endCharge } from './charge-move';
import { canAct, chargeTick, isInvulnerable } from './stun';
import { isRooted } from './snag';

/**
 * Starts `team`'s charge (FUN-DESIGN 2.17) on a pending charge press when the controlled melee hero (primary not
 * ranged) is ready, free, out of cast recovery and not guarding. It rushes towards `foe` (the cast direction without
 * one) at min(CHARGE_SPEED_MULT x `speed`, CHARGE_MAX_STEP_PX) per axis (in `vx`/`vy`; `stepCharge` moves it).
 * Emits `chargeStarted {dir}`. Called by the `input` slot on unfrozen ticks with the controlled ids of the team and its opponent.
 */
export function startCharge(world: SimWorld, sink: EventSink, team: number, id: number, foe: number): void {
  const s = world.state;
  const g = now(s);
  if (id < 0 || !pending(s, team, Press.charge) || RANGED[s.defId[id] ?? 0]) return;
  if (g < (s.arcade[id * ARCADE_E + ArcadeE.chargeReadyAt] ?? 0) || !canAct(world, id) || isRooted(s, id)) return;
  const dir = foe >= 0 ? dirToward(s, id, foe) : castDir(s, id);
  const step = Math.min((s.speed[id] ?? 0) * CHARGE_SPEED_MULT, CHARGE_MAX_STEP_PX);
  const ax = DIR8_X[dir] ?? 0;
  const ay = DIR8_Y[dir] ?? 0;
  s.vx[id] = ax * step;
  s.vy[id] = ay * step;
  setAim(s, id, dir);
  s.dir[id] = facingFor(ax, ay, s.dir[id] ?? 0);
  s.arcade[id * ARCADE_E + ArcadeE.chargeUntil] = g + CHARGE_TICKS;
  s.arcade[id * ARCADE_E + ArcadeE.chargeReadyAt] = g + CHARGE_COOLDOWN_TICKS;
  usePress(s, team, Press.charge);
  sink.emit(id, SimEventKind.chargeStarted, { dir });
}

/**
 * The contact half of a charge tick, run after movement in the `collision` slot for each team's controlled hero:
 * touching a vulnerable `foe` ends the charge as `arrived` with the arrival hit (a medium CHARGE_DAMAGE hit with
 * CHARGE_STUN_TICKS of hit-stun: guard chips it, a parry stuns the charger), and METER_CHARGE. A foe on invulnerable ticks (a dash) is passed through. The last tick ends it as `expired`.
 */
export function chargeSystem(world: SimWorld, _cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  if (!isArcade(s)) return;
  for (let team = 0; team < TEAM_COUNT; team++) {
    const id = controlledId(world, team);
    if (id < 0 || chargeTick(s, id) === 0) continue;
    const foe = controlledId(world, 1 - team);
    const touch = foe >= 0 && !isInvulnerable(s, foe) &&
      (s.x[id] ?? 0) < (s.x[foe] ?? 0) + (s.w[foe] ?? 0) && (s.x[foe] ?? 0) < (s.x[id] ?? 0) + (s.w[id] ?? 0) &&
      (s.y[id] ?? 0) < (s.y[foe] ?? 0) + (s.h[foe] ?? 0) && (s.y[foe] ?? 0) < (s.y[id] ?? 0) + (s.h[id] ?? 0);
    if (touch) {
      endCharge(s, sink, id, ChargeEnd.arrived);
      applyArcadeHit(world, sink, id, id, foe, CHARGE_DAMAGE, CHARGE_DEF, castDir(s, id));
      gainMeter(s, sink, id, team, METER_CHARGE);
    } else if (chargeTick(s, id) === CHARGE_TICKS) endCharge(s, sink, id, ChargeEnd.expired);
  }
}
