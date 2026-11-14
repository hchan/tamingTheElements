import type Phaser from 'phaser';
import type { Element } from '@core/index';

/**
 * Signature hit effects (QA r24: most hero specials had no distinct hit effect). Each non-water element leaves its own mark on
 * the victim, in the spirit of the water frost burst (frost-view.ts): fire throws a flare with flame tongues, earth throws
 * angular rock chunks that fall back plus a dust ring on the ground, air cuts three crescent slashes, void implodes (a violet
 * ring collapses onto a dark core). One pooled Graphics, one update listener that exists only while something plays; `paused`
 * holds it. Renderer-only: callers skip it under reduced motion. At most `SIGNATURE_POOL` bursts play at once (the oldest is
 * dropped), each ends after `SIGNATURE_MS`.
 */
export const SIGNATURE_MS = 340;
export const SIGNATURE_POOL = 5;
/** Size of every mark (qa-r27: they read small at 1280x720 and on a phone); all radii, lengths and line widths below are scaled by it. */
export const SIGNATURE_SIZE = 1.5;
const K = SIGNATURE_SIZE;
const SIGNATURE_ELEMENTS: ReadonlySet<Element> = new Set<Element>(['fire', 'earth', 'air', 'void']);

/** Elements that have a signature (water has the frost burst instead). */
export const hasSignature = (el: Element | undefined): boolean => el !== undefined && SIGNATURE_ELEMENTS.has(el);

/** Progress 0..1 of a burst `age` ms in, -1 once over. Pure. */
export function signatureT(age: number): number {
  return age < 0 || age >= SIGNATURE_MS ? -1 : age / SIGNATURE_MS;
}

/** Alpha 0..1 at progress `t`: solid for the first third, then a fade. Pure. */
export function signatureAlpha(t: number): number {
  if (t < 0 || t >= 1) return 0;
  return t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65;
}

/** Fast ease-out 0..1. Pure. */
export const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/** Eight compass unit steps (no trig), rotated by `spin` quarter-steps worth of index offset. */
const COMPASS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0.7, 0.7],
  [0, 1],
  [-0.7, 0.7],
  [-1, 0],
  [-0.7, -0.7],
  [0, -1],
  [0.7, -0.7],
];

export interface SignatureLayer {
  burst(x: number, y: number, footY: number, element: Element): void;
  live(): number;
}

interface Burst {
  x: number;
  y: number;
  footY: number;
  el: Element;
  age: number;
  spin: number;
}

export function createSignatureLayer(scene: Phaser.Scene, paused: () => boolean): SignatureLayer {
  const bursts: Burst[] = [];
  let gfx: Phaser.GameObjects.Graphics | undefined;
  let attached = false;
  let seq = 0;
  const dir = (i: number, n: number, spin: number): readonly [number, number] => COMPASS[(Math.floor((i * 8) / n) + spin) % 8] ?? [1, 0];

  function drawFire(g: Phaser.GameObjects.Graphics, b: Burst, t: number, a: number): void {
    const e = easeOut(t);
    g.fillStyle(0xfff2c0, a).fillCircle(b.x, b.y, 16 * K * (1 - 0.5 * e));
    g.fillStyle(0xff7a1a, a * 0.6).fillCircle(b.x, b.y, 24 * K * (0.5 + 0.5 * e));
    for (let i = 0; i < 6; i++) {
      const ox = (i - 2.5) * 9 * K;
      const h = (22 + (i % 3) * 10) * K * e;
      const base = b.y + (6 - 4 * e) * K;
      g.fillStyle(0xff4a14, a).fillTriangle(b.x + ox - 6 * K, base, b.x + ox + 6 * K, base, b.x + ox + (i % 2 === 0 ? 2 : -2) * K, base - h * 1.5);
      g.fillStyle(0xffc040, a).fillTriangle(b.x + ox - 3.5 * K, base, b.x + ox + 3.5 * K, base, b.x + ox, base - h);
    }
  }

  function drawEarth(g: Phaser.GameObjects.Graphics, b: Burst, t: number, a: number): void {
    const e = easeOut(t);
    g.lineStyle(4, 0xc8a870, 0.7 * a).strokeEllipse(b.x, b.footY, 70 * K * (0.4 + e), 24 * K * (0.4 + e));
    g.fillStyle(0xd8c090, 0.25 * a).fillEllipse(b.x, b.footY, 60 * K * (0.4 + e), 20 * K * (0.4 + e));
    for (let i = 0; i < 8; i++) {
      const [dx, dy] = dir(i, 8, b.spin);
      // Chunks fly out and up, then gravity pulls them back down.
      const px = b.x + dx * 34 * K * e;
      const py = b.y + dy * 18 * K * e - 26 * K * e + 54 * K * t * t;
      const s = (6 + (i % 3) * 2) * K;
      g.fillStyle(0x4a3a2a, a).fillTriangle(px - s, py + s, px + s, py + s * 0.6, px - s * 0.2, py - s);
      g.fillStyle(0xb08a5a, a).fillTriangle(px - s * 0.6, py + s * 0.6, px + s * 0.5, py + s * 0.3, px - s * 0.1, py - s * 0.7);
    }
  }

  function drawAir(g: Phaser.GameObjects.Graphics, b: Burst, t: number, a: number): void {
    const e = easeOut(t);
    for (let i = 0; i < 3; i++) {
      // Three crescent slashes spinning outward at staggered radii.
      const r = (14 + i * 11) * K * (0.5 + e);
      const start = b.spin * 0.6 + i * 2.1 + e * 1.4;
      g.lineStyle((5 - i) * K, 0x9adfff, 0.5 * a).beginPath().arc(b.x, b.y, r, start, start + 1.7, false).strokePath();
      g.lineStyle(2 * K, 0xffffff, a).beginPath().arc(b.x, b.y, r, start, start + 1.7, false).strokePath();
    }
  }

  function drawVoid(g: Phaser.GameObjects.Graphics, b: Burst, t: number, a: number): void {
    const e = easeOut(t);
    // The ring collapses inward (the opposite motion of every other burst), leaving a dark core with a violet halo.
    const r = (36 * (1 - e) + 6) * K;
    g.lineStyle(4, 0xb070ff, a).strokeCircle(b.x, b.y, r);
    g.lineStyle(1.5, 0xe8d0ff, a).strokeCircle(b.x, b.y, r + 4);
    g.fillStyle(0x6a30c0, 0.45 * a).fillCircle(b.x, b.y, 18 * K * (0.6 + 0.4 * e));
    g.fillStyle(0x140424, 0.9 * a).fillCircle(b.x, b.y, 9 * K * (0.6 + 0.4 * e));
    for (let i = 0; i < 8; i++) {
      const [dx, dy] = dir(i, 8, b.spin);
      const o = r + 14 * K;
      g.fillStyle(0xd8b0ff, a).fillTriangle(
        b.x + dx * o - dy * 3,
        b.y + dy * o + dx * 3,
        b.x + dx * o + dy * 3,
        b.y + dy * o - dx * 3,
        b.x + dx * (o - 12 * K),
        b.y + dy * (o - 12 * K),
      );
    }
  }

  function draw(): void {
    if (!gfx) return;
    gfx.clear();
    for (const b of bursts) {
      const t = signatureT(b.age);
      if (t < 0) continue;
      const a = signatureAlpha(t);
      if (b.el === 'fire') drawFire(gfx, b, t, a);
      else if (b.el === 'earth') drawEarth(gfx, b, t, a);
      else if (b.el === 'air') drawAir(gfx, b, t, a);
      else if (b.el === 'void') drawVoid(gfx, b, t, a);
    }
  }
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    scene.events.off('update', tick);
    scene.events.off('shutdown', drop);
    scene.events.off('destroy', drop);
  };
  function drop(): void {
    bursts.length = 0;
    gfx = undefined;
    detach();
  }
  function tick(_time: number, delta: number): void {
    if (paused()) return;
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      if (!b) continue;
      b.age += delta;
      if (b.age >= SIGNATURE_MS) bursts.splice(i, 1);
    }
    draw();
    if (bursts.length === 0) {
      gfx?.clear();
      detach();
    }
  }
  return {
    burst(x, y, footY, element): void {
      if (!hasSignature(element)) return;
      gfx ??= scene.add.graphics().setDepth(11.5);
      if (bursts.length >= SIGNATURE_POOL) bursts.shift();
      bursts.push({ x, y, footY, el: element, age: 0, spin: seq++ % 8 });
      draw();
      if (!attached) {
        attached = true;
        scene.events.on('update', tick);
        scene.events.once('shutdown', drop);
        scene.events.once('destroy', drop);
      }
    },
    live: () => bursts.length,
  };
}
