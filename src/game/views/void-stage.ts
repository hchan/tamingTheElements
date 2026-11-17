import type Phaser from 'phaser';
import { arcadePlayfield, type RenderCharacter, type RenderView } from '@core/index';
import { arcadeHeroScale, visualBox, type Box } from './hero-scale';

/**
 * The Eternal Void's arena dressing (view only; stage 9 of the Tour). The Void boss fights on a violet swirl with no element
 * scenery, so the band above the tile floor (the wall is at world y 184, the Hud bars end near y 56) used to be empty. This
 * mounts, only when a void-element character is in the match: a painted horizon band (afterglow, floating monoliths and
 * broken gate rings, three terraces of hooded watchers lit by pale charms, a parapet with violet braziers), a few
 * additive lights that breathe and drift, and two slow rings that turn behind the boss's disc. Painted at runtime into one
 * canvas texture with deterministic grain (same look rules as stagebg.py: luminous, desaturated, textured, never outlined
 * cartoon). The clock is the fractional view tick, so `&manual=1` stepping is repeatable. Reduced motion: everything holds
 * still. Presentation only: no sim access beyond reading the view; removed with the scene.
 */
export const VOID_BAND_TOP = 40;
export const VOID_WALL_Y = 184;
/** Between the hero's backdrop (-0.95) and the tile floor (-0.8), over the (absent) element scenery layers. */
export const VOID_BAND_DEPTH = -0.9;
const LIGHT_DEPTH = -0.89;
/** Under the idle-aura back layer (-0.27) and every hero part. */
export const VOID_RING_DEPTH = -0.28;
const BAND_KEY = 'void-stage:band';
const LIGHT_KEY = 'void-stage:light';
const RING_KEY = 'void-stage:ring';
const RING_SIZE = 256;
const ADD = 1; // Phaser.BlendModes.ADD
const BENCHED_OR_DEAD = 16 | 32;
const BRAZIER_GAP = 230;
const MOTES = 14;

type Ctx2D = NonNullable<ReturnType<Phaser.Textures.CanvasTexture['getContext']>>;

/** Deterministic 0..1 hash of two integers (no Math.random: reruns paint the same band). */
export function voidHash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Triangle wave 0..1..0 with period 1. */
function tri(t: number): number {
  const f = t - Math.floor(t);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}

/** Brazier x positions across a playfield `w` px wide (pure; tests pin the spacing). */
export function brazierXs(w: number): number[] {
  const out: number[] = [];
  for (let x = BRAZIER_GAP / 2; x < w; x += BRAZIER_GAP) out.push(Math.round(x + (voidHash(x, 5) - 0.5) * 40));
  return out;
}

function glowAt(g: Ctx2D, x: number, y: number, rx: number, ry: number, rgb: string, a: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  grd.addColorStop(0, `rgba(${rgb},${String(a)})`);
  grd.addColorStop(0.45, `rgba(${rgb},${String(a * 0.35)})`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(-rx, -rx, rx * 2, rx * 2);
  g.restore();
}

function poly(g: Ctx2D, pts: readonly number[]): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i += 2) {
    if (i === 0) g.moveTo(pts[i] ?? 0, pts[i + 1] ?? 0);
    else g.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
  }
  g.closePath();
}

/** One floating monolith: a tapered, slightly tilted slab with a lit edge and a base haze. */
function monolith(g: Ctx2D, cx: number, base: number, w: number, h: number, tilt: number, seed: number): void {
  const top = base - h;
  const pts = [cx - w / 2 + tilt, base, cx - w * 0.3 + tilt * 1.6, top + h * 0.12, cx + tilt * 2, top, cx + w * 0.34 + tilt * 1.6, top + h * 0.1, cx + w / 2 + tilt, base];
  const body = g.createLinearGradient(0, top, 0, base);
  body.addColorStop(0, 'rgb(16,10,32)');
  body.addColorStop(1, 'rgb(34,22,62)');
  g.fillStyle = body;
  poly(g, pts);
  g.fill();
  // The lit flank, facing the horizon glow.
  g.fillStyle = `rgba(170,130,230,${String(0.16 + 0.1 * voidHash(seed, 1))})`;
  poly(g, [cx + tilt * 2, top, cx + w * 0.34 + tilt * 1.6, top + h * 0.1, cx + w / 2 + tilt, base, cx + w * 0.08 + tilt, base]);
  g.fill();
  g.strokeStyle = 'rgba(214,180,255,0.7)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx + tilt * 2, top);
  g.lineTo(cx + w * 0.34 + tilt * 1.6, top + h * 0.1);
  g.lineTo(cx + w / 2 + tilt, base);
  g.stroke();
  // A faint rune scratched on the face.
  if (voidHash(seed, 2) > 0.45 && h > 34) {
    g.strokeStyle = 'rgba(214,180,255,0.35)';
    g.beginPath();
    g.arc(cx + tilt * 1.2, top + h * 0.42, w * 0.13, 0, Math.PI * 2);
    g.moveTo(cx + tilt * 1.2, top + h * 0.42 - w * 0.2);
    g.lineTo(cx + tilt * 1.2, top + h * 0.42 + w * 0.2);
    g.stroke();
  }
}

/** A hooded watcher on a terrace: rounded hood, tapering shoulders; some hold up a pale lit charm. */
function watcher(g: Ctx2D, x: number, base: number, s: number, shade: number, lit: boolean): void {
  g.fillStyle = `rgb(${String(Math.round(18 + shade * 26))},${String(Math.round(12 + shade * 18))},${String(Math.round(34 + shade * 40))})`;
  g.beginPath();
  g.moveTo(x - 6 * s, base);
  g.quadraticCurveTo(x - 6.5 * s, base - 11 * s, x - 2.5 * s, base - 14 * s);
  g.arc(x, base - 17.5 * s, 3.6 * s, Math.PI * 0.85, Math.PI * 0.15, false);
  g.quadraticCurveTo(x + 6.5 * s, base - 11 * s, x + 6 * s, base);
  g.closePath();
  g.fill();
  if (lit) {
    glowAt(g, x + 5 * s, base - 15 * s, 8 * s, 8 * s, '226,200,255', 0.55);
    g.fillStyle = 'rgba(244,232,255,0.9)';
    g.beginPath();
    g.arc(x + 5 * s, base - 15 * s, 1.1 * s, 0, Math.PI * 2);
    g.fill();
  }
}

/** Paints the whole band into `g` (w x h), wall at the bottom row. */
export function paintVoidBand(g: Ctx2D, w: number, h: number): void {
  // Sky: transparent at the top (it melts into the backdrop under the Hud), a deep violet then a pale afterglow at the horizon.
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, 'rgba(20,12,44,0)');
  sky.addColorStop(0.35, 'rgba(30,18,64,0.72)');
  sky.addColorStop(0.75, 'rgba(62,36,108,0.9)');
  sky.addColorStop(1, 'rgba(118,80,170,0.95)');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (let x = 0; x < w + 400; x += 360) {
    glowAt(g, x + (voidHash(x, 7) - 0.5) * 160, h - 8, 300, 70, '150,100,220', 0.5);
    glowAt(g, x + 170, h - 4, 160, 40, '236,200,255', 0.2);
  }
  g.globalCompositeOperation = 'source-over';
  // Far monoliths, floating broken gates: the structure on the horizon.
  const FAR_BASE = h - 22;
  for (let x = -40, i = 0; x < w + 40; x += 62 + Math.round(voidHash(i, 11) * 58), i++) {
    const hh = 34 + voidHash(i, 12) * 70;
    const ww = 14 + voidHash(i, 13) * 20;
    // Far ones sink into the haze (lower contrast through globalAlpha), a few hover with a gap below.
    g.globalAlpha = 0.8 + 0.2 * voidHash(i, 14);
    monolith(g, x, FAR_BASE - (voidHash(i, 15) > 0.7 ? 10 + voidHash(i, 16) * 12 : 0), ww, hh, (voidHash(i, 17) - 0.5) * 8, i);
  }
  g.globalAlpha = 1;
  for (let x = 220, i = 0; x < w; x += 520 + Math.round(voidHash(i, 21) * 300), i++) {
    // A broken gate ring, half sunk behind the terraces.
    const r = 34 + voidHash(i, 22) * 16;
    const cy = FAR_BASE - r * 0.55;
    glowAt(g, x, cy, r * 1.7, r * 1.4, '160,110,230', 0.35);
    g.lineWidth = 3.2;
    g.strokeStyle = 'rgba(52,34,92,0.95)';
    g.beginPath();
    g.arc(x, cy, r, Math.PI * (0.78 + voidHash(i, 23) * 0.1), Math.PI * (2.25 - voidHash(i, 24) * 0.2));
    g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(210,176,255,0.5)';
    g.beginPath();
    g.arc(x, cy, r + 1.8, Math.PI * 1.1, Math.PI * 1.75);
    g.stroke();
  }
  // Haze between the far structure and the terraces.
  const haze = g.createLinearGradient(0, h - 70, 0, h - 14);
  haze.addColorStop(0, 'rgba(120,84,180,0)');
  haze.addColorStop(1, 'rgba(120,84,180,0.38)');
  g.fillStyle = haze;
  g.fillRect(0, h - 70, w, 56);
  // Three terraces of watchers, back to front: higher, dimmer, smaller at the back; a lit charm here and there.
  const TIERS = [{ base: h - 36, s: 0.62, shade: 0.9, step: 15 }, { base: h - 26, s: 0.78, shade: 0.55, step: 18 }, { base: h - 15, s: 0.95, shade: 0.2, step: 22 }];
  TIERS.forEach((t, ti) => {
    g.fillStyle = `rgb(${String(26 + (2 - ti) * 3)},${String(16 + (2 - ti) * 2)},${String(46 + (2 - ti) * 6)})`;
    g.fillRect(0, t.base, w, h - t.base);
    g.fillStyle = 'rgba(176,138,232,0.34)';
    g.fillRect(0, t.base, w, 1);
    for (let x = 6 + ti * 5, i = 0; x < w; x += t.step + Math.round(voidHash(i + ti * 997, 31) * 7), i++) {
      if (voidHash(i + ti * 997, 32) < 0.14) continue; // gaps in the rows
      watcher(g, x, t.base + 1, t.s, t.shade, voidHash(i + ti * 997, 33) > 0.9);
    }
  });
  // Parapet at the wall, braziers' pedestals, and the rim light along its lip.
  const par = g.createLinearGradient(0, h - 12, 0, h);
  par.addColorStop(0, 'rgb(46,30,78)');
  par.addColorStop(1, 'rgb(20,12,38)');
  g.fillStyle = par;
  g.fillRect(0, h - 12, w, 12);
  g.fillStyle = 'rgba(206,170,255,0.5)';
  g.fillRect(0, h - 12, w, 1);
  for (const bx of brazierXs(w)) {
    g.fillStyle = 'rgb(34,22,60)';
    poly(g, [bx - 9, h - 12, bx - 6, h - 24, bx + 6, h - 24, bx + 9, h - 12]);
    g.fill();
    g.fillStyle = 'rgba(206,170,255,0.45)';
    g.fillRect(bx - 6, h - 24, 12, 1);
    g.globalCompositeOperation = 'lighter';
    glowAt(g, bx, h - 28, 26, 26, '170,120,255', 0.55);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(232,214,255,0.9)';
    poly(g, [bx - 3, h - 24, bx, h - 34, bx + 3, h - 24]);
    g.fill();
  }
  // Grain and a little desaturation, so it reads painted, not vector.
  const img = g.getImageData(0, 0, w, h);
  const px = img.data;
  for (let i = 0, p = 0; i + 3 < px.length; i += 4, p++) {
    if ((px[i + 3] ?? 0) === 0) continue;
    const n = (voidHash(p, 41) - 0.5) * 16;
    const r = px[i] ?? 0;
    const gg = px[i + 1] ?? 0;
    const b = px[i + 2] ?? 0;
    const lum = (r + gg + b) / 3;
    px[i] = Math.max(0, Math.min(255, r + (lum - r) * 0.12 + n));
    px[i + 1] = Math.max(0, Math.min(255, gg + (lum - gg) * 0.12 + n));
    px[i + 2] = Math.max(0, Math.min(255, b + (lum - b) * 0.12 + n));
  }
  g.putImageData(img, 0, 0);
}

function ensureTextures(scene: Phaser.Scene, w: number, h: number): boolean {
  if (!scene.textures.exists(BAND_KEY)) {
    const tex = scene.textures.createCanvas(BAND_KEY, w, h);
    const g = tex?.getContext();
    if (!tex || !g) return false;
    paintVoidBand(g, w, h);
    tex.refresh();
  }
  if (!scene.textures.exists(LIGHT_KEY)) {
    const tex = scene.textures.createCanvas(LIGHT_KEY, 64, 64);
    const g = tex?.getContext();
    if (!tex || !g) return false;
    glowAt(g, 32, 32, 32, 32, '255,255,255', 1);
    tex.refresh();
  }
  if (!scene.textures.exists(RING_KEY)) {
    const tex = scene.textures.createCanvas(RING_KEY, RING_SIZE, RING_SIZE);
    const g = tex?.getContext();
    if (!tex || !g) return false;
    const c = RING_SIZE / 2;
    glowAt(g, c, c, c, c, '255,255,255', 0.3);
    // Two thin spiral arms and a dashed outer ring, white (tinted by the image), faded toward the arm tips.
    for (let arm = 0; arm < 3; arm++) {
      for (let k = 0; k < 60; k++) {
        const t = k / 60;
        const a = arm * 2.094 + t * 3.4;
        const r = 26 + t * (c - 34);
        g.fillStyle = `rgba(255,255,255,${String(0.55 * (1 - t) + 0.05)})`;
        g.beginPath();
        g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 2.4 - t * 1.4, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1.5;
    for (let d = 0; d < 16; d++) {
      g.beginPath();
      g.arc(c, c, c - 6, d * 0.3927, d * 0.3927 + 0.2);
      g.stroke();
    }
    tex.refresh();
  }
  return true;
}

export interface VoidStageProbe {
  /** True once a void character was found and the band is mounted. */
  readonly mounted: boolean;
  readonly reduced: boolean;
  /** Ring rotation (radians) of the first ring, and its current scale. */
  readonly ringAngle: number;
  readonly ringScale: number;
}

const probes = new WeakMap<Phaser.Scene, () => VoidStageProbe>();
/** Test probe: undefined before the view mounts. */
export function voidStageState(scene: Phaser.Scene): VoidStageProbe | undefined {
  return probes.get(scene)?.();
}

export function mountVoidStage(arena: Phaser.Scene, view: RenderView, alpha: () => number, reduceMotion: () => boolean, pos: () => number = alpha): void {
  const w = arcadePlayfield().w;
  const h = VOID_WALL_Y - VOID_BAND_TOP;
  const decor: Phaser.GameObjects.Image[] = [];
  const braziers: Phaser.GameObjects.Image[] = [];
  const motes: Phaser.GameObjects.Image[] = [];
  const rings: Phaser.GameObjects.Image[] = [];
  let glow: Phaser.GameObjects.Image | undefined;
  let built = false;
  let checks = 0;
  const box: Box = { x: 0, y: 0, w: 0, h: 0 };
  const boss = { found: false, x: 0, y: 0, h: 0 };
  let reducedNow = false;

  const build = (): void => {
    built = true;
    if (!ensureTextures(arena, w, h)) return;
    decor.push(arena.add.image(0, VOID_BAND_TOP, BAND_KEY).setOrigin(0, 0).setDepth(VOID_BAND_DEPTH));
    glow = arena.add.image(w / 2, VOID_WALL_Y - 10, LIGHT_KEY).setDisplaySize(w * 0.9, 150).setTint(0x9a6bff).setBlendMode(ADD).setDepth(LIGHT_DEPTH).setAlpha(0.28);
    for (const bx of brazierXs(w)) braziers.push(arena.add.image(bx, VOID_WALL_Y - 28, LIGHT_KEY).setDisplaySize(70, 70).setTint(0xb48cff).setBlendMode(ADD).setDepth(LIGHT_DEPTH).setAlpha(0.5));
    for (let i = 0; i < MOTES; i++) {
      motes.push(arena.add.image(0, 0, LIGHT_KEY).setDisplaySize(10, 10).setTint(0xdcc8ff).setBlendMode(ADD).setDepth(LIGHT_DEPTH).setAlpha(0));
    }
    for (let i = 0; i < 2; i++) rings.push(arena.add.image(0, 0, RING_KEY).setTint(i === 0 ? 0xa67cff : 0xe0cfff).setBlendMode(ADD).setDepth(VOID_RING_DEPTH).setVisible(false));
  };

  const find = (c: RenderCharacter): void => {
    if (c.element !== 'void' || (c.flags & BENCHED_OR_DEAD) !== 0) return;
    const a = pos();
    visualBox(c.px + (c.x - c.px) * a, c.py + (c.y - c.py) * a, c.w, c.h, view.arcade() ? arcadeHeroScale(c.h) : 1, box, view.arcade() ? arcadePlayfield().w : undefined);
    boss.found = true;
    boss.x = box.x + box.w / 2;
    boss.y = box.y + box.h * 0.5;
    boss.h = box.h;
  };

  const seen = { void: false };
  const scan = (c: RenderCharacter): void => {
    if (c.element === 'void') seen.void = true;
  };

  const hasVoid = (): boolean => {
    seen.void = false;
    view.forEachCharacter(scan);
    return seen.void;
  };

  const frame = (): void => {
    if (!built) {
      // The sim fills the view on the first ticks: look a few frames for a void fighter, then give up.
      if (hasVoid()) build();
      else if (++checks > 30) arena.events.off('postupdate', frame);
      return;
    }
    if (decor.length === 0) return;
    const still = reduceMotion();
    reducedNow = still;
    const t = still ? 0 : view.tick + alpha();
    if (glow) glow.setAlpha(still ? 0.28 : 0.24 + 0.08 * tri(t / 160));
    braziers.forEach((b, i) => {
      b.setAlpha(still ? 0.5 : 0.38 + 0.22 * tri(t / (46 + (i % 3) * 9) + voidHash(i, 3)));
    });
    motes.forEach((m, i) => {
      if (still) {
        m.setAlpha(0);
        return;
      }
      // Slow rising motes over the terraces, each on its own phase: nothing allocated, nothing random.
      const life = tri(t / (300 + (i % 5) * 70) + voidHash(i, 51));
      const f = (t / (300 + (i % 5) * 70) + voidHash(i, 51)) % 1;
      m.setPosition(voidHash(i, 52) * w + Math.sin(t / 90 + i) * 8, VOID_WALL_Y - 12 - f * 96).setAlpha(0.55 * Math.sin(f * Math.PI) * (0.5 + life * 0.5));
    });
    boss.found = false;
    view.forEachCharacter(find);
    rings.forEach((r, i) => {
      r.setVisible(boss.found);
      if (!boss.found) return;
      const breathe = still ? 1 : 1 + 0.035 * Math.sin(t / 38 + i * 1.7);
      const size = boss.h * (i === 0 ? 1.75 : 1.2) * breathe;
      r.setPosition(boss.x, boss.y).setDisplaySize(size, size).setRotation(still ? i * 0.9 : (i === 0 ? 1 : -1.6) * t * 0.0045 + i * 0.9).setAlpha(i === 0 ? 0.55 : 0.4);
    });
  };

  arena.events.on('postupdate', frame);
  probes.set(arena, () => ({
    mounted: decor.length > 0,
    reduced: reducedNow,
    ringAngle: rings[0]?.rotation ?? 0,
    ringScale: rings[0] ? rings[0].displayWidth / Math.max(1, boss.h * 1.75) : 1,
  }));
  arena.events.once('shutdown', () => {
    arena.events.off('postupdate', frame);
    probes.delete(arena);
    // Game objects and textures go with the scene / game; the textures are cheap and reused on a rematch.
  });
}
