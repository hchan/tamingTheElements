import { CLASH_FLOOR_DIV, CLASH_LOSER_DIV, METER_CLASH } from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import { ELEMENTS, elementRelation, type Element } from '../../../data/elements';
import { freeEntity } from '../../alloc';
import { isArcade } from '../../clock';
import type { Command } from '../../commands';
import { SimEventKind, type EventSink } from '../../events';
import { EntityFlag, EntityKind, MAX_ENTITIES, type SimState } from '../../state';
import type { SimWorld } from '../../world';
import { releaseCount, SUPER_BULLET } from '../ability-info';
import { gainMeter } from './meter';

const live = (s: SimState, id: number): boolean =>
  s.kind[id] === EntityKind.projectile && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0;

/** Bit `id` of the two 32-bit masks `lo` (ids 0..31) and `hi` (32..63). */
const used = (lo: number, hi: number, id: number): boolean => ((id < 32 ? lo >>> id : hi >>> (id - 32)) & 1) === 1;

/** A projectile's element is its owner's (a reflected projectile carries the parrier's). */
const elementOf = (s: SimState, id: number): Element => CHARACTERS[s.defId[s.owner[id] ?? 0] ?? 0]?.element ?? 'void';

/** The advantaged projectile's damage after a clash: `hp - loserHp / 2`, never below a quarter of its own (exact halves). */
export function clashHp(hp: number, loserHp: number): number {
  return Math.max(hp - loserHp / CLASH_LOSER_DIV, hp / CLASH_FLOOR_DIV);
}

/** Overlap of the interiors, inline (no box objects: this runs up to 2016 times a tick). */
function overlap(s: SimState, i: number, j: number): boolean {
  const xi = s.x[i] ?? 0;
  const yi = s.y[i] ?? 0;
  const xj = s.x[j] ?? 0;
  const yj = s.y[j] ?? 0;
  return xi < xj + (s.w[j] ?? 0) && xj < xi + (s.w[i] ?? 0) && yi < yj + (s.h[j] ?? 0) && yj < yi + (s.h[i] ?? 0);
}

/** Frees a clashed projectile; its active count goes back to its owner, as when it leaves the arena. */
function destroy(s: SimState, id: number): void {
  if ((s.hitMask[id] ?? 0) !== SUPER_BULLET) releaseCount(s, s.owner[id] ?? 0, s.defId[id] ?? 0);
  freeEntity(s, id);
}

function clash(s: SimState, sink: EventSink, a: number, b: number): void {
  const ea = elementOf(s, a);
  const eb = elementOf(s, b);
  const rel = elementRelation(ea, eb);
  const winner = rel === 'adv' ? a : rel === 'dis' ? b : -1;
  const ta = s.team[a] ?? 0;
  const tb = s.team[b] ?? 0;
  const xa = s.x[a] ?? 0;
  const ya = s.y[a] ?? 0;
  const xb = s.x[b] ?? 0;
  const yb = s.y[b] ?? 0;
  // The centre of the overlap, for the view's burst (whole pixels).
  const x = Math.round((Math.max(xa, xb) + Math.min(xa + (s.w[a] ?? 0), xb + (s.w[b] ?? 0))) / 2);
  const y = Math.round((Math.max(ya, yb) + Math.min(ya + (s.h[a] ?? 0), yb + (s.h[b] ?? 0))) / 2);
  sink.emit(a, SimEventKind.clash, { a, b, winner, x, y, ea: ELEMENTS.indexOf(ea), eb: ELEMENTS.indexOf(eb) });
  const hpa = s.hp[a] ?? 0;
  const hpb = s.hp[b] ?? 0;
  if (winner === a) s.hp[a] = clashHp(hpa, hpb);
  else destroy(s, a);
  if (winner === b) s.hp[b] = clashHp(hpb, hpa);
  else destroy(s, b);
  gainMeter(s, sink, a, ta, METER_CLASH);
  gainMeter(s, sink, b, tb, METER_CLASH);
}

/**
 * The `collision` slot (FUN-DESIGN 2.9), after the projectiles moved, hit and fired: live projectiles of different teams
 * whose boxes overlap clash, pairs `i < j` in ascending id order, each projectile in at most one clash per tick. By the
 * owners' elements (`elementRelation`, the cycle fire > air > earth > water > fire), the advantaged projectile survives
 * with `clashHp` and the other is destroyed; the same element, void and the neutral pairs (fire and earth, air and
 * water) destroy both. Emits `clash {a, b, winner (-1: both destroyed), x, y, ea, eb}` (the overlap centre and the
 * ELEMENTS indices, for the view), then METER_CLASH to each side. Runs on unfrozen ticks only (the freeze gate), sets
 * no hit-stop, and returns at once in Classic, where projectiles pass through each other.
 */
export function arcadeClashSystem(world: SimWorld, _cmds: readonly [Command, Command], sink: EventSink): void {
  const s = world.state;
  if (!isArcade(s)) return;
  // Ids already in a clash this tick, as two 32-bit masks (no allocation). `i` only grows, so only `j` is marked.
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (!live(s, i) || used(lo, hi, i)) continue;
    for (let j = i + 1; j < MAX_ENTITIES; j++) {
      if (!live(s, j) || s.team[j] === s.team[i] || used(lo, hi, j) || !overlap(s, i, j)) continue;
      if (j < 32) lo |= 1 << j;
      else hi |= 1 << (j - 32);
      clash(s, sink, i, j);
      break;
    }
  }
}
