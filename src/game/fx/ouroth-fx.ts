import { hash01 } from './grim-fx';

/**
 * Ouroth cast FX (roster24, fire serpent melee), view only: Wyrm Coil (grab) draws a scaled coil that tightens inside the grab box,
 * Scorch Breath a gout of flame that fills its box. Both are drawn to the sim's real hitbox: the box `directionalBox` (melee.ts)
 * puts in front of the caster, sized from abilities-c.ts (Wyrm Coil 80x70, Scorch Breath 110x70; a test pins the numbers). No sim
 * event on cast, so the view reads a rise of the action-bar slot's `readyTick` (as Kindrel and Brazgor do). Pure geometry (no
 * Phaser, no Math.random): reduced motion draws the same shapes held at their mid-life pose.
 */
export const COIL_SPRITE = 'wyrmCoil';
export const BREATH_SPRITE = 'scorchBreath';
/** Hitbox sizes (px) of the two attacks, mirrored from abilities-c.ts. */
export const COIL_BOX = { w: 80, h: 70 } as const;
export const BREATH_BOX = { w: 110, h: 70 } as const;
/** Box lifetimes: delayAfterAttackMs 400 and 300 at 50 Hz. */
export const COIL_TICKS = 20;
export const BREATH_TICKS = 15;
export const COIL_COLOR = 0x8a6a2c;
export const BREATH_COLOR = 0xd2581a;
export const COIL_POP = 'COIL';
export const BREATH_POP = 'SCORCH';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The sim's directional melee box (melee.ts `directionalBox`) in front of the caster box (top-left cx, cy; size cw x ch). */
export function meleeBox(dir: number, cx: number, cy: number, cw: number, ch: number, w: number, h: number): Box {
  if ((dir & 1) === 1) {
    const d = (w + h) / 2;
    return { x: dir < 3 || dir > 5 ? cx + cw : cx - d, y: dir < 4 ? cy - d : cy + ch, w: d, h: d };
  }
  if (dir === 4) return { x: cx - w, y: cy + (ch - h) / 2, w, h };
  if (dir === 6) return { x: cx + (cw - h) / 2, y: cy + ch, w: h, h: w };
  if (dir === 2) return { x: cx + (cw - h) / 2, y: cy - w, w: h, h: w };
  return { x: cx + cw, y: cy + (ch - h) / 2, w, h };
}

/** Local (u along the reach 0..1 from the caster, v across -1..1) to a world point inside `b`, along the axis the box is long on. */
function at(b: Box, u: number, v: number, flip: boolean): { x: number; y: number } {
  const along = flip ? 1 - u : u;
  v = Math.max(-1, Math.min(1, v));
  return b.w >= b.h ? { x: b.x + b.w * along, y: b.y + b.h * (0.5 + v / 2) } : { x: b.x + b.w * (0.5 + v / 2), y: b.y + b.h * along };
}

/** True when the reach runs from the far edge back to the near one (west, north and the north/south-west diagonals), so u=0 stays at the caster. */
function reversed(dir: number): boolean {
  return dir >= 2 && dir <= 5;
}

export interface CoilFx {
  /** The grab box outline as an x,y polyline (the real hitbox). */
  readonly box: readonly number[];
  /** Two scaled coil bands, each an x,y polyline winding round the box and cinching in. */
  readonly bands: readonly (readonly number[])[];
  /** Ember flecks shed off the scales. */
  readonly sparks: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

function outline(b: Box): number[] {
  return [b.x, b.y, b.x + b.w, b.y, b.x + b.w, b.y + b.h, b.x, b.y + b.h];
}

/** Wyrm Coil `age` view ticks after the cast inside the grab box `b`; undefined once over. */
export function wyrmCoil(b: Box, dir: number, age: number, reduced: boolean): CoilFx | undefined {
  if (age < 0 || age > COIL_TICKS) return undefined;
  const t = reduced ? 0.5 : age / COIL_TICKS;
  const flip = reversed(dir);
  const bands: number[][] = [];
  // The coil winds 2.5 turns along the reach and the swing narrows as it cinches (amplitude 0.95 -> 0.45).
  const amp = 0.95 - 0.5 * t;
  const reach = Math.min(1, 0.35 + t * 1.4);
  for (const phase of [0, Math.PI]) {
    const pts: number[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = (i / 16) * reach;
      const p = at(b, u, Math.sin(u * Math.PI * 5 + phase + t * 2) * amp, flip);
      pts.push(p.x, p.y);
    }
    bands.push(pts);
  }
  const sparks: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const p = at(b, hash01(i, 71) * reach, (hash01(i, 72) - 0.5) * 2 * amp, flip);
    sparks.push({ x: p.x, y: p.y - t * 14 * hash01(i, 73), r: 2.8 * (1 - t * 0.5) });
  }
  return { box: outline(b), bands, sparks, alpha: reduced ? 0.8 : 1 - t * t };
}

export interface BreathFx {
  readonly box: readonly number[];
  /** Flame tongues, each a closed tapered x,y polygon from the caster to the far edge of the box. */
  readonly tongues: readonly (readonly number[])[];
  readonly embers: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

/** Scorch Breath `age` view ticks after the cast inside the box `b`; the gout lengthens to the box's far edge. Undefined once over. */
export function scorchBreath(b: Box, dir: number, age: number, reduced: boolean): BreathFx | undefined {
  if (age < 0 || age > BREATH_TICKS) return undefined;
  const t = reduced ? 0.5 : age / BREATH_TICKS;
  const flip = reversed(dir);
  const len = Math.min(1, 0.25 + t * 2.2);
  const tongues: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const v = (k - 1.5) / 1.6;
    const wob = reduced ? 0 : Math.sin(age * 0.9 + k * 1.7) * 0.12;
    const tip = len * (0.8 + hash01(k, 81) * 0.2);
    const a = at(b, 0, v * 0.35, flip);
    const m1 = at(b, tip * 0.45, v * 0.95 + wob, flip);
    const tp = at(b, tip, v * 0.8 + wob * 2, flip);
    const m2 = at(b, tip * 0.5, v * 0.55 + wob, flip);
    const z = at(b, 0, v * 0.1, flip);
    tongues.push([a.x, a.y, m1.x, m1.y, tp.x, tp.y, m2.x, m2.y, z.x, z.y]);
  }
  const embers: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const p = at(b, hash01(i, 82) * len, (hash01(i, 83) - 0.5) * 1.8, flip);
    embers.push({ x: p.x, y: p.y - (reduced ? 0 : t * 16 * hash01(i, 84)), r: 3.2 * (1 - t * 0.5) });
  }
  return { box: outline(b), tongues, embers, alpha: reduced ? 0.85 : 1 - t * t * 0.9 };
}
