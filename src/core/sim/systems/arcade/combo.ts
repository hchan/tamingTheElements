import { Q4_ONE } from '../../../data/arcade';
import { now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_T, ARCADE_TEAM_BASE, ArcadeT, EntityFlag, TEAM_COUNT, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { controlledId } from '../movement';
import { inSuper, isStunned } from './stun';

const teamBase = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T;

/** Emits `comboEnded {team, hits, damage}` for `team`'s live combo and clears its counter. */
function endCombo(s: SimState, sink: EventSink, source: number, team: number): void {
  const b = teamBase(team);
  const a = s.arcade;
  sink.emit(source, SimEventKind.comboEnded, {
    team, hits: a[b + ArcadeT.comboHits] ?? 0, damage: (a[b + ArcadeT.comboDamageQ4] ?? 0) / Q4_ONE,
  });
  a[b + ArcadeT.comboHits] = 0;
  a[b + ArcadeT.comboDamageQ4] = 0;
  a[b + ArcadeT.comboStart] = 0;
}

/**
 * Counts a hit by `team` on `victim` (FUN-DESIGN 2.4) and returns its 1-based combo index. Call it before the hit's
 * stun: a hit on a stunned victim continues the combo, any other hit ends the live one (`comboEnded`) and starts at 1.
 */
export function comboHit(world: SimWorld, sink: EventSink, source: number, team: number, victim: number): number {
  const s = world.state;
  const b = teamBase(team);
  let hits = s.arcade[b + ArcadeT.comboHits] ?? 0;
  if (!isStunned(s, victim)) {
    if (hits > 0) endCombo(s, sink, source, team);
    hits = 0;
  }
  if (hits === 0) s.arcade[b + ArcadeT.comboStart] = now(s);
  s.arcade[b + ArcadeT.comboHits] = hits + 1;
  return hits + 1;
}

/** Adds a hit's (scaled) damage to `team`'s combo total, kept in Q4 so it stays an Int32. */
export function addComboDamage(s: SimState, team: number, amount: number): void {
  const i = teamBase(team) + ArcadeT.comboDamageQ4;
  s.arcade[i] = (s.arcade[i] ?? 0) + Math.round(amount * Q4_ONE);
}

/**
 * True when the victim was in its own cast recovery (melee `delayAfterAttack`, the `frozen` flag in Arcade) or casting
 * a super (it cannot act until `superEnded`).
 */
export function isCounterHit(s: SimState, victim: number): boolean {
  return ((s.flags[victim] ?? 0) & EntityFlag.frozen) !== 0 || inSuper(s, victim);
}

/** Ends every combo whose victim (the opposing team's controlled character) is no longer stunned. */
export function expireCombos(world: SimWorld, sink: EventSink): void {
  const s = world.state;
  for (let team = 0; team < TEAM_COUNT; team++) {
    if ((s.arcade[teamBase(team) + ArcadeT.comboHits] ?? 0) === 0) continue;
    const victim = controlledId(world, 1 - team);
    if (victim >= 0 && isStunned(s, victim)) continue;
    endCombo(s, sink, Math.max(victim, 0), team);
  }
}
