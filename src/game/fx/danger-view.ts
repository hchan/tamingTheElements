import type Phaser from 'phaser';
import type { RenderProjectile, RenderView } from '@core/index';
import { bracketLen, dangerAlpha, dashBox } from './danger-zone';

/**
 * Phaser side of the melee danger-zone outline (ability-telegraphs, first slice; see danger-zone.ts). Lazy chunk mounted by
 * the Arena in every match: one Graphics redrawn on `postupdate`, outlining each live melee box at its true hit size. Age is
 * counted in view ticks from the first frame an entity id is seen, so it holds while the sim is paused. Reduced motion:
 * steady alpha. Removed with the scene.
 */
const DEPTH = 0.9;

export interface DangerBox {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly alpha: number;
}

const states = new WeakMap<Phaser.Scene, () => readonly DangerBox[]>();

/** The outlines drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function dangerState(arena: Phaser.Scene): readonly DangerBox[] | undefined {
  return states.get(arena)?.();
}

export function mountDangerView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let g: Phaser.GameObjects.Graphics | undefined;
  let boxes: DangerBox[] = [];
  const born = new Map<number, number>();
  let seen = new Set<number>();
  let reduced = false;

  const visit = (p: RenderProjectile): void => {
    seen.add(p.id);
    if (!born.has(p.id)) born.set(p.id, view.tick);
    const alpha = dangerAlpha(view.tick - (born.get(p.id) ?? view.tick), reduced);
    boxes.push({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h, alpha });
  };

  const draw = (): void => {
    reduced = reduceMotion();
    boxes = [];
    seen = new Set();
    view.forEachProjectile(visit, true);
    for (const id of [...born.keys()]) if (!seen.has(id)) born.delete(id);
    if (boxes.length === 0 && !g) return;
    g ??= arena.add.graphics().setDepth(DEPTH);
    g.clear();
    for (const b of boxes) {
      g.fillStyle(0xffffff, 0.08 * b.alpha).fillRect(b.x, b.y, b.w, b.h);
      const k = bracketLen(b.w, b.h);
      for (const [color, width, a] of [[0x000000, 5, 0.7], [0xffffff, 2, 1]] as const) {
        g.lineStyle(width, color, b.alpha * a);
        for (const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] of dashBox(b.x, b.y, b.w, b.h)) g.lineBetween(x0, y0, x1, y1);
        for (const [cx, cy, sx, sy] of [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]] as const) {
          g.lineBetween(cx, cy, cx + sx * k, cy).lineBetween(cx, cy, cx, cy + sy * k);
        }
      }
    }
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    g?.destroy();
    g = undefined;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => boxes);
}
