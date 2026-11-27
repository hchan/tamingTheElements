import type Phaser from 'phaser';
import { COLUMN_FADE_MS, columnEnvelope } from '../fx/ability-smooth';
import { REDUCED_FADE_MS } from '../fx/motion';
import type { SheetBook } from './pose-sheets';
import { fitToBox } from './hero-scale';
import { easeOutCubic, koFall, resetPose, type Pose } from './pose-math';
import { SLOTS, posePivot, type PoseClock } from './pose-layer-types';

const FADE_MS = 220;
const FADE_GROW = 0.35;
const GHOST_ALPHA = 0.95;
const KO_MS = 700;
const GHOSTS = 8;
/** Ghost kinds: projectile fade (0), KO fall (1), tornado shrink-out. */
const GHOST_COLUMN = 2;

interface Ghost {
  readonly image: Phaser.GameObjects.Image;
  /** Start of the fade on the animation clock; negative infinity while free. */
  from: number;
  ms: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  /** Opacity the fading projectile had when it left (Fire Blast falloff); 1 otherwise. */
  alpha: number;
  /** 0 projectile fade (centre origin), 1 KO fall (feet pivot, top-left origin), 2 tornado shrink-out (centre origin). */
  kind: number;
  dir: number;
  /** KO fall: the sprite and facing, to play its sheet's `ko` row when it has one. */
  sprite: string;
  face: number;
  /** KO fall: the fallen hero's team (-1 otherwise), so only that team's tag-in clears it. */
  team: number;
}

/** The fixed pool of fading copies: projectile fade-outs, tornado shrink-outs and KO falls. */
export class GhostPool {
  private readonly ghosts: Ghost[] = [];
  private readonly pose: Pose = resetPose({ sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, alpha: 1 });

  constructor(private readonly scene: Phaser.Scene, private readonly clk: PoseClock, private readonly book: SheetBook) {}

  /** Ghosts in use (test probe). */
  get live(): number {
    let n = 0;
    for (const g of this.ghosts) if (g.from > Number.NEGATIVE_INFINITY) n++;
    return n;
  }

  /** A projectile's last pose (`snap` slot offset `o`) fading out; `column`: a tornado shrinking toward its base. */
  fadeProjectile(column: boolean, snap: Float64Array, o: number, alpha: number, key: string, frame: string): void {
    const g = this.free();
    if (!g) return;
    g.kind = column ? GHOST_COLUMN : 0;
    g.from = this.clk.animMs;
    g.ms = column ? (this.clk.reduced ? REDUCED_FADE_MS : COLUMN_FADE_MS) : FADE_MS;
    g.x = snap[o] ?? 0;
    g.y = snap[o + 1] ?? 0;
    g.w = snap[o + 2] ?? 0;
    g.h = snap[o + 3] ?? 0;
    g.rot = snap[o + 4] ?? 0;
    g.alpha = alpha;
    g.image.setTexture(key, frame).setOrigin(0.5, 0.5).setVisible(true);
  }

  /** The KO fall of character `id`: a ghost copy of its last drawn image falls over and fades while the real one is hidden. */
  knockOut(img: Phaser.GameObjects.Image, team: number, base: Float64Array, id: number, sprite: string, face: number): void {
    const g = this.free();
    if (!g) return;
    g.kind = 1;
    g.team = team;
    g.from = this.clk.animMs;
    g.ms = KO_MS;
    g.dir = img.flipX ? 1 : -1;
    // The visual box (not the drawn frame, which may carry overscan): the fall pivots on the feet.
    const o = (id & (SLOTS - 1)) * 4;
    g.w = base[o + 2] ?? img.displayWidth;
    g.h = base[o + 3] ?? img.displayHeight;
    g.x = (base[o] ?? img.x) + g.w / 2;
    g.y = (base[o + 1] ?? img.y) + g.h;
    g.rot = 0;
    g.sprite = sprite;
    g.face = face;
    g.image.setTexture(img.texture.key, img.frame.name).setOrigin(0, 0).setFlipX(img.flipX).setVisible(true).setDepth(img.depth - 0.2);
  }

  /** A KO'd hero's partner tags in where it fell (QA r34, r74, r75): that team's KO ghost goes at once ("opaque or gone"), so only the arriving hero shows. */
  clearKo(team: number): void {
    for (const g of this.ghosts) {
      if (g.kind !== 1 || g.from === Number.NEGATIVE_INFINITY || g.team !== team) continue;
      g.from = Number.NEGATIVE_INFINITY;
      g.image.setVisible(false);
    }
  }

  private free(): Ghost | undefined {
    for (const g of this.ghosts) {
      if (g.from !== Number.NEGATIVE_INFINITY) continue;
      g.alpha = 1;
      g.team = -1;
      return g;
    }
    if (this.ghosts.length >= GHOSTS) return undefined;
    const image = this.scene.add.image(0, 0, '__DEFAULT').setVisible(false);
    const g: Ghost = { image, from: Number.NEGATIVE_INFINITY, ms: 0, x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 1, kind: 0, dir: 1, sprite: '', face: 0, team: -1 };
    this.ghosts.push(g);
    return g;
  }

  fade(): void {
    const { animMs, reduced } = this.clk;
    for (const g of this.ghosts) {
      if (g.from === Number.NEGATIVE_INFINITY) continue;
      const t = (animMs - g.from) / g.ms;
      if (t >= 1) {
        g.from = Number.NEGATIVE_INFINITY;
        g.image.setVisible(false);
        continue;
      }
      const img = g.image;
      if (g.kind === GHOST_COLUMN) {
        // Tornado ending (early or not): shrink toward its base while fading, instead of the generic grow-and-fade.
        const env = columnEnvelope(1e6, 1e6 + (1 - t) * g.ms, reduced);
        img.setPosition(g.x, g.y + ((1 - env.scaleY) * g.h) / 2).setDisplaySize(g.w, g.h * env.scaleY).setAngle(g.rot).setAlpha(GHOST_ALPHA * g.alpha * env.alpha);
        img.setDepth(1);
      } else if (g.kind === 0) {
        const grow = reduced ? 1 : 1 + FADE_GROW * easeOutCubic(t);
        img.setPosition(g.x, g.y).setDisplaySize(g.w * grow, g.h * grow).setAngle(g.rot).setAlpha(GHOST_ALPHA * g.alpha * (1 - t));
        img.setDepth(1);
      } else {
        const p = resetPose(this.pose);
        koFall(p, t, g.dir, reduced);
        // A sheet's own KO row replaces the procedural fall-over (the fade stays).
        const ko = this.book.has(g.sprite) ? this.book.frame(g.sprite, 'ko', g.face, t * KO_MS) : undefined;
        if (ko) {
          img.setTexture(this.book.texture(g.sprite, ko.texture), ko.frame).setFlipX(ko.flipX);
          p.rot = 0;
          p.ox = 0;
          p.oy = 0;
        }
        fitToBox(img, g.x - g.w / 2, g.y - g.h, g.w, g.h);
        img.setAlpha(1);
        posePivot(img, g.x, g.y, p);
      }
    }
  }

  destroy(): void {
    for (const g of this.ghosts) g.image.destroy();
    this.ghosts.length = 0;
  }
}
