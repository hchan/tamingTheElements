import { hash01 } from './grim-fx';

/**
 * Umbrel cast FX (roster24, earth fungus), view only. Spore Burst (def `spore-burst`, range, 5 px/tick, a 40 px box) draws a
 * drifting spore cloud on top of the real projectile: the puffs sit inside its box and move at its speed, with a few spores
 * shed behind. Mycelium Mend (def `mycelium-mend`, self heal) draws pale threads growing up round the caster and spores
 * rising. Neither has a sim cast event, so the view reads a rise of the action-bar slot's `readyTick` (as Kindrel and Brazgor
 * do). Pure geometry (no Phaser, no Math.random): reduced motion draws the same shapes held at their mid-life pose. Muted
 * toadstool tones (olive spore, bruise purple), not a bright poison green.
 */
export const SPORE_SPRITE = 'sporeBurst';
export const MEND_SPRITE = 'myceliumMend';
/** Projectile box edge (px) and speed (px/tick): abilities-c.ts `w: 40 / 80`, `speed: 5` (a test pins both). */
export const SPORE_BOX = 40;
export const SPORE_SPEED = 5;
/** View lifetime of the cloud (ticks): 200 px of travel. */
export const SPORE_TICKS = 40;
export const MEND_TICKS = 40;
export const SPORE_COLOR = 0x8a8f3c;
export const SPORE_DARK = 0x4a3a52;
export const MEND_COLOR = 0xb9b08a;
export const MEND_POP = 'MEND';

export interface Puff { readonly x: number; readonly y: number; readonly r: number; readonly a: number }
export interface SporeFx {
  /** The cloud body: puffs inside the projectile box. */
  readonly puffs: readonly Puff[];
  /** Spores shed behind the cloud. */
  readonly trail: readonly Puff[];
  /** Projectile centre. */
  readonly head: { x: number; y: number };
  readonly alpha: number;
}

/** The spore cloud `age` view ticks after the cast from the caster centre (x, y); dir8 3..5 faces west. */
export function sporeBurst(x: number, y: number, dir: number, age: number, reduced: boolean): SporeFx | undefined {
  if (age < 0 || age > SPORE_TICKS) return undefined;
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  const a = reduced ? SPORE_TICKS / 2 : age;
  const hx = x + side * (SPORE_BOX + SPORE_SPEED * a);
  const wob = reduced ? 0 : Math.sin(age * 0.5);
  const half = SPORE_BOX / 2;
  const puffs: Puff[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = hash01(i, 101) * Math.PI * 2 + (reduced ? 0 : age * 0.08 * (i % 2 === 0 ? 1 : -1));
    const d = Math.sqrt(hash01(i, 102)) * (half - 10);
    puffs.push({ x: hx + Math.cos(ang) * d, y: y + Math.sin(ang) * d + wob * 2, r: 9 + hash01(i, 103) * 5, a: 0.75 });
  }
  const trail: Puff[] = [];
  for (let i = 0; i < 7; i++) {
    const lag = 4 + hash01(i, 104) * 22;
    trail.push({ x: hx - side * lag * SPORE_SPEED * 0.5, y: y + (hash01(i, 105) - 0.5) * 34 + (reduced ? 0 : lag * 0.3), r: 2 + hash01(i, 106) * 2.5, a: 0.8 * (1 - lag / 28) });
  }
  const t = a / SPORE_TICKS;
  return { puffs, trail, head: { x: hx, y }, alpha: reduced ? 0.85 : 1 - t * t * 0.6 };
}

export interface MendFx {
  /** Threads: each an x,y polyline growing up from the ground under the caster. */
  readonly threads: readonly (readonly number[])[];
  /** Spores rising round the caster. */
  readonly motes: readonly Puff[];
  /** Ground ring under the caster. */
  readonly ring: { x: number; y: number; r: number };
  readonly alpha: number;
}

/** Mycelium Mend `age` view ticks after the cast round the caster centre (x, y). */
export function myceliumMend(x: number, y: number, age: number, reduced: boolean): MendFx | undefined {
  if (age < 0 || age > MEND_TICKS) return undefined;
  const t = reduced ? 0.5 : age / MEND_TICKS;
  const grown = Math.min(1, t * 2.2);
  const gy = y + 36;
  const threads: number[][] = [];
  for (let i = 0; i < 6; i++) {
    const bx = x + (i - 2.5) * 13 + (hash01(i, 111) - 0.5) * 6;
    const h = (34 + hash01(i, 112) * 38) * grown;
    const pts: number[] = [];
    for (let k = 0; k <= 5; k++) {
      const u = k / 5;
      pts.push(bx + Math.sin(u * 4 + i * 1.7) * 7 * u, gy - h * u);
    }
    threads.push(pts);
  }
  const motes: Puff[] = [];
  for (let i = 0; i < 9; i++) {
    const life = reduced ? 0.5 : (t * (0.8 + hash01(i, 113) * 0.8) + hash01(i, 114)) % 1;
    motes.push({ x: x + (hash01(i, 115) - 0.5) * 70 + (reduced ? 0 : Math.sin(age * 0.2 + i) * 4), y: gy - 6 - life * 70, r: 2.5 + hash01(i, 116) * 2, a: Math.sin(Math.PI * life) });
  }
  return { threads, motes, ring: { x, y: gy + 2, r: 16 + 30 * grown }, alpha: reduced ? 0.85 : 1 - t * t };
}
