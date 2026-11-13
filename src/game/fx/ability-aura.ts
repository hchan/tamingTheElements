import { StatusId } from '@core/index';

/**
 * Buff auras and the heal pop (ideas/done/ability-graphics-audit-defects): Rock Armour, Adrenaline and Fire Dance had no
 * body effect, only a HUD chip. Pure geometry (no Phaser): each buff gets its own SHAPE (plates, chevrons, flames) so it never
 * relies on colour, drawn with a dark outline for contrast. Reduced motion: the same shapes, held still.
 */
export type AuraShape = 'plates' | 'chevrons' | 'flames';
export interface AuraKind {
  readonly kind: string;
  readonly status: number;
  readonly shape: AuraShape;
  readonly color: number;
}

export const AURAS: readonly AuraKind[] = [
  { kind: 'rockArmour', status: StatusId.rockArmour, shape: 'plates', color: 0xa89572 },
  { kind: 'adrenaline', status: StatusId.adrenaline, shape: 'chevrons', color: 0xc9a845 },
  { kind: 'fireDance', status: StatusId.fireDance, shape: 'flames', color: 0xc8581a },
];

export interface AuraPoly {
  readonly pts: readonly number[];
  readonly color: number;
}
export interface AuraBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The polygons of one aura around a character box, `age` view ticks after it first appeared. */
export function auraPolys(a: AuraKind, b: AuraBox, age: number, reduced: boolean): AuraPoly[] {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const t = reduced ? 0 : age;
  const out: AuraPoly[] = [];
  if (a.shape === 'plates') {
    // Four armour plates orbiting the body (slow turn), each a rotated square.
    const rx = b.w * 0.75;
    const ry = b.h * 0.6;
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + t * 0.03;
      const px = cx + Math.cos(ang) * rx;
      const py = cy + Math.sin(ang) * ry;
      const r = 13;
      out.push({ color: a.color, pts: [px, py - r, px + r, py, px, py + r, px - r, py] });
    }
  } else if (a.shape === 'chevrons') {
    // Three upward chevrons rising along each flank, wrapping to the bottom.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const rise = (t * 1.2 + i * (b.h / 3)) % b.h;
        const px = cx + side * (b.w / 2 + 12);
        const py = b.y + b.h - rise;
        out.push({ color: a.color, pts: [px - 9, py + 4, px, py - 6, px + 9, py + 4, px + 9, py + 10, px, py, px - 9, py + 10] });
      }
    }
  } else {
    // Flame tongues licking up around the feet, each flickering in height.
    for (let i = 0; i < 5; i++) {
      const px = b.x + (b.w * (i + 0.5)) / 5;
      const base = b.y + b.h;
      const flick = reduced ? 0 : Math.sin(age * 0.35 + i * 1.7) * 5;
      out.push({ color: a.color, pts: [px - 7, base, px, base - 26 - flick, px + 7, base] });
    }
  }
  return out;
}

export const POP_TICKS = 60;
/** Pop height gained and alpha left after `age` view ticks (reduced motion: no rise, still fades out). */
export function popLook(age: number, reduced: boolean): { dy: number; alpha: number } {
  const k = Math.min(1, Math.max(0, age / POP_TICKS));
  return { dy: reduced ? 0 : -34 * k, alpha: k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4 };
}

/** Snag cast cue (the throw has no sim event until it hits): a rope lash flung along the aim, then fading. */
export const SNAG_SPRITE = 'entanglingVines';
export const SNAG_ROPE_COLOR = 0x8f7348;
export const SNAG_REACH = 240;
export const LASH_TICKS = 24;
const LASH_GROW_TICKS = 6;
const LASH_SEGS = 12;

export interface Lash {
  /** Polyline x,y pairs: a wavy rope from the caster to its knot. */
  readonly pts: number[];
  /** Knot (a ring at the rope end): centre and radius. */
  readonly knot: { x: number; y: number; r: number };
  readonly alpha: number;
}

/**
 * The lash `age` view ticks after the cast, from (x, y) along dir8 `dir` (0 east, 2 north, 4 west, 6 south). It grows over a few
 * ticks and wriggles (reduced motion: full length, straight-ish and still), then fades; undefined once over.
 */
export function snagLash(x: number, y: number, dir: number, age: number, reduced: boolean): Lash | undefined {
  if (age < 0 || age > LASH_TICKS) return undefined;
  const a = (dir * Math.PI) / 4;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const len = reduced ? SNAG_REACH : SNAG_REACH * Math.min(1, (age + 1) / LASH_GROW_TICKS);
  const pts: number[] = [];
  for (let i = 0; i <= LASH_SEGS; i++) {
    const f = i / LASH_SEGS;
    const wob = Math.sin(f * 9 + (reduced ? 0 : age * 0.9)) * 10 * f * (1 - f) * 4;
    pts.push(x + dx * len * f - dy * wob, y + dy * len * f + dx * wob);
  }
  const k = LASH_SEGS * 2;
  const alpha = age < LASH_TICKS * 0.5 ? 1 : 1 - (age - LASH_TICKS * 0.5) / (LASH_TICKS * 0.5);
  return { pts, knot: { x: pts[k] ?? x, y: pts[k + 1] ?? y, r: 14 }, alpha };
}
