import type Phaser from 'phaser';
import type { Element } from '@core/index';
import { STREAKS_BY_STRENGTH, STREAK_FAN, STREAK_MS, STREAK_POOL, coreFrame, streakFrame, tintTowardsWhite } from './hit-feel';
import { EARTH_DUST, MARK_CAP, STILL_POSE, gravityDrop, markAlpha, markRimWidth, markStyleFor, stillAlpha, type MarkStyle } from './hit-mark';

/**
 * Directional hit streaks (QA r34) and the element contact mark (QA r47-r49: it was one white asterisk for every element). A fan
 * of tapered light lines flung along the blow is drawn into one additive Graphics (an element-coloured body under a pale
 * element-tinted core, never plain white), with a thin dark rim under it in a normal-blend Graphics so pale elements still read on
 * the floor. The pieces differ per element (hit-mark.ts): fire ember flares that rise, water droplets that fall plus a splash ring,
 * earth chips that tumble plus a dust puff, air long parallel slash lines, void violet shards. View-only; one scene update listener
 * that exists only while marks play; paused holds them. Under reduced motion the caller uses `still` (one static mark, no flight).
 */
export interface StreakLayer {
  /** A fan from (x, y) thrown towards `dirX` (-1 left, 1 right) with a slight lift, in `color`, by strength 0..3; `element` shapes and tints it. */
  spawn(x: number, y: number, dirX: number, color: number, strength: number, element?: Element): void;
  /** Reduced motion: one still element mark at (x, y) (no flight, a soft fade), facing `dirX`. */
  still(x: number, y: number, dirX: number, color: number, element?: Element): void;
}

const ADD = 1;
/** Paused (manual stepping, hit-stop view hold): a new fan starts this far in, so the held frame shows lines, not zero-length ones. */
const HELD_START_MS = 50;
const FALLBACK_RIM = 0x0a0806;

/** The style for `element`, or one derived from `color` for an unknown attacker. */
function styleOf(element: Element | undefined, color: number): MarkStyle {
  return markStyleFor(element) ?? { shape: 'flare', body: color, core: tintTowardsWhite(color, 0.5), rim: FALLBACK_RIM, gravity: 0, reach: 1 };
}

export function createStreakLayer(scene: Phaser.Scene, paused: () => boolean, highContrast: () => boolean = () => false): StreakLayer {
  interface Streak {
    x: number;
    y: number;
    cos: number;
    sin: number;
    style: MarkStyle;
    strength: number;
    unit: number;
    age: number;
    index: number;
  }
  interface Core {
    x: number;
    y: number;
    strength: number;
    age: number;
    style: MarkStyle;
    still: boolean;
    sign: number;
  }
  const streaks: Streak[] = [];
  const cores: Core[] = [];
  let gfx: Phaser.GameObjects.Graphics | undefined;
  let rim: Phaser.GameObjects.Graphics | undefined;
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
    cores.length = 0;
    gfx = undefined;
    rim = undefined;
    detach();
  };

  /** One piece of a mark: a body line and a tinted core line, plus a shape tip (ember, droplet, chip, shard) and a dark rim. */
  function piece(g: Phaser.GameObjects.Graphics, r: Phaser.GameObjects.Graphics, s: Streak, hc: boolean): boolean {
    const f = streakFrame(s.age, s.strength, s.unit);
    if (!f) return false;
    const st = s.style;
    const t = Math.min(1, s.age / STREAK_MS);
    const drop = gravityDrop(st.gravity, t);
    const reach = st.reach;
    const ax = s.x + s.cos * f.from * reach;
    const bx = s.x + s.cos * f.to * reach;
    // Air cuts parallel slashes: each line is nudged sideways by its index so they run side by side, not as a fan.
    const side = st.shape === 'slashes' ? ((s.index % 3) - 1) * 7 : 0;
    const ay = s.y + s.sin * f.from * reach + drop + side;
    const by = s.y + s.sin * f.to * reach + drop + side;
    const a = markAlpha(f.alpha, hc);
    const w = st.shape === 'slashes' ? Math.max(1.5, f.width * 0.55) : f.width;
    r.lineStyle(markRimWidth(w * 2.8, hc), st.rim, 0.45 * f.alpha).lineBetween(ax, ay, bx, by);
    // Earth is drawn in normal blend (solid amber-brown): additive light would wash it to the same yellow-white as fire on the pale floors.
    const lg = st.shape === 'chips' ? r : g;
    lg.lineStyle(w * 2.2, st.body, st.shape === 'chips' ? Math.min(1, a) : a * 0.6).lineBetween(ax, ay, bx, by);
    lg.lineStyle(Math.max(1.2, w * 0.6), st.core, a).lineBetween(ax, ay, bx, by);
    const tip = Math.max(2.5, f.width * 0.9);
    if (st.shape === 'flare') {
      g.fillStyle(st.core, a * 0.9).fillCircle(bx, by, tip * 0.8);
    } else if (st.shape === 'droplets') {
      r.fillStyle(st.rim, 0.5 * f.alpha).fillCircle(bx, by + 1, tip * 1.3);
      g.fillStyle(st.body, a * 0.9).fillCircle(bx, by, tip);
      g.fillStyle(st.core, a).fillCircle(bx - tip * 0.3, by - tip * 0.3, tip * 0.35);
    } else if (st.shape === 'chips') {
      r.fillStyle(st.rim, 0.6 * f.alpha).fillTriangle(bx - tip * 1.4, by + tip, bx + tip * 1.4, by + tip * 0.5, bx - tip * 0.2, by - tip * 1.3);
      r.fillStyle(st.body, a).fillTriangle(bx - tip, by + tip * 0.7, bx + tip, by + tip * 0.3, bx - tip * 0.1, by - tip);
    } else if (st.shape === 'shards') {
      g.fillStyle(st.core, a).fillTriangle(bx, by - tip * 1.4, bx + tip * 0.7, by, bx, by + tip * 1.4);
    }
    return true;
  }

  /** The contact core: an element-shaped heart, never a white disc, so the foe's face stays readable. */
  function core(g: Phaser.GameObjects.Graphics, r: Phaser.GameObjects.Graphics, c: Core, radius: number, alpha: number, hc: boolean): void {
    const st = c.style;
    const a = markAlpha(alpha, hc);
    (st.shape === 'chips' ? r : g).fillStyle(st.body, a * (st.shape === 'chips' ? 0.5 : 0.35)).fillCircle(c.x, c.y, radius * 1.5);
    if (st.shape === 'droplets') {
      // A splash: a squashed ring on the floor-ward side and a small crown of three droplets.
      r.lineStyle(markRimWidth(5, hc), st.rim, 0.4 * alpha).strokeEllipse(c.x, c.y + radius * 0.3, radius * 2.2, radius * 1.2);
      g.lineStyle(2.5, st.core, a).strokeEllipse(c.x, c.y + radius * 0.3, radius * 2.2, radius * 1.2);
      g.lineStyle(2, st.body, a * 0.8).strokeEllipse(c.x, c.y + radius * 0.3, radius * 3.2, radius * 1.7);
      g.lineStyle(1.5, st.body, a * 0.5).strokeEllipse(c.x, c.y + radius * 0.3, radius * 4.2, radius * 2.2);
      for (let i = -1; i <= 1; i++) g.fillStyle(st.core, a * 0.9).fillCircle(c.x + i * radius * 0.7, c.y - radius * (0.5 + 0.2 * (1 - Math.abs(i))), 2.6);
    } else if (st.shape === 'chips') {
      // A dust puff: soft low-alpha earth discs, no hard ring.
      for (let i = 0; i < 3; i++) r.fillStyle(EARTH_DUST, a * 0.5).fillCircle(c.x + (i - 1) * radius * 0.6, c.y + radius * 0.2, radius * (0.75 - i * 0.1));
      // Three jagged amber shards burst out of the dust, a hard-edged angular mark against the soft water rings.
      for (let i = 0; i < 3; i++) {
        const dx = (i - 1) * radius * 0.9;
        r.fillStyle(st.core, a * 0.95).fillTriangle(c.x + dx - radius * 0.3, c.y + radius * 0.5, c.x + dx + radius * 0.3, c.y + radius * 0.5, c.x + dx + (i - 1) * radius * 0.2, c.y - radius * (0.9 + 0.3 * (i % 2)));
      }
    } else if (st.shape === 'slashes') {
      // Two crossing hairlines instead of a ring.
      const l = radius * 1.1;
      r.lineStyle(markRimWidth(4, hc), st.rim, 0.4 * alpha).lineBetween(c.x - l * c.sign, c.y - l * 0.4, c.x + l * c.sign, c.y + l * 0.4);
      g.lineStyle(2, st.core, a).lineBetween(c.x - l * c.sign, c.y - l * 0.4, c.x + l * c.sign, c.y + l * 0.4);
      g.lineStyle(1.5, st.body, a * 0.8).lineBetween(c.x - l * 0.7 * c.sign, c.y + l * 0.5, c.x + l * 0.7 * c.sign, c.y - l * 0.5);
    } else {
      r.lineStyle(markRimWidth(5, hc), st.rim, 0.4 * alpha).strokeCircle(c.x, c.y, radius);
      g.lineStyle(3, st.core, a).strokeCircle(c.x, c.y, radius);
      g.fillStyle(st.core, a * 0.7).fillCircle(c.x, c.y, radius * 0.4);
    }
  }

  function tick(_time: number, delta: number): void {
    if (!gfx || !rim) return;
    const held = paused();
    const hc = highContrast();
    gfx.clear();
    rim.clear();
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      if (!s) continue;
      if (!held) s.age += delta;
      if (!piece(gfx, rim, s, hc)) streaks.splice(i, 1);
    }
    for (let i = cores.length - 1; i >= 0; i--) {
      const c = cores[i];
      if (!c) continue;
      if (!held) c.age += delta;
      if (c.still) {
        const alpha = stillAlpha(c.age);
        if (alpha <= 0) {
          cores.splice(i, 1);
          continue;
        }
        stillMark(gfx, rim, c, alpha, hc);
        continue;
      }
      const f = coreFrame(c.age, c.strength);
      if (!f) {
        cores.splice(i, 1);
        continue;
      }
      core(gfx, rim, c, f.radius, f.alpha, hc);
    }
    if (streaks.length === 0 && cores.length === 0) detach();
  }

  /** The reduced-motion mark: the core plus the element's pieces frozen mid-flight (a still picture, no motion). */
  function stillMark(g: Phaser.GameObjects.Graphics, r: Phaser.GameObjects.Graphics, c: Core, alpha: number, hc: boolean): void {
    core(g, r, c, 16, alpha, hc);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = (c.sign < 0 ? Math.PI : 0) + (STREAK_FAN[i % STREAK_FAN.length] ?? 0) * c.sign - 0.12 * c.sign;
      piece(g, r, { x: c.x, y: c.y, cos: Math.cos(a), sin: Math.sin(a), style: c.style, strength: 1, unit: (i * 5 % 7) / 6, age: STREAK_MS * STILL_POSE, index: i }, hc);
    }
  }

  function ensure(): void {
    gfx ??= scene.add.graphics().setName('hit-mark').setDepth(12).setBlendMode(ADD);
    rim ??= scene.add.graphics().setName('hit-mark-rim').setDepth(11.9);
    if (!attached) {
      attached = true;
      scene.events.on('update', tick);
      scene.events.once('shutdown', drop);
      scene.events.once('destroy', drop);
    }
  }
  return {
    spawn(x, y, dirX, color, strength, element): void {
      const s = Math.min(3, Math.max(0, Math.floor(strength)));
      const n = STREAKS_BY_STRENGTH[s] ?? 3;
      const sign = dirX < 0 ? -1 : 1;
      const style = styleOf(element, color);
      ensure();
      if (cores.length >= MARK_CAP) cores.shift();
      cores.push({ x, y, strength: s, style, still: false, sign, age: paused() ? 30 : 0 });
      for (let i = 0; i < n && streaks.length < STREAK_POOL; i++) {
        const a = (dirX < 0 ? Math.PI : 0) + (STREAK_FAN[i] ?? 0) * sign - 0.12 * sign;
        streaks.push({ x, y, cos: Math.cos(a), sin: Math.sin(a), style, strength: s, unit: ((i * 5) % 7) / 6, age: paused() ? HELD_START_MS : 0, index: i });
      }
    },
    still(x, y, dirX, color, element): void {
      ensure();
      if (cores.length >= MARK_CAP) cores.shift();
      cores.push({ x, y, strength: 1, style: styleOf(element, color), still: true, sign: dirX < 0 ? -1 : 1, age: 0 });
    },
  };
}

