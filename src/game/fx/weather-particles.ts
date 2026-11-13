/**
 * Pure rules of the weather particle art pass (view only, no Phaser, no sim state): per element weather, the layers of
 * grim, muted, textured particles the Phaser side (`weather-particles-view.ts`) emits, and the pixels of the four small
 * generated textures they use. Weather kinds are the sim's (1 Sun/fire, 2 Rain/water, 3 Sandstorm/earth, 4 Gale/air; 5
 * Eclipse keeps its old motes). Every colour is a desaturated mid-to-dark tone: smoke, ash, grit and mist, never glow.
 * Reduced motion gets no layers at all (the sky tint, badge and called line carry the information).
 */

export type WeatherTex = 'smoke' | 'speck' | 'streak' | 'leaf';
export const WEATHER_TEXTURES: readonly WeatherTex[] = ['smoke', 'speck', 'streak', 'leaf'];
/** Texture size in px (w, h) per id. */
export const TEX_SIZE: Readonly<Record<WeatherTex, readonly [number, number]>> = {
  smoke: [96, 96], speck: [16, 16], streak: [96, 10], leaf: [28, 16],
};

export interface Range { readonly min: number; readonly max: number }

/** One emitter: spawn bands are fractions of the playfield; times in ms; speeds in px/s. */
export interface WeatherLayer {
  readonly id: string;
  readonly tex: WeatherTex;
  /** Behind the fighters (haze, fog) or in front of them (flecks, leaves). */
  readonly depth: 'back' | 'front';
  /** Spawn band as fractions of the playfield width and height (may reach past 0..1 to enter from outside). */
  readonly x: Range;
  readonly y: Range;
  readonly lifespan: Range;
  readonly speedX: Range;
  readonly speedY: Range;
  readonly gravityY?: number;
  readonly scale: { readonly start: Range; readonly end: Range };
  readonly alpha: { readonly start: number; readonly end: number };
  /** Muted tints, one picked per particle. */
  readonly tint: readonly number[];
  /** Spin range in deg/s (omitted for none). */
  readonly rotate?: Range;
  /** Fixed angle in degrees (streaks follow their travel). */
  readonly angle?: number;
  readonly quantity: number;
  /** ms between emissions. */
  readonly frequency: number;
  /** ms of simulation run at once on start, so a weather already in the air looks settled. */
  readonly advance: number;
}

const r = (min: number, max = min): Range => ({ min, max });

/** The layers per weather kind (index kind - 1); Eclipse has none here. */
export const LAYERS: readonly (readonly WeatherLayer[])[] = [
  // Sun (fire): a low smoke haze, ash flakes sinking, a few dull embers rising and swaying.
  [
    { id: 'sunHaze', tex: 'smoke', depth: 'back', x: r(-0.1, 1.1), y: r(0.55, 1.05), lifespan: r(5000, 7000), speedX: r(10, 28), speedY: r(-14, -4),
      scale: { start: r(1.6, 2.4), end: r(2.8, 3.6) }, alpha: { start: 0.2, end: 0 }, tint: [0x4a3b30, 0x3a302a, 0x5a4636], rotate: r(-6, 6), quantity: 1, frequency: 700, advance: 5000 },
    { id: 'ash', tex: 'speck', depth: 'front', x: r(-0.05, 1.05), y: r(-0.1, 0.2), lifespan: r(4500, 7000), speedX: r(-12, 26), speedY: r(14, 34),
      scale: { start: r(0.4, 0.9), end: r(0.25, 0.5) }, alpha: { start: 0.7, end: 0 }, tint: [0x77726a, 0x59554e, 0x8a857a], rotate: r(-90, 90), quantity: 1, frequency: 170, advance: 6000 },
    { id: 'embers', tex: 'speck', depth: 'front', x: r(0, 1), y: r(0.75, 1.05), lifespan: r(2800, 4800), speedX: r(-18, 22), speedY: r(-62, -26),
      scale: { start: r(0.35, 0.7), end: r(0.05, 0.15) }, alpha: { start: 0.85, end: 0 }, tint: [0xa8602c, 0x8a4a24, 0xb87a3a, 0x70391e], quantity: 1, frequency: 240, advance: 4000 },
  ],
  // Rain (water): a cold ground fog drifting slowly, grey spray where drops land, pale falling mist streaks.
  [
    { id: 'rainFog', tex: 'smoke', depth: 'back', x: r(-0.1, 1.1), y: r(0.35, 1.0), lifespan: r(6000, 9000), speedX: r(-18, -6), speedY: r(-4, 4),
      scale: { start: r(2, 3), end: r(3.2, 4.2) }, alpha: { start: 0.2, end: 0 }, tint: [0x66737c, 0x56626b, 0x7a868d], rotate: r(-4, 4), quantity: 1, frequency: 520, advance: 7000 },
    { id: 'splash', tex: 'speck', depth: 'front', x: r(0, 1), y: r(0.88, 1.0), lifespan: r(260, 460), speedX: r(-30, 30), speedY: r(-70, -30), gravityY: 260,
      scale: { start: r(0.3, 0.55), end: r(0.1, 0.2) }, alpha: { start: 0.55, end: 0 }, tint: [0x8d9ca6, 0x77868f], quantity: 1, frequency: 55, advance: 300 },
    { id: 'rainMist', tex: 'streak', depth: 'front', x: r(-0.05, 1.05), y: r(0, 0.6), lifespan: r(900, 1300), speedX: r(-90, -60), speedY: r(520, 640), angle: 100,
      scale: { start: r(0.5, 0.9), end: r(0.4, 0.7) }, alpha: { start: 0.3, end: 0.05 }, tint: [0x8fa0aa, 0x73838d], quantity: 1, frequency: 70, advance: 900 },
  ],
  // Sandstorm (earth): blown dust clouds, gritty rock flecks skidding, tumbling dry leaves.
  [
    { id: 'dustCloud', tex: 'smoke', depth: 'back', x: r(-0.2, 0.9), y: r(0.1, 1.0), lifespan: r(3500, 5200), speedX: r(80, 150), speedY: r(-10, 10),
      scale: { start: r(1.4, 2.2), end: r(2.6, 3.4) }, alpha: { start: 0.24, end: 0 }, tint: [0x86704f, 0x6e5b42, 0x7d6a4c], rotate: r(-10, 10), quantity: 1, frequency: 300, advance: 4500 },
    { id: 'grit', tex: 'speck', depth: 'front', x: r(-0.1, 0.5), y: r(0, 0.9), lifespan: r(1400, 2400), speedX: r(160, 300), speedY: r(-10, 40), gravityY: 28,
      scale: { start: r(0.3, 0.7), end: r(0.2, 0.4) }, alpha: { start: 0.8, end: 0.1 }, tint: [0x8a7858, 0x5e5240, 0x756548], rotate: r(-200, 200), quantity: 1, frequency: 75, advance: 2400 },
    { id: 'leaves', tex: 'leaf', depth: 'front', x: r(-0.1, 0.6), y: r(-0.05, 0.7), lifespan: r(2600, 4200), speedX: r(70, 150), speedY: r(10, 50), gravityY: 14,
      scale: { start: r(0.55, 0.9), end: r(0.5, 0.8) }, alpha: { start: 0.8, end: 0 }, tint: [0x5c5a35, 0x74552a, 0x4f4a2c, 0x6a4a2a], rotate: r(-220, 220), quantity: 1, frequency: 420, advance: 4200 },
  ],
  // Gale (air): long thin wind streaks, pale dust skirling along, a faint haze.
  [
    { id: 'windStreaks', tex: 'streak', depth: 'front', x: r(-0.3, 0.6), y: r(0.05, 0.95), lifespan: r(700, 1200), speedX: r(520, 820), speedY: r(-12, 12),
      scale: { start: r(0.8, 1.6), end: r(1.2, 2.2) }, alpha: { start: 0.32, end: 0 }, tint: [0xb6bec1, 0x9ca6aa, 0xaeb3ae], quantity: 1, frequency: 90, advance: 1200 },
    { id: 'windDust', tex: 'speck', depth: 'front', x: r(-0.15, 0.5), y: r(0.1, 1.0), lifespan: r(1000, 1900), speedX: r(300, 520), speedY: r(-30, 30),
      scale: { start: r(0.3, 0.7), end: r(0.15, 0.35) }, alpha: { start: 0.65, end: 0 }, tint: [0xa39d8e, 0x8d8a82, 0xb0aa98], quantity: 1, frequency: 60, advance: 1900 },
    { id: 'windHaze', tex: 'smoke', depth: 'back', x: r(-0.2, 0.8), y: r(0.0, 0.8), lifespan: r(2500, 3500), speedX: r(160, 260), speedY: r(-6, 6),
      scale: { start: r(1.4, 2.0), end: r(2.2, 3.0) }, alpha: { start: 0.14, end: 0 }, tint: [0x8c9699, 0x7a8588], quantity: 1, frequency: 420, advance: 3500 },
  ],
];

/** Layers to run for weather `kind`: none for no weather, Eclipse, or reduced motion. */
export function activeLayers(kind: number, reduced: boolean): readonly WeatherLayer[] {
  return reduced ? [] : (LAYERS[kind - 1] ?? []);
}

/** Particles alive at once from a layer, at steady state (a budget check; Phaser pools them). */
export function steadyCount(l: WeatherLayer): number {
  return Math.ceil((l.quantity * l.lifespan.max) / l.frequency);
}

/** Total live particles for a weather kind (0 when it has no layers). */
export function kindBudget(kind: number): number {
  return (LAYERS[kind - 1] ?? []).reduce((n, l) => n + steadyCount(l), 0);
}

/** Emitter alpha for the weather's fade: the sky tint's progress (0..1) so particles ride its fade in and out. */
export function emitterFade(tint: number, base: number): number {
  return base > 0 ? Math.min(1, Math.max(0, tint / base)) : 0;
}

/** Cheap deterministic hash noise in 0..1 from integer coordinates and a seed (texture grain only). */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) % 65536) / 65535;
}

/** Smooth value noise in 0..1 on a grid of `cell` px. */
function vnoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(gx, gy, seed) + (hash2(gx + 1, gy, seed) - hash2(gx, gy, seed)) * sx;
  const b = hash2(gx, gy + 1, seed) + (hash2(gx + 1, gy + 1, seed) - hash2(gx, gy + 1, seed)) * sx;
  return a + (b - a) * sy;
}

/**
 * RGBA bytes of texture `id` (grey, tinted by the emitter): `smoke` a mottled soft blob, `speck` a gritty irregular
 * dot, `streak` a thin tapered wisp with grainy edges, `leaf` a pointed dry leaf with a dark midrib. Deterministic.
 */
export function texturePixels(id: WeatherTex): Uint8ClampedArray {
  const [w, h] = TEX_SIZE[id];
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = ((x + 0.5) / w) * 2 - 1;
      const ny = ((y + 0.5) / h) * 2 - 1;
      let a: number;
      let g: number;
      if (id === 'smoke') {
        const d = Math.sqrt(nx * nx + ny * ny);
        const n = 0.55 * vnoise(x, y, 18, 3) + 0.3 * vnoise(x, y, 8, 7) + 0.15 * hash2(x, y, 11);
        a = Math.max(0, 1 - d) ** 1.4 * (0.35 + 0.9 * n);
        g = 150 + 90 * n;
      } else if (id === 'speck') {
        const wob = 0.8 + 0.35 * hash2(Math.round((Math.atan2(ny, nx) + 3.2) * 3), 0, 5);
        const d = Math.sqrt(nx * nx + ny * ny) / wob;
        a = d < 1 ? Math.min(1, (1 - d) * 3) * (0.65 + 0.35 * hash2(x, y, 9)) : 0;
        g = 170 + 70 * hash2(x, y, 13);
      } else if (id === 'streak') {
        const taper = Math.max(0, 1 - Math.abs(nx) ** 1.5);
        const band = Math.max(0, 1 - Math.abs(ny) * (1.3 - 0.5 * taper));
        a = taper * band * (0.4 + 0.6 * hash2(x, y, 17)) * (0.5 + 0.5 * vnoise(x, y, 10, 19));
        g = 215;
      } else {
        const body = 1 - (nx * nx) / (0.95 * 0.95) - (ny * ny) / (0.55 * 0.55 * (1 + 0.5 * nx));
        a = body > 0 ? Math.min(1, body * 4) : 0;
        const rib = Math.abs(ny) < 0.09 && nx > -0.8 && nx < 0.85;
        g = (rib ? 90 : 190) + 40 * hash2(x, y, 23);
        a *= 0.85 + 0.15 * hash2(x, y, 29);
      }
      const o = (y * w + x) * 4;
      px[o] = g;
      px[o + 1] = g;
      px[o + 2] = g;
      px[o + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  }
  return px;
}
