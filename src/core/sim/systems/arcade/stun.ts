import {
  CHARGE_TICKS, ChargeEnd, COMBO_STUN_CAP_TICKS, DASH_INVULN_FROM, DASH_INVULN_TO, DASH_RECOVERY_TICKS, DASH_TICKS, JUGGLE_LIMIT, JUGGLE_STUN_STEP,
  MIN_HIT_STUN_TICKS, RECOVERY_INVULN_TICKS, RecoveredReason, WEATHER_COOLDOWN_TICKS, WEATHER_RECOVERY_TICKS,
} from '../../../data/arcade';
import { inFight, isArcade, now } from '../../clock';
import { Cmd } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, MAX_ENTITIES, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';
import { endCharge } from './charge-move';

/** True while an Arcade hit-stun holds `id` (`stunUntil` is in game ticks). Never true in Classic. */
export function isStunned(s: SimState, id: number): boolean {
  return isArcade(s) && (s.arcade[id * ARCADE_E + ArcadeE.stunUntil] ?? 0) > now(s);
}

/** The 1-based tick of `id`'s dash this game tick (FUN-DESIGN 2.7), 0 when it is not dashing. Always 0 in Classic. */
export function dashTick(s: SimState, id: number): number {
  const until = s.arcade[id * ARCADE_E + ArcadeE.dashUntil] ?? 0;
  const g = now(s);
  return g < until ? g - until + DASH_TICKS + 1 : 0;
}

/** The 1-based tick of `id`'s charge this game tick (FUN-DESIGN 2.17), 0 when it is not charging. Always 0 in Classic. */
export function chargeTick(s: SimState, id: number): number {
  const until = s.arcade[id * ARCADE_E + ArcadeE.chargeUntil] ?? 0;
  const g = now(s);
  return g < until ? g - until + CHARGE_TICKS + 1 : 0;
}

/** True on `id`'s invulnerable dash ticks (DASH_INVULN_FROM..DASH_INVULN_TO). */
export function isDashInvulnerable(s: SimState, id: number): boolean {
  const t = dashTick(s, id);
  return t >= DASH_INVULN_FROM && t <= DASH_INVULN_TO;
}

/**
 * True while `id` is invulnerable in Arcade: projectiles pass through it and melee does not touch it. Outside the
 * `fight` phase (intro, KO, round end) everyone is, and a dasher is on its invulnerable dash ticks.
 */
export function isInvulnerable(s: SimState, id: number): boolean {
  const until = s.arcade[id * ARCADE_E + ArcadeE.invulnUntil] ?? 0;
  return isArcade(s) && (until > now(s) || !inFight(s) || isDashInvulnerable(s, id));
}

/**
 * True while `id` casts a super (arcade/super.ts): its team's `superState` holds the super entity id + 1 and `id` owns
 * it. Never true in Classic.
 */
export function inSuper(s: SimState, id: number): boolean {
  if (!isArcade(s)) return false;
  const fx = (s.arcade[ARCADE_TEAM_BASE + (s.team[id] ?? 0) * ARCADE_T + ArcadeT.superState] ?? 0) - 1;
  return fx >= 0 && s.owner[fx] === id;
}

/**
 * True in `id`'s WEATHER_RECOVERY_TICKS after its weather cast (FUN-DESIGN 2.14), read from its `weatherReadyAt` (0
 * before a first cast, so never true then, nor in Classic).
 */
export const inWeatherRecovery = (s: SimState, id: number): boolean =>
  now(s) < (s.arcade[id * ARCADE_E + ArcadeE.weatherReadyAt] ?? 0) - WEATHER_COOLDOWN_TICKS + WEATHER_RECOVERY_TICKS;

/**
 * `canAct` without the cast recovery (the `frozen` flag) and the guard: not stunned nor block-stunned, not casting a
 * super, in the `fight` phase, not dashing nor in the DASH_RECOVERY_TICKS after a dash, and not in weather recovery.
 * Always true in Classic (the block is empty).
 */
export function isFree(s: SimState, id: number): boolean {
  const e = id * ARCADE_E;
  const dash = s.arcade[e + ArcadeE.dashUntil] ?? 0;
  const g = now(s);
  return !isStunned(s, id) && !inSuper(s, id) && inFight(s) && !(dash > 0 && g < dash + DASH_RECOVERY_TICKS) &&
    (s.arcade[e + ArcadeE.chargeUntil] ?? 0) <= g &&
    (s.arcade[e + ArcadeE.blockUntil] ?? 0) <= g && !inWeatherRecovery(s, id);
}

/** `isFree` and out of cast recovery: `canAct` without the guard (Classic's whole `canAct`). */
export const isReady = (s: SimState, id: number): boolean => ((s.flags[id] ?? 0) & EntityFlag.frozen) === 0 && isFree(s, id);

/** True while `id`'s team holds `Cmd.guard` (its `prevCmd`, this tick's command). Never true in Classic. */
const guardHeld = (s: SimState, id: number): boolean =>
  ((s.arcade[ARCADE_TEAM_BASE + (s.team[id] ?? 0) * ARCADE_T + ArcadeT.prevCmd] ?? 0) & Cmd.guard) !== 0;

/**
 * True while `id` guards (FUN-DESIGN 2.8): block-stunned, or holding `Cmd.guard` while it could act otherwise. Only
 * the controlled character is ever hit, so the team's held guard is its own.
 */
export function isGuarding(s: SimState, id: number): boolean {
  return (s.arcade[id * ARCADE_E + ArcadeE.blockUntil] ?? 0) > now(s) || (guardHeld(s, id) && isReady(s, id));
}

/**
 * Whether `id` may move or cast (FUN-DESIGN 2.1). Classic: not frozen, exactly the old check. Arcade: also `isFree`
 * and not holding guard.
 */
export function canAct(world: SimWorld, id: number): boolean {
  const s = world.state;
  return isReady(s, id) && !guardHeld(s, id);
}

/** Ends the victim's combo early: no stun, a fresh juggle and stun budget, RECOVERY_INVULN_TICKS of invulnerability. */
function recover(s: SimState, sink: EventSink, source: number, victim: number, reason: number): void {
  const e = victim * ARCADE_E;
  const g = now(s);
  s.arcade[e + ArcadeE.stunUntil] = g;
  s.arcade[e + ArcadeE.juggle] = 0;
  s.arcade[e + ArcadeE.comboStunTotal] = 0;
  s.arcade[e + ArcadeE.wallBounced] = 0;
  s.arcade[e + ArcadeE.invulnUntil] = g + RECOVERY_INVULN_TICKS;
  sink.emit(source, SimEventKind.recovered, { id: victim, reason });
}

/**
 * Emits `recovered` (reason 0) for each live character whose stun ran out, once: a stun is live while
 * `comboStunTotal > 0`, which the caps already zero when they end a stun (with their own `recovered`).
 */
export function expireStuns(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  const g = now(s);
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const e = id * ARCADE_E;
    if ((s.arcade[e + ArcadeE.comboStunTotal] ?? 0) === 0 || (s.arcade[e + ArcadeE.stunUntil] ?? 0) > g) continue;
    s.arcade[e + ArcadeE.comboStunTotal] = 0;
    if (((s.flags[id] ?? 0) & (EntityFlag.alive | EntityFlag.dead)) !== EntityFlag.alive) continue;
    sink.emit(id, SimEventKind.recovered, { id, reason: RecoveredReason.stunEnded });
  }
}

/**
 * Applies `base` ticks of hit-stun to `victim` (FUN-DESIGN 2.3). A hit on a free victim starts a combo (juggle 0, stun
 * budget and wall bounce reset); a hit while stunned raises `juggle` and stuns `base - 2 * juggle`, never under 6.
 * Stun only extends (`stunUntil` never moves back) and `comboStunTotal` sums the extensions, so the chain is exactly
 * `comboStunTotal` game ticks long. Caps: a hit at `juggle >= 5`, or one that would push the chain past 150 ticks, ends
 * the stun with `recovered` (reason 1 or 2) and 20 ticks of invulnerability instead. Either way it ends the victim's
 * dash (its DASH_RECOVERY_TICKS still follow) or charge (`chargeEnded`, reason interrupted).
 */
export function applyStun(world: SimWorld, sink: EventSink, source: number, victim: number, base: number): void {
  const s = world.state;
  const a = s.arcade;
  const e = victim * ARCADE_E;
  const g = now(s);
  if ((a[e + ArcadeE.dashUntil] ?? 0) > g) a[e + ArcadeE.dashUntil] = g;
  if ((a[e + ArcadeE.chargeUntil] ?? 0) > g) endCharge(s, sink, victim, ChargeEnd.interrupted);
  const until = a[e + ArcadeE.stunUntil] ?? 0;
  if (until <= g) {
    a[e + ArcadeE.juggle] = 0;
    a[e + ArcadeE.comboStunTotal] = 0;
    a[e + ArcadeE.wallBounced] = 0;
  } else if ((a[e + ArcadeE.juggle] ?? 0) >= JUGGLE_LIMIT) {
    recover(s, sink, source, victim, RecoveredReason.juggleCap);
    return;
  } else {
    a[e + ArcadeE.juggle] = (a[e + ArcadeE.juggle] ?? 0) + 1;
  }
  const ticks = Math.max(MIN_HIT_STUN_TICKS, base - JUGGLE_STUN_STEP * (a[e + ArcadeE.juggle] ?? 0));
  const added = g + ticks - Math.max(until, g);
  if (added <= 0) return;
  const total = (a[e + ArcadeE.comboStunTotal] ?? 0) + added;
  if (total > COMBO_STUN_CAP_TICKS) {
    recover(s, sink, source, victim, RecoveredReason.stunCap);
    return;
  }
  a[e + ArcadeE.stunUntil] = g + ticks;
  a[e + ArcadeE.comboStunTotal] = total;
}
