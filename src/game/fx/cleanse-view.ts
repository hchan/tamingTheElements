import type Phaser from 'phaser';
import { SimEventKind, type RenderCharacter, type RenderView, type SimEvent } from '@core/index';
import { mute } from './grim-fx';
import { CLEANSE_TICKS, CleanseFx, CleanseShape, cleanseParts, elementOfCleanse, parts } from './cleanse-fx';

/**
 * Phaser side of the Cleanse animation (see cleanse-fx.ts). A lazy chunk the Arena mounts per match: returns an event consumer
 * that starts one effect per `cleanse` event on the casting hero; two Graphics (dark underlay, additive light) are made on the
 * first cast and redrawn on `postupdate`. Ages count view ticks, so a pause holds the frame. Removed with the scene.
 */
const DEPTH = 5.8;
const ADD = 1; // Phaser.BlendModes.ADD
type Gfx = Phaser.GameObjects.Graphics;

export interface CleanseProbe {
  /** Effects live on the last frame: hero entity id, element, age in view ticks. */
  readonly active: readonly { id: number; element: string; age: number }[];
  readonly parts: number;
  readonly reduced: boolean;
  /** Casts seen since the scene started. */
  readonly started: number;
}

const states = new WeakMap<Phaser.Scene, () => CleanseProbe>();

/** What was drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function cleanseState(arena: Phaser.Scene): CleanseProbe | undefined {
  return states.get(arena)?.();
}

function paint(g: Gfx, u: Gfx, count: number): void {
  for (let i = 0; i < count; i++) {
    const p = parts[i];
    if (!p) break;
    switch (p.shape) {
      case CleanseShape.drop:
        u.fillStyle(0x000000, 0.25 * p.a).fillCircle(p.x + 1, p.y + 2, p.s + 1.5).fillTriangle(p.x - p.s, p.y, p.x, p.y - p.s * 2.4, p.x + p.s, p.y);
        g.fillStyle(p.color, 0.7 * p.a).fillCircle(p.x, p.y, p.s).fillTriangle(p.x - p.s, p.y, p.x, p.y - p.s * 2.2, p.x + p.s, p.y);
        g.fillStyle(mute(p.color, 0.8, 1.3), 0.5 * p.a).fillCircle(p.x - p.s * 0.3, p.y - p.s * 0.2, p.s * 0.3);
        break;
      case CleanseShape.flame: {
        const hw = p.s * 0.3;
        u.fillStyle(0x000000, 0.2 * p.a).fillTriangle(p.x - hw - 2, p.y, p.x, p.y - p.s - 3, p.x + hw + 2, p.y);
        g.fillStyle(p.color, 0.25 * p.a).fillTriangle(p.x - hw * 1.5, p.y, p.x, p.y - p.s * 1.1, p.x + hw * 1.5, p.y);
        g.fillStyle(p.color, 0.45 * p.a).fillTriangle(p.x - hw, p.y, p.x, p.y - p.s, p.x + hw, p.y);
        g.fillStyle(0xe0a050, 0.5 * p.a).fillTriangle(p.x - hw * 0.4, p.y, p.x, p.y - p.s * 0.55, p.x + hw * 0.4, p.y);
        break;
      }
      case CleanseShape.shard: {
        const r = p.s;
        const c = Math.cos(p.x2) * r;
        const s = Math.sin(p.x2) * r;
        u.fillStyle(0x000000, 0.3 * p.a).fillTriangle(p.x - c + 2, p.y - s + 2, p.x + s + 2, p.y - c + 2, p.x + c + 2, p.y + s + 2);
        g.fillStyle(p.color, 0.55 * p.a).fillTriangle(p.x - c, p.y - s, p.x + s, p.y - c, p.x + c, p.y + s);
        g.lineStyle(1, mute(p.color, 0.5, 1.3), 0.45 * p.a).lineBetween(p.x - c, p.y - s, p.x + c, p.y + s);
        break;
      }
      case CleanseShape.ring:
        u.lineStyle(4, 0x000000, 0.18 * p.a).strokeEllipse(p.x, p.y, p.x2, p.y2);
        g.lineStyle(2, p.color, 0.5 * p.a).strokeEllipse(p.x, p.y, p.x2, p.y2);
        break;
      case CleanseShape.line:
        u.lineStyle(p.s + 2, 0x000000, 0.15 * p.a).lineBetween(p.x, p.y, p.x2, p.y2);
        g.lineStyle(p.s, p.color, 0.6 * p.a).lineBetween(p.x, p.y, p.x2, p.y2);
        break;
      default:
        g.fillStyle(p.color, p.a * 0.2).fillCircle(p.x, p.y, p.s * 2.2);
        g.fillStyle(mute(p.color, 0.8, 1), p.a * 0.75).fillCircle(p.x, p.y, p.s);
        break;
    }
  }
}

/**
 * Mounts the Cleanse effects; the returned consumer takes the sim events of each step. `prefs` says whether reduced motion is
 * on (read every frame, so the setting applies at once).
 */
export function mountCleanseView(arena: Phaser.Scene, view: RenderView, prefs: () => { reduceMotion: boolean }): (events: readonly SimEvent[]) => void {
  const fx = new CleanseFx();
  let under: Gfx | undefined;
  let glow: Gfx | undefined;
  let drawn: { id: number; element: string; age: number }[] = [];
  let used = 0;
  let wasReduced = false;
  let started = 0;

  const draw = (): void => {
    const now = view.tick;
    fx.prune(now);
    if (fx.live.length === 0 && drawn.length === 0) return;
    const reduced = prefs().reduceMotion;
    wasReduced = reduced;
    const u = (under ??= arena.add.graphics().setDepth(DEPTH));
    const g = (glow ??= arena.add.graphics().setDepth(DEPTH + 0.1).setBlendMode(ADD));
    u.clear();
    g.clear();
    drawn = [];
    used = 0;
    if (fx.live.length === 0) return;
    view.forEachCharacter((c: RenderCharacter) => {
      const e = fx.live.find((x) => x.id === c.id);
      if (!e) return;
      const age = now - e.born;
      const n = cleanseParts(e.element, c, age, reduced, c.id);
      paint(g, u, n);
      used += n;
      drawn.push({ id: c.id, element: e.element, age });
    });
  };

  const consume = (events: readonly SimEvent[]): void => {
    for (const e of events) {
      if (e.kind !== SimEventKind.cleanse) continue;
      let element = elementOfCleanse((e as unknown as { element: number }).element);
      view.forEachCharacter((c: RenderCharacter) => {
        if (c.id === e.sourceId) element = c.element;
      });
      fx.start(e.sourceId, element, view.tick);
      started++;
    }
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    under?.destroy();
    under = undefined;
    glow?.destroy();
    glow = undefined;
    fx.live.length = 0;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => ({ active: drawn, parts: used, reduced: wasReduced, started }));
  return consume;
}

export { CLEANSE_TICKS };
