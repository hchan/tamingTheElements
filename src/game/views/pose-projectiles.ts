import type { RenderProjectile } from '@core/index';
import { SMOOTH_KIND, columnEnvelope } from '../fx/ability-smooth';
import { fireBlastFxStrength } from '../fx/fire-blast-fade';
import type { ProjectileView } from './projectile-view';
import type { PoseVfx } from './pose-vfx';
import type { GhostPool } from './pose-ghosts';
import { SLOTS, type PoseClock } from './pose-layer-types';
import { easeOutCubic, follow, shortestArc } from './pose-math';

const SPAWN_MS = 60;
const SPAWN_FROM = 0.6;
/** Spawn ease-in never dims a bolt below this alpha (a fully transparent first frames hid thin sprites such as Strangling Branches). */
const SPAWN_ALPHA_FLOOR = 0.55;
const ROT_TAU_MS = 45;

/**
 * Per projectile slot: shortest-arc rotation easing, the spawn ease-in, the trail and impact VFX, and the fade-out ghost when
 * the slot is no longer drawn. `onCast` is called when a projectile is first seen (Arcade) and returns the caster's element
 * index, or -1 when no caster was found.
 */
export class PoseProjectiles {
  private readonly pid = new Int32Array(SLOTS).fill(-1);
  private readonly born = new Float64Array(SLOTS);
  private readonly ang = new Float64Array(SLOTS);
  private readonly seen = new Int32Array(SLOTS);
  private readonly pel = new Uint8Array(SLOTS);
  private readonly snap = new Float64Array(SLOTS * 5);
  private readonly snapAlpha = new Float64Array(SLOTS).fill(1);
  private readonly snapKey: string[] = new Array<string>(SLOTS).fill('');
  private readonly snapFrame: string[] = new Array<string>(SLOTS).fill('');
  /** Tornado columns (sprite kind 'column'): their size before the grow-in is kept for the shrink-out ghost. */
  private readonly isColumn = new Uint8Array(SLOTS);

  constructor(
    private readonly clk: PoseClock,
    private readonly peek: (id: number) => Pick<ProjectileView, 'image' | 'glow'> | undefined,
    private readonly vfx: PoseVfx,
    private readonly ghosts: GhostPool,
    private readonly onCast: (p: RenderProjectile) => number,
  ) {}

  /** Retires every slot that was not drawn this frame (hit or expired). */
  endFrame(): void {
    for (let i = 0; i < SLOTS; i++) {
      if (this.pid[i] !== -1 && this.seen[i] !== this.clk.frameNo) this.retire(i);
    }
  }

  update(p: RenderProjectile): void {
    const v = this.peek(p.id);
    if (!v) return;
    const { dt, animMs, reduced } = this.clk;
    const i = p.id & (SLOTS - 1);
    const { image, glow } = v;
    const target = image.angle;
    let fresh = false;
    const column = SMOOTH_KIND[p.sprite] === 'column';
    if (this.pid[i] !== p.id) {
      this.pid[i] = p.id;
      this.isColumn[i] = column ? 1 : 0;
      this.born[i] = animMs;
      this.ang[i] = target;
      fresh = true;
      if (this.clk.arcade) {
        const el = this.onCast(p);
        if (el >= 0) this.pel[i] = el;
      }
    } else if (dt > 0) {
      this.ang[i] = (this.ang[i] ?? target) + shortestArc(this.ang[i] ?? target, target) * follow(dt, ROT_TAU_MS);
    }
    this.seen[i] = this.clk.frameNo;
    if (this.clk.arcade) this.vfx.trail(i, image.x, image.y, this.pel[i] ?? 0, fresh, reduced, fireBlastFxStrength(p.alphaPm));
    const a = this.ang[i] ?? target;
    const k = easeOutCubic((animMs - (this.born[i] ?? 0)) / SPAWN_MS);
    const o = i * 5;
    let lift = 0;
    if (column) {
      // A tornado column grows in over its own envelope (not the 60 ms bolt ease), pinned at its base.
      this.snap[o + 2] = image.displayWidth;
      this.snap[o + 3] = image.displayHeight;
      const env = columnEnvelope(animMs - (this.born[i] ?? 0), 1e9, reduced);
      lift = (1 - env.scaleY) * image.displayHeight / 2;
      image.setAngle(a).setScale(image.scaleX, image.scaleY * env.scaleY).setPosition(image.x, image.y + lift).setAlpha(image.alpha * env.alpha);
      glow.setAngle(a).setScale(glow.scaleX, glow.scaleY * env.scaleY).setPosition(glow.x, glow.y + lift).setAlpha(glow.alpha * env.alpha);
    } else {
      const grow = reduced ? 1 : SPAWN_FROM + (1 - SPAWN_FROM) * k;
      image.setAngle(a).setScale(image.scaleX * grow, image.scaleY * grow);
      glow.setAngle(a).setScale(glow.scaleX * grow, glow.scaleY * grow);
    }
    if (!column && k < 1) {
      const ka = SPAWN_ALPHA_FLOOR + (1 - SPAWN_ALPHA_FLOOR) * k;
      image.setAlpha(image.alpha * ka);
      glow.setAlpha(glow.alpha * ka);
    }
    this.snap[o] = image.x;
    this.snap[o + 1] = image.y - lift;
    if (!column) {
      this.snap[o + 2] = image.displayWidth;
      this.snap[o + 3] = image.displayHeight;
    }
    this.snap[o + 4] = a;
    this.snapAlpha[i] = (p.alphaPm ?? 1000) / 1000;
    this.snapKey[i] = image.texture.key;
    this.snapFrame[i] = image.frame.name;
  }

  /** A projectile slot that was not drawn this frame has hit or expired: fade its last pose out. */
  private retire(i: number): void {
    this.pid[i] = -1;
    const o = i * 5;
    const column = this.isColumn[i] === 1;
    this.isColumn[i] = 0;
    if (this.clk.arcade && !column) this.vfx.impact(this.snap[o] ?? 0, this.snap[o + 1] ?? 0, this.pel[i] ?? 0, this.clk.reduced, fireBlastFxStrength((this.snapAlpha[i] ?? 1) * 1000));
    this.ghosts.fadeProjectile(column, this.snap, o, this.snapAlpha[i] ?? 1, this.snapKey[i] ?? '__DEFAULT', this.snapFrame[i] ?? '');
  }
}
