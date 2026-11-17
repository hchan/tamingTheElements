/**
 * The portrait phone view shows a tall band of sky above the stage's far wall. This is its dressing (render only): a stage-coloured
 * horizon glow and a drifting field of motes (embers, spray, spores, wisps) that thins out upward, so the band reads as air, not as
 * an empty gradient. Pure numbers plus a 2D-canvas painter; no Phaser here.
 */

/** Per stage (fire, water, earth, air): mote colour and horizon glow colour (the same family as terrain-ambient's LOOK table). */
export const SKY_LOOK: Readonly<Record<string, { readonly mote: number; readonly glow: number }>> = {
  fire: { mote: 0xffa347, glow: 0xb8481a },
  water: { mote: 0xa8e2ff, glow: 0x2f78a8 },
  earth: { mote: 0xe6d890, glow: 0x6a8a3a },
  air: { mote: 0xe4f0ff, glow: 0x7a92c0 },
};

export const DUST_W = 960;
export const DUST_H = 350;
/** Motes per field, and the share of the field's height (from the bottom) that holds them. */
const COUNT = 170;
const BOTTOM_CLEAR = 0.06;

/** A small deterministic stream (mulberry32): the field is the same on every run, so screenshots compare. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Where mote `i` of a field sits (x wraps; y is denser toward the bottom, the horizon) and its radius and alpha. */
export function dustMote(rnd: () => number): { x: number; y: number; r: number; a: number } {
  const x = rnd() * DUST_W;
  const y = (1 - rnd() ** 1.7) * DUST_H * (1 - BOTTOM_CLEAR);
  const r = 0.7 + rnd() * rnd() * 1.9;
  const a = 0.25 + rnd() * 0.6;
  return { x, y, r, a };
}

/** Paints the mote field (transparent background) for `element` into a DUST_W x DUST_H canvas context. */
export function paintSkyDust(ctx: CanvasRenderingContext2D, element: string): void {
  const look = SKY_LOOK[element];
  ctx.clearRect(0, 0, DUST_W, DUST_H);
  if (!look) return;
  const rnd = stream(0x5eed + element.length * 977 + (element.codePointAt(0) ?? 0));
  const rgb = `${String((look.mote >> 16) & 255)},${String((look.mote >> 8) & 255)},${String(look.mote & 255)}`;
  for (let i = 0; i < COUNT; i++) {
    const m = dustMote(rnd);
    const reps = m.x < 6 ? [m.x, m.x + DUST_W] : m.x > DUST_W - 6 ? [m.x, m.x - DUST_W] : [m.x];
    for (const x of reps) {
      ctx.fillStyle = `rgba(${rgb},${String(m.a * 0.22)})`;
      ctx.beginPath();
      ctx.arc(x, m.y, m.r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${rgb},${String(m.a)})`;
      ctx.beginPath();
      ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
