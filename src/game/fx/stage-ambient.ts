import type { Element } from '@core/index';

/**
 * Pure rules of the stage ambient motion (view only, no Phaser, no sim state, nothing the sim reads): per element a few
 * soft, luminous, slow particle layers that give each arena a little life: fire embers and heat shimmer, water motes and
 * caustic glints, earth dust and falling grit, air drifting wisps, void violet motes. Every layer sits BEHIND the
 * fighters (depth below 0), stays at low alpha and is capped by `STAGE_AMBIENT_CAP` live particles, so heroes keep their
 * contrast. Reduced motion gets no layers (the Backdrop motes also hold still). The Phaser side is `stage-ambient-view.ts`.
 */

export type AmbientTex = 'glow' | 'wisp' | 'grain';
export const AMBIENT_TEXTURES: readonly AmbientTex[] = ['glow', 'wisp', 'grain'];
/** Texture size in px (w, h). */
export const AMBIENT_TEX_SIZE: Readonly<Record<AmbientTex, readonly [number, number]>> = { glow: [32, 32], wisp: [128, 32], grain: [8, 8] };

export interface Span { readonly min: number; readonly max: number }
const s = (min: number, max = min): Span => ({ min, max });

/** One emitter; spawn bands are fractions of the playfield; times in ms; speeds in px/s. */
export interface AmbientLayer {
  readonly id: string;
  readonly tex: AmbientTex;
  readonly additive: boolean;
  readonly x: Span;
  readonly y: Span;
  readonly lifespan: Span;
  readonly speedX: Span;
  readonly speedY: Span;
  readonly gravityY?: number;
  readonly scale: { readonly start: Span; readonly end: Span };
  /** Peak alpha (the emitter fades in and out around it, so nothing pops). */
  readonly alpha: number;
  readonly tint: readonly number[];
  readonly quantity: number;
  /** ms between emissions. */
  readonly frequency: number;
  /** ms simulated at once on start so the stage never opens empty. */
  readonly advance: number;
}

/** Hard cap on live ambient particles per stage (Phaser pools them; this keeps the cost small). */
export const STAGE_AMBIENT_CAP = 48;
/** Highest peak alpha any layer may use (keeps fighters readable). */
export const STAGE_AMBIENT_MAX_ALPHA = 0.5;
/** Depth of the ambient layers: above the backdrop art and vignette (-1, -0.4), below every fighter and effect (0 and up). */
export const STAGE_AMBIENT_DEPTH = -0.3;

export const AMBIENT_LAYERS: Readonly<Record<Element, readonly AmbientLayer[]>> = {
  fire: [
    { id: 'embers', tex: 'glow', additive: true, x: s(0, 1), y: s(0.8, 1.05), lifespan: s(3200, 5200), speedX: s(-16, 20), speedY: s(-58, -26),
      scale: { start: s(0.22, 0.4), end: s(0.04, 0.1) }, alpha: 0.5, tint: [0xff8a3a, 0xe0602a, 0xffb060], quantity: 1, frequency: 300, advance: 4000 },
    { id: 'heat', tex: 'wisp', additive: false, x: s(0, 1), y: s(0.7, 1.0), lifespan: s(4500, 6500), speedX: s(-6, 10), speedY: s(-30, -14),
      scale: { start: s(1.6, 2.4), end: s(2.4, 3.2) }, alpha: 0.07, tint: [0x7a3a1c, 0x5a2a18], quantity: 1, frequency: 900, advance: 5000 },
  ],
  water: [
    { id: 'motes', tex: 'glow', additive: true, x: s(0, 1), y: s(0.15, 1.0), lifespan: s(4500, 7500), speedX: s(-6, 8), speedY: s(-16, -4),
      scale: { start: s(0.14, 0.3), end: s(0.06, 0.14) }, alpha: 0.4, tint: [0x7ac8ff, 0xa8e0ff, 0x5aa0d8], quantity: 1, frequency: 360, advance: 6000 },
    { id: 'caustic', tex: 'wisp', additive: true, x: s(0, 1), y: s(0.55, 1.0), lifespan: s(6000, 9000), speedX: s(10, 26), speedY: s(-3, 3),
      scale: { start: s(1.2, 2.0), end: s(1.8, 2.6) }, alpha: 0.06, tint: [0x4a90c8, 0x6ab0d8], quantity: 1, frequency: 1100, advance: 8000 },
  ],
  earth: [
    { id: 'dust', tex: 'glow', additive: false, x: s(0, 1), y: s(0.5, 1.0), lifespan: s(5000, 8000), speedX: s(8, 24), speedY: s(-6, 4),
      scale: { start: s(0.18, 0.4), end: s(0.1, 0.22) }, alpha: 0.22, tint: [0xb8996a, 0x9a7e56, 0xc8aa78], quantity: 1, frequency: 340, advance: 7000 },
    { id: 'pebbles', tex: 'grain', additive: false, x: s(0, 1), y: s(-0.08, 0.1), lifespan: s(2200, 3200), speedX: s(-6, 6), speedY: s(30, 70),
      gravityY: 120, scale: { start: s(0.5, 0.9), end: s(0.4, 0.7) }, alpha: 0.35, tint: [0x6a5a48, 0x4e4236], quantity: 1, frequency: 1400, advance: 3000 },
  ],
  air: [
    { id: 'wisps', tex: 'wisp', additive: true, x: s(-0.1, 1.0), y: s(0.1, 0.9), lifespan: s(5000, 8000), speedX: s(34, 70), speedY: s(-8, 8),
      scale: { start: s(0.9, 1.6), end: s(1.4, 2.2) }, alpha: 0.09, tint: [0xdff4ff, 0xb8dcf0], quantity: 1, frequency: 700, advance: 7000 },
    { id: 'motes', tex: 'glow', additive: true, x: s(0, 1), y: s(0.1, 1.0), lifespan: s(4000, 6000), speedX: s(30, 60), speedY: s(-10, 4),
      scale: { start: s(0.1, 0.22), end: s(0.05, 0.1) }, alpha: 0.35, tint: [0xe8f8ff, 0xc8e8f8], quantity: 1, frequency: 420, advance: 5000 },
  ],
  void: [
    { id: 'motes', tex: 'glow', additive: true, x: s(0, 1), y: s(0.2, 1.0), lifespan: s(5000, 8000), speedX: s(-10, 6), speedY: s(-18, -4),
      scale: { start: s(0.14, 0.3), end: s(0.04, 0.12) }, alpha: 0.38, tint: [0xa070e0, 0x7a50b8, 0xc090f0], quantity: 1, frequency: 420, advance: 6000 },
  ],
};

/** Layers to run for a stage element: none for reduced motion or an unknown element. */
export function ambientLayers(element: Element | undefined, reduced: boolean): readonly AmbientLayer[] {
  return reduced || element === undefined ? [] : (AMBIENT_LAYERS[element]);
}

/** Particles alive at once from a layer at steady state. */
export function ambientSteadyCount(l: AmbientLayer): number {
  return Math.ceil((l.quantity * l.lifespan.max) / l.frequency);
}

/** Total live particles for an element's stage. */
export function ambientBudget(element: Element): number {
  return AMBIENT_LAYERS[element].reduce((n, l) => n + ambientSteadyCount(l), 0);
}
