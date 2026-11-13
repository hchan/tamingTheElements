import type Phaser from 'phaser';
import { EntityFlag, type RenderCharacter, type RenderView } from '@core/index';
import { mute } from './grim-fx';
import { OWN_COLORS, Shape, fillParts, healTick, ownElementKind, parts, pulseLook } from './own-element-fx';

/**
 * Phaser side of the own-element patch effects (see own-element-fx.ts). A lazy chunk the Arena mounts in every Arcade match:
 * two Graphics (smoky underlay, additive glow) redrawn on `postupdate`, no per-hero objects, so nothing can leak; per-hero
 * state (when the effect began, last HP) lives in a Map and is recycled through a free list. An effect starts the first frame a
 * hero stands on a patch of its element and stops the first frame it does not (left, benched, dead, stage swapped). Ages
 * count view ticks, so they hold while the sim is paused. Removed with the scene.
 */
const DEPTH = 5.9;
const ADD = 1; // Phaser.BlendModes.ADD
type Gfx = Phaser.GameObjects.Graphics;

export interface OwnElementProbe {
  /** The heroes showing an effect on the last frame: entity id, team, element index (1 fire .. 4 air), age in view ticks, pulse live. */
  readonly active: readonly { id: number; team: number; kind: number; age: number; pulse: boolean }[];
  /** Parts painted on the last frame, and whether it was drawn in reduced motion (static glow). */
  readonly parts: number;
  readonly reduced: boolean;
}

const states = new WeakMap<Phaser.Scene, () => OwnElementProbe>();

/** What was drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function ownElementState(arena: Phaser.Scene): OwnElementProbe | undefined {
  return states.get(arena)?.();
}

interface Hero {
  born: number;
  hp: number;
  pulseAt: number;
  seen: boolean;
}

/** Paints the first `count` entries of the parts pool: `u` is the dark smoky underlay, `g` the additive light. */
function paint(g: Gfx, u: Gfx, count: number): void {
  for (let i = 0; i < count; i++) {
    const p = parts[i];
    if (!p) break;
    switch (p.shape) {
      case Shape.glow:
        for (let k = 3; k >= 1; k--) g.fillStyle(p.color, 0.05).fillEllipse(p.x, p.y, p.s * (0.6 + k * 0.35), p.s * (0.2 + k * 0.1));
        break;
      case Shape.mote:
        g.fillStyle(p.color, p.a * 0.2).fillCircle(p.x, p.y, p.s * 2.4);
        g.fillStyle(mute(p.color, 0.8, 1), p.a * 0.75).fillCircle(p.x, p.y, p.s);
        break;
      case Shape.ring:
        u.lineStyle(4, 0x000000, p.a * 0.15).strokeEllipse(p.x, p.y, p.s * 2, p.s * 0.55);
        g.lineStyle(2, p.color, p.a * 0.35).strokeEllipse(p.x, p.y, p.s * 2, p.s * 0.55);
        break;
      case Shape.flame: {
        const hw = p.s * 0.28;
        u.fillStyle(0x000000, 0.18).fillTriangle(p.x - hw - 2, p.y, p.x, p.y - p.s - 3, p.x + hw + 2, p.y);
        g.fillStyle(p.color, 0.1 * p.a).fillTriangle(p.x - hw * 1.6, p.y, p.x, p.y - p.s * 1.1, p.x + hw * 1.6, p.y);
        g.fillStyle(p.color, 0.22 * p.a).fillTriangle(p.x - hw, p.y, p.x, p.y - p.s, p.x + hw, p.y);
        g.fillStyle(0xe0a050, 0.3 * p.a).fillTriangle(p.x - hw * 0.45, p.y, p.x, p.y - p.s * 0.6, p.x + hw * 0.45, p.y);
        break;
      }
      case Shape.plate: {
        // A rotated shard: two triangles with a faint crack line, over a dark offset shadow.
        const c = Math.cos(p.rot) * p.s;
        const s = Math.sin(p.rot) * p.s;
        u.fillStyle(0x000000, 0.2).fillTriangle(p.x - c + 2, p.y - s + 2, p.x + s + 2, p.y - c + 2, p.x + c + 2, p.y + s + 2);
        g.fillStyle(p.color, 0.5 * p.a).fillTriangle(p.x - c, p.y - s, p.x + s, p.y - c, p.x + c, p.y + s);
        g.fillStyle(p.color, 0.4 * p.a).fillTriangle(p.x - c, p.y - s, p.x + c, p.y + s, p.x - s, p.y + c);
        g.lineStyle(1, mute(p.color, 0.5, 1.2), 0.35 * p.a).lineBetween(p.x - c, p.y - s, p.x + c, p.y + s);
        break;
      }
      case Shape.streak: {
        // A wind swirl: an elliptical arc a little over a half turn, thinning to its tail.
        let px = p.x + Math.cos(p.rot) * p.s;
        let py = p.y + Math.sin(p.rot) * p.s * 0.35;
        for (let k = 1; k <= 7; k++) {
          const a = p.rot + k * 0.28;
          const x = p.x + Math.cos(a) * p.s;
          const y = p.y + Math.sin(a) * p.s * 0.35;
          const f = 1 - k / 8;
          u.lineStyle(4, 0x000000, 0.12 * f).lineBetween(px, py, x, y);
          g.lineStyle(1 + 2 * f, p.color, 0.5 * f * p.a).lineBetween(px, py, x, y);
          px = x;
          py = y;
        }
        break;
      }
    }
  }
}

/** The heal plus over a water hero: a dark plate, a pale muted-green cross and a faint glow. */
function plus(g: Gfx, u: Gfx, x: number, y: number, scale: number, alpha: number): void {
  const L = 9 * scale;
  const T = 3.2 * scale;
  u.fillStyle(0x000000, 0.25 * alpha).fillRect(x - L - 1.5, y - T - 1.5, 2 * L + 3, 2 * T + 3).fillRect(x - T - 1.5, y - L - 1.5, 2 * T + 3, 2 * L + 3);
  g.fillStyle(0xa8c8b0, 0.75 * alpha).fillRect(x - L, y - T, 2 * L, 2 * T).fillRect(x - T, y - L, 2 * T, 2 * L);
  g.fillStyle(OWN_COLORS[1], 0.12 * alpha).fillCircle(x, y, L * 1.8);
}

export function mountOwnElementView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let under: Gfx | undefined;
  let glow: Gfx | undefined;
  const heroes = new Map<number, Hero>();
  const free: Hero[] = [];
  let drawn: { id: number; team: number; kind: number; age: number; pulse: boolean }[] = [];
  let used = 0;
  let wasReduced = false;

  const draw = (): void => {
    const ar = view.arcade();
    if (!ar) return;
    const reduced = reduceMotion();
    wasReduced = reduced;
    const now = view.tick;
    const u = (under ??= arena.add.graphics().setDepth(DEPTH));
    const g = (glow ??= arena.add.graphics().setDepth(DEPTH + 0.1).setBlendMode(ADD));
    u.clear();
    g.clear();
    drawn = [];
    used = 0;
    const count = Math.min(5, ar.patchCount);
    for (const h of heroes.values()) h.seen = false;
    view.forEachCharacter((c: RenderCharacter) => {
      if ((c.flags & (EntityFlag.benched | EntityFlag.dead)) !== 0) return;
      const kind = ownElementKind(ar.stage, c.element, ar.patches, count, c.x + c.w / 2, c.y + c.h / 2);
      if (kind === 0) return;
      let h = heroes.get(c.id);
      if (!h) {
        h = free.pop() ?? { born: 0, hp: 0, pulseAt: Number.NEGATIVE_INFINITY, seen: false };
        h.born = now;
        h.hp = c.hp;
        h.pulseAt = Number.NEGATIVE_INFINITY;
        heroes.set(c.id, h);
      }
      h.seen = true;
      if (healTick(kind, h.hp, c.hp)) h.pulseAt = now;
      h.hp = c.hp;
      const age = now - h.born;
      const n = fillParts(kind, c, age, reduced, c.id);
      paint(g, u, n);
      const pulse = pulseLook(now - h.pulseAt, reduced);
      if (pulse) plus(g, u, c.x + c.w / 2, c.y - 6 - (1 - pulse.alpha) * 14, pulse.scale, pulse.alpha);
      used += n;
      drawn.push({ id: c.id, team: c.team, kind, age, pulse: pulse !== undefined });
    });
    // Effects stop the first frame their hero is off the patch: forget them, recycling the state objects.
    for (const [id, h] of heroes) {
      if (h.seen) continue;
      heroes.delete(id);
      free.push(h);
    }
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    under?.destroy();
    under = undefined;
    glow?.destroy();
    glow = undefined;
    heroes.clear();
    free.length = 0;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => ({ active: drawn, parts: used, reduced: wasReduced }));
}
