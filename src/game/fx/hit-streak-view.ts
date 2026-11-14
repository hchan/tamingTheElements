import type Phaser from 'phaser';
import { STREAKS_BY_STRENGTH, STREAK_FAN, STREAK_POOL, streakFrame } from './hit-feel';

/**
 * Directional hit streaks (QA r34): a fan of tapered light lines flung along the blow, drawn into one additive Graphics
 * (an element-coloured body under a pale core, so it reads luminous, not cartoony). View-only; one scene update listener
 * that exists only while streaks play; paused holds them. Callers skip it under reduced motion.
 */
export interface StreakLayer {
  /** A fan from (x, y) thrown towards `dirX` (-1 left, 1 right) with a slight lift, in `color`, by strength 0..3. */
  spawn(x: number, y: number, dirX: number, color: number, strength: number): void;
}

const ADD = 1;

export function createStreakLayer(scene: Phaser.Scene, paused: () => boolean): StreakLayer {
  interface Streak {
    x: number;
    y: number;
    cos: number;
    sin: number;
    color: number;
    strength: number;
    unit: number;
    age: number;
  }
  const streaks: Streak[] = [];
  let gfx: Phaser.GameObjects.Graphics | undefined;
  let attached = false;
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    scene.events.off('update', tick);
    scene.events.off('shutdown', drop);
    scene.events.off('destroy', drop);
  };
  const drop = (): void => {
    streaks.length = 0;
    gfx = undefined;
    detach();
  };
  function tick(_time: number, delta: number): void {
    if (paused() || !gfx) return;
    gfx.clear();
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      if (!s) continue;
      s.age += delta;
      const f = streakFrame(s.age, s.strength, s.unit);
      if (!f) {
        streaks.splice(i, 1);
        continue;
      }
      const ax = s.x + s.cos * f.from;
      const ay = s.y + s.sin * f.from;
      const bx = s.x + s.cos * f.to;
      const by = s.y + s.sin * f.to;
      gfx.lineStyle(f.width * 2, s.color, f.alpha * 0.45).lineBetween(ax, ay, bx, by);
      gfx.lineStyle(Math.max(1, f.width * 0.7), 0xfff4d8, f.alpha).lineBetween(ax, ay, bx, by);
    }
    if (streaks.length === 0) detach();
  }
  return {
    spawn(x, y, dirX, color, strength): void {
      const s = Math.min(3, Math.max(0, Math.floor(strength)));
      const n = STREAKS_BY_STRENGTH[s] ?? 3;
      const sign = dirX < 0 ? -1 : 1;
      gfx ??= scene.add.graphics().setDepth(12).setBlendMode(ADD);
      for (let i = 0; i < n && streaks.length < STREAK_POOL; i++) {
        const a = (dirX < 0 ? Math.PI : 0) + (STREAK_FAN[i] ?? 0) * sign - 0.12 * sign;
        streaks.push({ x, y, cos: Math.cos(a), sin: Math.sin(a), color, strength: s, unit: ((i * 5) % 7) / 6, age: 0 });
      }
      if (!attached) {
        attached = true;
        scene.events.on('update', tick);
        scene.events.once('shutdown', drop);
        scene.events.once('destroy', drop);
      }
    },
  };
}
