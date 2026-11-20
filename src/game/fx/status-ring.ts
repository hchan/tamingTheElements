import type { Element } from '@core/index';
import { ELEMENT_COLORS } from './element-colors';
import { hash01 } from './grim-fx';
import { STATUS_LOOKS } from './status-fx';

/**
 * Procedural feet rings for freeze, slow, speed, tide and daze (idea status-effect-ring-art; the GPU art failed two rounds, so
 * this is the ladder's procedural rung). Pure (no Phaser, no Math.random): a flattened ellipse at the feet whose SHAPE codes the
 * status without colour (ice shards, chain links, comet arcs, foam ripples, orbiting stars), muted like the baked sprites with a
 * rim nudged toward the element. The far half is drawn under the hero and the near half over it (as the Snag rope does).
 */

export const RING_STATUSES: readonly number[] = [5, 6, 7, 9, 10];
/** Daze is not a StatusId with a STATUS_LOOK; it takes a muted gold. */
export const DAZE_COLOR = 0x9a8a5a;
export const MAX_SEGS = 64;
export const MAX_MOTES = 24;
/** Hostile first, then the self buff. */
const PRIORITY: readonly number[] = [10, 5, 9, 6, 7];
const GLINT = 0xe8e4d8;
/** Art-director colours for the rings that were revised (main, glint, rim width, rim alpha). */
const LOOK: Readonly<Record<number, { c: number; g: number; w: number; a: number }>> = {
  5: { c: 0xa9b4b8, g: GLINT, w: 3, a: 0.8 },
  6: { c: 0xc9a06a, g: 0xc9a06a, w: 3, a: 1 },
  9: { c: 0x3f8f86, g: 0xcfe8e0, w: 2, a: 0.9 },
  10: { c: 0xd9b44a, g: 0xcfcfc4, w: 3, a: 0.85 },
};

export interface RingBody {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface RingSeg {
  readonly pts: readonly number[];
  readonly far: boolean;
  readonly closed: boolean;
  readonly fill: boolean;
  readonly color: number;
  readonly alpha: number;
  readonly width: number;
  /** Darker underlay stroke colour (default black, faint). */
  readonly under?: number | undefined;
}
export interface RingMote {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
  /** Gold motes (daze); default is the pale glint. */
  readonly color?: number | undefined;
  readonly far: boolean;
}
export interface RingFrame {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly segs: readonly RingSeg[];
  readonly motes: readonly RingMote[];
}
export interface RingPalette {
  readonly base: number;
  readonly rim: number;
  readonly glint: number;
}

export function mix(a: number, b: number, t: number): number {
  const ch = (s: number): number => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** HSV saturation 0..1 (the grade guard keeps the rings under 0.6). */
export function saturation(c: number): number {
  const mx = Math.max(c >> 16, (c >> 8) & 255, c & 255);
  const mn = Math.min(c >> 16, (c >> 8) & 255, c & 255);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

/** The element a status is tied to: freeze and daze are air, slow and tide water, speed follows the bearer. */
export function ringElement(status: number, bearer: Element): Element {
  return status === 5 || status === 10 ? 'air' : status === 6 || status === 9 ? 'water' : bearer;
}

export function ringPalette(status: number, bearer: Element, hc: boolean): RingPalette {
  const base = status === 10 ? DAZE_COLOR : (STATUS_LOOKS[status]?.color ?? DAZE_COLOR);
  const rim = mix(base, ELEMENT_COLORS[ringElement(status, bearer)], hc ? 0.18 : 0.25);
  return { base, rim, glint: mix(rim, GLINT, 0.4) };
}

/** At most two rings per hero, hostile first; the inner one is smaller. */
export function stackRings(statuses: readonly number[]): { status: number; scale: number }[] {
  const out: { status: number; scale: number }[] = [];
  for (const s of PRIORITY) if (statuses.includes(s) && out.length < 2) out.push({ status: s, scale: out.length === 0 ? 1 : 0.8 });
  return out;
}

const TAU = Math.PI * 2;

export interface RingArgs {
  readonly status: number;
  readonly element: Element;
  readonly id: number;
  readonly body: RingBody;
  readonly now: number;
  /** loopAlpha(): ramp-in and blink. */
  readonly alpha: number;
  /** ringFraction(): 1 at apply, 0 at expiry. */
  readonly fraction: number;
  readonly scale: number;
  readonly reduced: boolean;
  readonly highContrast: boolean;
}

const isFar = (ang: number): boolean => Math.sin(ang) < 0;

/** A 15-point spiral on the ring ellipse, turning 1.5 times out from the middle. */
function spiralPts(px: (ang: number, k: number) => [number, number], a0: number): number[] {
  const o: number[] = [];
  for (let i = 0; i <= 14; i++) o.push(...px(a0 + (i / 14) * Math.PI * 1.5, 0.25 + (i / 14) * 0.6));
  return o;
}

export function ringFrame(a: RingArgs): RingFrame {
  const { body: b, status, id, alpha, reduced } = a;
  const pal = ringPalette(status, a.element, a.highContrast);
  const rx = b.w * 0.55 * a.scale;
  const ry = rx * 0.28;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h * 0.92;
  const t = reduced ? 0 : a.now + hash01(id, status) * 100;
  const segs: RingSeg[] = [];
  const motes: RingMote[] = [];
  const bold = a.highContrast ? 2 : 0;
  const px = (ang: number, k = 1, lift = 0): [number, number] => [cx + Math.cos(ang) * rx * k, cy + Math.sin(ang) * ry * k - lift];
  const arc = (a0: number, a1: number, n: number, k = 1, wob = 0, w = 0): number[] => {
    const o: number[] = [];
    for (let i = 0; i <= n; i++) {
      const ang = a0 + ((a1 - a0) * i) / n;
      const [x, y] = px(ang, k * (1 + (wob ? Math.sin(ang * 8 + w) * wob : 0)));
      o.push(x, y);
    }
    return o;
  };
  const add = (pts: readonly number[], ang: number, color: number, al: number, width: number, fill = false, closed = false): void => {
    if (segs.length < MAX_SEGS) segs.push({ pts, far: isFar(ang), closed, fill, color, alpha: al * alpha, width: width + bold });
  };
  const mote = (x: number, y: number, r: number, al: number, ang: number, color?: number): void => {
    if (motes.length < MAX_MOTES) motes.push({ x, y, r, a: al * alpha, far: isFar(ang), color });
  };
  // Shared: the rim (two halves) and the inner timer arc that drains with the status (a cue that is not colour).
  const o = LOOK[status];
  const rimC = o?.c ?? pal.rim;
  const glintC = o?.g ?? pal.glint;
  const wob = status === 9 ? 2 / rx : 0;
  const kr = status === 6 && !reduced ? 1 - 0.08 * ((t * 0.01) % 1) : 1;
  const ph = t * 0.1;
  add(arc(Math.PI, TAU, 24, kr, wob, ph), -1, rimC, o ? o.a : 0.8, o?.w ?? 3.5);
  add(arc(0, Math.PI, 24, kr, wob, ph), 1, rimC, o ? o.a : 1, o?.w ?? 4);
  if (a.highContrast) add(arc(0, Math.PI, 20, 0.97), 1, GLINT, 0.5, 1);
  const f = Math.max(0, Math.min(1, a.fraction));
  if (f > 0) add(arc(-Math.PI / 2, -Math.PI / 2 + f * TAU, 24, 0.8), 1, glintC, status === 9 ? 0.3 : 0.7, 2.5);

  switch (status) {
    case 5: {
      // FREEZE: 11 short ice spikes on the floor ring (no body outline), a faint white core line, one travelling glint.
      for (let i = 0; i < 11; i++) {
        const ang = ((i + 0.5) / 11) * TAU + (hash01(i, id) - 0.5) * 0.12;
        const [x0, y0] = px(ang - 0.1);
        const [x1, y1] = px(ang + 0.1);
        const [mx, my] = px(ang);
        const len = 6 + hash01(i, id + 5) * 2;
        add([x0, y0, mx + Math.cos(ang) * len, my + Math.sin(ang) * len * 0.7, x1, y1], ang, rimC, 0.8, 3, true, true);
      }
      add(arc(Math.PI, TAU, 24, 0.98), -1, GLINT, 0.3, 1);
      add(arc(0, Math.PI, 24, 0.98), 1, GLINT, 0.3, 1);
      const [gx, gy] = px(t * 0.05, 1.02);
      mote(gx, gy, 2, 0.9, t * 0.05);
      break;
    }
    case 6: {
      // SLOW: one heavy umber ellipse that contracts slowly, and six ~10 px beaded drips hanging from the front arc; no waves (not tide).
      for (let i = 0; i < 6; i++) {
        const u = reduced ? 0.5 : (t * 0.008 + i / 6) % 1;
        const [x, y] = px(0.45 + i * 0.45, kr);
        const len = 10 * Math.min(1, u * 3);
        const fade = 1 - u * u;
        add([x, y, x, y + len], 1, rimC, fade, 3);
        mote(x, y + len, 2, fade, 1, rimC);
      }
      break;
    }
    case 7: {
      // SPEED: six tapered comet arcs on the ellipse spinning about once per 1.2 s, tangent motes flung off.
      const spin = t * 0.105;
      for (let i = 0; i < 6; i++) {
        const a0 = spin + (i / 6) * TAU;
        for (let s = 0; s < 3; s++) {
          const s0 = a0 + s * 0.2;
          add(arc(s0, s0 + 0.22, 4, 1.02), s0 + 0.1, s === 2 ? pal.glint : pal.rim, 0.55 + s * 0.2, 2 + s * 1.6);
        }
        const [mx, my] = px(a0 + 0.66, 1.12);
        mote(mx, my, 1.4, 0.7, a0 + 0.66);
      }
      break;
    }
    case 9: {
      // TIDE: the wavy rim, two ripples that expand outward and fade with bright crest dots (static when reduced).
      for (let k = 0; k < 2; k++) {
        const u = reduced ? 0.3 + k * 0.35 : (t * 0.016 + k / 2) % 1;
        const kk = 1.04 + u * 0.3;
        const al = 0.7 * (1 - u);
        add(arc(Math.PI, TAU, 28, kk, wob, ph + k), -1, rimC, al, 2);
        add(arc(0, Math.PI, 28, kk, wob, ph + k), 1, rimC, al, 2);
        for (let d = 0; d < 3; d++) {
          const ang = 0.7 + d * 2.1 + k * 1.3 + (reduced ? 0 : t * 0.01);
          const [x, y] = px(ang, kk);
          mote(x, y, 1.5, 0.9 * (1 - u), ang, glintC);
        }
      }
      break;
    }
    case 10: {
      // DAZE: a pale-grey inner swirl and four gold motes orbiting the ring.
      const spin = t * 0.04;
      for (let k = 0; k < 2; k++) {
        const sp = spiralPts(px, spin * 1.5 + k * Math.PI);
        add(sp.slice(0, 16), 1, glintC, 0.85, 3);
        add(sp.slice(14), -1, glintC, 0.85, 3);
      }
      for (let i = 0; i < 4; i++) {
        const ang = spin + (i * TAU) / 4;
        const [x, y] = px(ang, 0.9, 4);
        mote(x, y, 2, 0.95, ang, rimC);
      }
      break;
    }
    default:
      break;
  }
  // Dark centre (the approved textured rings have a dark hole): one filled flat ellipse, far side so it sits under the hero.
  segs.unshift({ pts: arc(0, TAU, 24, 0.9).slice(0, 48), far: true, closed: true, fill: true, color: 0x000000, alpha: 0.3 * alpha, width: 0 });
  const under = status === 5 ? 0x2a3036 : status === 6 ? 0x1a0f08 : undefined;
  return { cx, cy, rx, ry, segs: segs.slice(0, MAX_SEGS - 1).map((g) => (under !== undefined && g.width > 0 ? { ...g, under } : g)), motes };
}
