/** Axis-aligned box: top-left corner plus size. */
export interface Aabb {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** True when the interiors overlap (touching edges do not count). */
export function aabbOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function aabbContainsPoint(a: Aabb, px: number, py: number): boolean {
  return px >= a.x && px < a.x + a.w && py >= a.y && py < a.y + a.h;
}
