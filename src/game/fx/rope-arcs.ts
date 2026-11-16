/**
 * Pure geometry for the Snag rope wraps (pseudo-3D slice P3D-3): each loop is a flat ellipse round the feet, split into a near
 * half (lower on screen, drawn over the body) and a far half (higher, drawn behind it). A half is HALF_SEGS segments from a unit
 * point table, and the loop grows in by revealing segments from each end. No Phaser; the table is built once.
 */
export const HALF_SEGS = 16;
/** View ticks the wraps take to close round the feet (reduced motion shows them closed at once). */
export const ROPE_GROW_TICKS = 8;

const NEAR = new Float64Array((HALF_SEGS + 1) * 2);
const FAR = new Float64Array((HALF_SEGS + 1) * 2);
for (let i = 0; i <= HALF_SEGS; i++) {
  const a = (Math.PI * i) / HALF_SEGS;
  NEAR[i * 2] = Math.cos(a);
  NEAR[i * 2 + 1] = Math.sin(a);
  FAR[i * 2] = -Math.cos(a);
  FAR[i * 2 + 1] = -Math.sin(a);
}

/** Unit-ellipse point `i` (0..HALF_SEGS) of the near (y >= 0, below the centre) or far (y <= 0) half: x at `[0]`, y at `[1]`. */
export function halfPoint(far: boolean, i: number, out: [number, number]): void {
  const t = far ? FAR : NEAR;
  const j = Math.max(0, Math.min(HALF_SEGS, i)) * 2;
  out[0] = t[j] ?? 0;
  out[1] = t[j + 1] ?? 0;
}

/** Growth 0..1 from the ticks since the root began; reduced motion is always 1. */
export function ropeGrow(age: number, reduced: boolean): number {
  if (reduced) return 1;
  return Math.max(0, Math.min(1, age / ROPE_GROW_TICKS));
}

/** Segments of each half shown for loop `k` (0 first, 1 second) at growth `grow`: the loops close one after the other. */
export function revealSegs(grow: number, k: number): number {
  const u = Math.max(0, Math.min(1, grow * 2 - k));
  return Math.ceil(HALF_SEGS * u);
}
