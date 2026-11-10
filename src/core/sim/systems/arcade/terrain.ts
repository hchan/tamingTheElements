/**
 * Stage terrain queries (FUN-DESIGN 2.15, WP-arcade-terrain): the pure reads and the per-hero rules that movement, the
 * projectile pass and the hit path call. The layout, the swap and the per-tick pass are in terrain-layout.ts (which
 * needs `controlledId`, so it cannot be imported by movement without a cycle).
 */
import { WEATHER_ELEMENTS } from '../../../data/arcade';
import { CHARACTERS } from '../../../data/characters';
import type { Element } from '../../../data/elements';
import { TERRAIN_AIR_PM, TERRAIN_CAP_PM, TERRAIN_FIRE_PM } from '../../arcade-numbers';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_WORLD_BASE, ArcadeW, type SimState } from '../../state';

const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const STAGE = AW(ArcadeW.stage);
const COUNT = AW(ArcadeW.patchCount);
const P0 = AW(ArcadeW.patches);
const EARTH = 3;

/** The weather kind of an element: 1 fire, 2 water, 3 earth, 4 air, 5 void (also the stage kind of that element). */
export function elementKind(el: Element | undefined): number {
  return WEATHER_ELEMENTS.findIndex((r) => r[0] === el) + 1;
}

/** The stage element (a weather kind 1..4; 0 before round 1 and in Classic). */
export function stageOf(s: SimState): number {
  return s.arcade[STAGE] ?? 0;
}

/** The element kind of character `id` (see `elementKind`). */
export function kindOf(s: SimState, id: number): number {
  return elementKind(CHARACTERS[s.defId[id] ?? 0]?.element);
}

/** Index of the first patch whose interior overlaps the box (a zero-size box is a point), or -1. */
export function patchOver(s: SimState, x: number, y: number, w: number, h: number): number {
  const a = s.arcade;
  for (let i = 0, n = a[COUNT] ?? 0; i < n; i++) {
    const p = P0 + i * 4;
    const px = a[p] ?? 0;
    const py = a[p + 1] ?? 0;
    if (x < px + (a[p + 2] ?? 0) && px < x + w && y < py + (a[p + 3] ?? 0) && py < y + h) return i;
  }
  return -1;
}

/** The live patches as fresh plain rectangles (for observation views; never aliases the state). */
export function patchRects(s: SimState): { x: number; y: number; w: number; h: number }[] {
  const a = s.arcade;
  return Array.from({ length: a[COUNT] ?? 0 }, (_, i) => ({
    x: a[P0 + i * 4] ?? 0, y: a[P0 + i * 4 + 1] ?? 0, w: a[P0 + i * 4 + 2] ?? 0, h: a[P0 + i * 4 + 3] ?? 0,
  }));
}

/** True when `id` is of the stage's element and its centre is inside a patch: the patch effect applies to it. */
export function onPatch(s: SimState, id: number): boolean {
  const k = stageOf(s);
  return k !== 0 && kindOf(s, id) === k && patchOver(s, (s.x[id] ?? 0) + (s.w[id] ?? 0) / 2, (s.y[id] ?? 0) + (s.h[id] ?? 0) / 2, 0, 0) >= 0;
}

/** Damage pm of an attacker `id` (FUN-DESIGN 2.15): TERRAIN_FIRE_PM on a fire patch, else 1000. */
export function terrainDamagePm(s: SimState, id: number): number {
  return stageOf(s) === 1 && onPatch(s, id) ? TERRAIN_FIRE_PM : 1000;
}

/**
 * `charted` (the hit after chart and weather) with the terrain modifier `pm` on top, the total modifier capped at
 * TERRAIN_CAP_PM of `plain` (the hit without chart, weather and terrain) and never below `charted`.
 */
export function capDamage(charted: number, pm: number, plain: number): number {
  return Math.max(charted, Math.min((charted * pm) / 1000, (plain * TERRAIN_CAP_PM) / 1000));
}

/** Speed pm of `id` on an air patch (FUN-DESIGN 2.15), capped; 1000 elsewhere. A dash sets its own speed (no stacking). */
export function terrainSpeedPm(s: SimState, id: number): number {
  return stageOf(s) === 4 && onPatch(s, id) ? Math.min(TERRAIN_AIR_PM, TERRAIN_CAP_PM) : 1000;
}

/**
 * Rock clamp (FUN-DESIGN 2.15): on an earth stage a hero of another element that moved into a rock goes back to
 * (x0, y0), like a wall; true then. A hero already inside one (a tag-in on an earth hero's spot) walks out freely.
 */
export function rockStop(s: SimState, id: number, x0: number, y0: number): boolean {
  if (stageOf(s) !== EARTH || kindOf(s, id) === EARTH) return false;
  const w = s.w[id] ?? 0;
  const h = s.h[id] ?? 0;
  if (patchOver(s, s.x[id] ?? 0, s.y[id] ?? 0, w, h) < 0 || patchOver(s, x0, y0, w, h) >= 0) return false;
  s.x[id] = x0;
  s.y[id] = y0;
  return true;
}

/** A projectile that ends on a rock (every owner but an earth hero); the caller removes it. Emits `projectileBlocked`. */
export function shotBlocked(s: SimState, sink: EventSink, id: number): boolean {
  if (stageOf(s) !== EARTH || kindOf(s, s.owner[id] ?? 0) === EARTH) return false;
  if (patchOver(s, s.x[id] ?? 0, s.y[id] ?? 0, s.w[id] ?? 0, s.h[id] ?? 0) < 0) return false;
  sink.emit(id, SimEventKind.projectileBlocked, { x: s.x[id] ?? 0, y: s.y[id] ?? 0 });
  return true;
}
