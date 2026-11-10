import {
  DASH_CANCEL_TICKS, DASH_COOLDOWN_TICKS, DASH_SPEED_MULT, DASH_TICKS, METER_PERFECT_DODGE,
} from '../../../data/arcade';
import { DIR8_X, DIR8_Y, dir8FromSigns } from '../../../math/dir8';
import { now } from '../../clock';
import { cmdAxisX, cmdAxisY, type Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { castDir } from './aim';
import { pending, Press, usePress } from './buffer';
import { gainMeter } from './meter';
import { isDashInvulnerable, isFree } from './stun';

/**
 * Starts `team`'s dash (FUN-DESIGN 2.7) on a pending dash press (a `Cmd.dash` edge or a double tap, buffered like the
 * attacks) when the controlled character is free (`isFree`), its dash is ready and it is out of cast recovery, or its
 * team confirmed a hit 0..DASH_CANCEL_TICKS game ticks ago (the dash cancel: the recovery ends now). The dash runs
 * along the held direction, else the aim (facing and aim are left to movement), at DASH_SPEED_MULT x `speed` (in
 * `vx`/`vy`; movement steps it). Emits `dashed {dir}`. Called by the `input` slot on unfrozen ticks, team 0 first.
 */
export function startDash(world: SimWorld, sink: EventSink, team: number, raw: Command): void {
  const s = world.state;
  const id = controlledId(world, team);
  const e = id * ARCADE_E;
  const g = now(s);
  if (id < 0 || !pending(s, team, Press.dash) || g < (s.arcade[e + ArcadeE.dashReadyAt] ?? 0) || !isFree(s, id)) return;
  const cancel = ((s.flags[id] ?? 0) & EntityFlag.frozen) !== 0;
  const confirm = s.arcade[ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.confirmTick] ?? 0;
  if (cancel && (confirm === 0 || g + 1 - confirm > DASH_CANCEL_TICKS)) return;
  s.flags[id] = (s.flags[id] ?? 0) & ~EntityFlag.frozen;
  const held = dir8FromSigns(cmdAxisX(raw), cmdAxisY(raw));
  const dir = held >= 0 ? held : castDir(s, id);
  const speed = (s.speed[id] ?? 0) * DASH_SPEED_MULT;
  s.vx[id] = (DIR8_X[dir] ?? 0) * speed;
  s.vy[id] = (DIR8_Y[dir] ?? 0) * speed;
  s.arcade[e + ArcadeE.dashUntil] = g + DASH_TICKS;
  s.arcade[e + ArcadeE.dashReadyAt] = g + DASH_COOLDOWN_TICKS;
  s.arcade[e + ArcadeE.dashDodged] = 0;
  usePress(s, team, Press.dash);
  sink.emit(id, SimEventKind.dashed, { dir });
}

/**
 * Called when enemy projectile `id` overlaps invulnerable `target` (and passes through): a perfect dodge when `target`
 * is on its invulnerable dash ticks, once per dash: `perfectDodge {projectile}` and METER_PERFECT_DODGE for the dodger.
 */
export function checkPerfectDodge(s: SimState, sink: EventSink, id: number, target: number): void {
  const flag = target * ARCADE_E + ArcadeE.dashDodged;
  if (!isDashInvulnerable(s, target) || s.arcade[flag] !== 0) return;
  s.arcade[flag] = 1;
  sink.emit(target, SimEventKind.perfectDodge, { projectile: id });
  gainMeter(s, sink, target, s.team[target] ?? 0, METER_PERFECT_DODGE);
}
