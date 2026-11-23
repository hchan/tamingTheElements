import { hash01 } from './grim-fx';

/**
 * Glimmaw cast FX (roster24, water ranged), view only: Lure Orb lights the anglerfish lure. A curved stalk arcs up and forward
 * from the caster's head to a bioluminescent bulb (teal body, gold core) that swells and flickers, with faint concentric swell
 * rings and plankton motes drifting in the dark around it. The orb has no sim event on cast, so the view reads a rise of the
 * action-bar slot's `readyTick` (as Kindrel and Brazgor do). Pure geometry (no Phaser, no Math.random): reduced motion draws the
 * same shapes held at their mid-life pose.
 */
export const LURE_SPRITE = 'lureOrb';
export const LURE_TICKS = 40;
export const LURE_COLOR = 0x2fa6a0;
export const LURE_CORE = 0xe6b54a;
export const LURE_POP = 'LURE';

export interface LureFx {
  /** Stalk polyline, x,y pairs, head to bulb. */
  readonly stalk: readonly number[];
  readonly bulb: { x: number; y: number; r: number };
  /** Gold core radius inside the bulb. */
  readonly core: number;
  /** Faint swell rings round the bulb, widening and fading. */
  readonly rings: readonly { r: number; a: number }[];
  readonly motes: readonly { x: number; y: number; r: number }[];
  readonly alpha: number;
}

/** The lure `age` view ticks after the cast, hung in front of (x, y) along dir8 `dir` (0 east, 4 west); undefined once over. */
export function lureOrb(x: number, y: number, dir: number, age: number, reduced: boolean): LureFx | undefined {
  if (age < 0 || age > LURE_TICKS) return undefined;
  const t = reduced ? 0.5 : age / LURE_TICKS;
  const side = dir >= 3 && dir <= 5 ? -1 : 1;
  // The stalk curls up from the head and droops forward at the tip, growing out over the first quarter of the life.
  const grow = Math.min(1, t * 4);
  const stalk: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const f = (i / 8) * grow;
    stalk.push(x + side * (6 + f * 58), y - 14 - Math.sin(f * Math.PI * 0.8) * 34);
  }
  const bx = stalk[stalk.length - 2] ?? x;
  const by = stalk[stalk.length - 1] ?? y;
  const flicker = reduced ? 0 : (hash01(age, 71) - 0.5) * 2;
  const swell = 7 + 3 * Math.sin(t * Math.PI) + flicker * 0.9;
  const rings: { r: number; a: number }[] = [];
  for (let k = 0; k < 2; k++) {
    const u = (t * 1.6 + k * 0.5) % 1;
    rings.push({ r: swell + 4 + u * 30, a: 1 - u });
  }
  const motes: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const ang = hash01(i, 72) * Math.PI * 2;
    const d = 12 + hash01(i, 73) * 34;
    const drift = reduced ? 0 : t * (8 + hash01(i, 74) * 12);
    motes.push({ x: bx + Math.cos(ang) * d, y: by + Math.sin(ang) * d * 0.8 - drift, r: 1.4 + hash01(i, 75) * 1.4 });
  }
  return { stalk, bulb: { x: bx, y: by, r: swell }, core: swell * 0.45, rings, motes, alpha: reduced ? 0.85 : t < 0.15 ? t / 0.15 : 1 - ((t - 0.15) / 0.85) ** 2 };
}
