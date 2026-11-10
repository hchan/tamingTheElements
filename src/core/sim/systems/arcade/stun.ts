import {
  COMBO_STUN_CAP_TICKS, JUGGLE_LIMIT, JUGGLE_STUN_STEP, MIN_HIT_STUN_TICKS, RECOVERY_INVULN_TICKS, RecoveredReason,
} from '../../../data/arcade';
import { isArcade, now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, MAX_ENTITIES, type SimState,
} from '../../state';
import type { SimWorld } from '../../world';

/** True while an Arcade hit-stun holds `id` (`stunUntil` is in game ticks). Never true in Classic. */
export function isStunned(s: SimState, id: number): boolean {
  return isArcade(s) && (s.arcade[id * ARCADE_E + ArcadeE.stunUntil] ?? 0) > now(s);
}

/** True while `id` is invulnerable in Arcade: projectiles pass through it and melee does not touch it. */
export function isInvulnerable(s: SimState, id: number): boolean {
  return isArcade(s) && (s.arcade[id * ARCADE_E + ArcadeE.invulnUntil] ?? 0) > now(s);
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
 * Whether `id` may move or cast (FUN-DESIGN 2.1). Classic: not frozen, exactly the old check. Arcade: also not
 * stunned and not casting a super (guard, dash recovery and the round phase join with their work packages).
 */
export function canAct(world: SimWorld, id: number): boolean {
  const s = world.state;
  return ((s.flags[id] ?? 0) & EntityFlag.frozen) === 0 && !isStunned(s, id) && !inSuper(s, id);
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
 * the stun with `recovered` (reason 1 or 2) and 20 ticks of invulnerability instead.
 */
export function applyStun(world: SimWorld, sink: EventSink, source: number, victim: number, base: number): void {
  const s = world.state;
  const a = s.arcade;
  const e = victim * ARCADE_E;
  const g = now(s);
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
