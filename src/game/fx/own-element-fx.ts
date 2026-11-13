import { STAGE_ELEMENTS, inPatch } from './terrain-fx';
import { hash01 } from './grim-fx';

/**
 * Own-element patch effects (ideas/in-progress/own-element-tile-effects.md, WP 1, view only): a hero standing on a stage patch
 * of its own element gets a looping animation of that element: water rising motes, a ripple and a plus pulse on each heal;
 * fire flames licking up; air wind swirls and leaves; earth stone plates and dust. Pure rules (no Phaser, no sim state): the
 * decision (which hero, which element) and the shapes, written into a fixed pool of parts that the Phaser side
 * (`own-element-view.ts`) paints. The sim's own rule is `onPatch` (hero element == stage and its centre inside a patch); the
 * view derives the same from `RenderArcade.stage` / `patches` and the character's element, because the view has no flag for it.
 * Reduced motion: every shape holds one still pose and a steady soft glow marks the patch (no pulse, no motion).
 */

/** Muted (grim) colour per element index 1 fire .. 4 air. */
export const OWN_COLORS = [0xc8581a, 0x6f9aa6, 0xa89572, 0xaab4a8] as const;
/** A heal pulse (the plus) lives this many view ticks. */
export const HEAL_PULSE_TICKS = 28;
export const PART_MAX = 40;

/** The element index (1 fire .. 4 air) of a hero standing on a patch of its own element, else 0. */
export function ownElementKind(stage: number, element: string, patches: readonly number[], count: number, cx: number, cy: number): number {
  if (stage < 1 || stage > 4 || element !== STAGE_ELEMENTS[stage - 1]) return 0;
  return inPatch(patches, count, cx, cy) ? stage : 0;
}

/** True when a water hero's HP rose between two looks (the sim's patch heal; any other heal also reads as a heal pulse). */
export function healTick(kind: number, prevHp: number, hp: number): boolean {
  return kind === 2 && hp > prevHp;
}

/** The heal plus: scale and alpha `age` view ticks after the heal (undefined once over). Reduced motion: no pulse at all. */
export function pulseLook(age: number, reduced: boolean): { scale: number; alpha: number } | undefined {
  if (reduced || age < 0 || age >= HEAL_PULSE_TICKS) return undefined;
  const k = age / HEAL_PULSE_TICKS;
  return { scale: 0.6 + 0.8 * Math.min(1, k * 2.5), alpha: k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7 };
}

export const Shape = { mote: 0, flame: 1, plate: 2, ring: 3, streak: 4, glow: 5 } as const;
export type Shape = (typeof Shape)[keyof typeof Shape];

/** One drawable: shape, position, size `s`, rotation, alpha and the colour. Reused between calls. */
export interface Part {
  shape: Shape;
  x: number;
  y: number;
  s: number;
  rot: number;
  a: number;
  color: number;
}

/** The pool `fillParts` writes into (module-level: one frame is filled and painted before the next hero). */
export const parts: Part[] = Array.from({ length: PART_MAX }, () => ({ shape: Shape.mote, x: 0, y: 0, s: 0, rot: 0, a: 0, color: 0 }));

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

let n = 0;
function put(shape: Shape, x: number, y: number, s: number, rot: number, a: number, color: number): void {
  const p = parts[n++];
  if (!p) return;
  p.shape = shape;
  p.x = x;
  p.y = y;
  p.s = s;
  p.rot = rot;
  p.a = a;
  p.color = color;
}

/**
 * Fills `parts` with the effect of element `kind` around `b`, `age` view ticks after it began, and returns how many are used.
 * `salt` varies the scatter per hero. Reduced motion freezes the pose (`age` ignored) and adds a steady ground glow.
 */
export function fillParts(kind: number, b: Box, age: number, reduced: boolean, salt: number): number {
  n = 0;
  const color = OWN_COLORS[kind - 1] ?? 0xffffff;
  const t = reduced ? 0 : age;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const foot = b.y + b.h;
  if (reduced) put(Shape.glow, cx, foot - 4, b.w * 0.9, 0, 1, color);
  if (kind === 2) {
    // Motes rising from the feet to the head, wobbling, each fading in and out; two ripples spreading on the ground.
    for (let i = 0; i < 9; i++) {
      const life = reduced ? 0.45 : (t * (0.012 + hash01(i, salt) * 0.01) + hash01(i, salt + 1)) % 1;
      const x = b.x + b.w * (0.1 + 0.8 * hash01(i, salt + 2)) + (reduced ? 0 : Math.sin(t * 0.06 + i * 2) * 4);
      put(Shape.mote, x, foot - life * (b.h + 8), 1.4 + hash01(i, salt + 3) * 1.6, 0, Math.sin(life * Math.PI) * 0.8, color);
    }
    for (let i = 0; i < 2; i++) {
      const life = reduced ? 0.4 + i * 0.3 : (t * 0.018 + i * 0.5) % 1;
      put(Shape.ring, cx, foot - 2, b.w * (0.35 + 0.7 * life), 0, (1 - life) * 0.7, color);
    }
  } else if (kind === 1) {
    // Seven flame tongues around the feet, flickering in height, and a few embers rising off them.
    for (let i = 0; i < 7; i++) {
      const px = b.x - 4 + ((b.w + 8) * (i + 0.5)) / 7;
      const flick = reduced ? 0 : Math.sin(t * 0.33 + i * 1.9) * 6 + Math.sin(t * 0.17 + i) * 3;
      put(Shape.flame, px, foot - 1, 24 + (i % 3) * 5 + flick, 0, 0.9, color);
    }
    for (let i = 0; i < 8; i++) {
      const life = reduced ? 0.5 : (t * (0.014 + hash01(i, salt) * 0.012) + hash01(i, salt + 1)) % 1;
      put(Shape.mote, b.x + b.w * hash01(i, salt + 2) + (reduced ? 0 : Math.sin(t * 0.07 + i) * 3), foot - 10 - life * b.h * 0.9, 1 + hash01(i, salt + 3) * 1.2, 0, Math.sin(life * Math.PI) * 0.8, 0xe0a050);
    }
  } else if (kind === 4) {
    // Three wind swirls spiralling round the body at different heights and speeds, and two leaves carried along.
    for (let i = 0; i < 3; i++) {
      const y = b.y + b.h * (0.25 + 0.3 * i);
      put(Shape.streak, cx, y, b.w * (0.8 - i * 0.08), t * (0.09 + i * 0.03) + i * 2.1, 0.75, color);
    }
    for (let i = 0; i < 2; i++) {
      const ang = t * 0.07 + i * Math.PI;
      put(Shape.plate, cx + Math.cos(ang) * b.w * 0.95, cy + Math.sin(ang) * b.h * 0.45 - (reduced ? 0 : Math.sin(t * 0.05 + i) * 4), 5, ang * 2, 0.8, 0x7f8c5a);
    }
  } else if (kind === 3) {
    // Five stone plates orbiting the body in a slow ring (a shield), and dust drifting off the ground.
    for (let i = 0; i < 5; i++) {
      const ang = (i * Math.PI * 2) / 5 + t * 0.025;
      put(Shape.plate, cx + Math.cos(ang) * b.w * 0.85, cy + Math.sin(ang) * b.h * 0.5, 9 + (i % 2) * 2, ang + Math.PI / 4, 0.9, color);
    }
    for (let i = 0; i < 7; i++) {
      const life = reduced ? 0.5 : (t * (0.008 + hash01(i, salt) * 0.008) + hash01(i, salt + 1)) % 1;
      put(Shape.mote, b.x - 6 + (b.w + 12) * hash01(i, salt + 2) + (reduced ? 0 : Math.sin(t * 0.04 + i) * 5), foot - life * 24, 1.6 + hash01(i, salt + 3), 0, Math.sin(life * Math.PI) * 0.6, 0xd8c89a);
    }
  }
  return n;
}
