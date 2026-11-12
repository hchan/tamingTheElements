import type Phaser from 'phaser';
import { EntityFlag, GUARD_MAX, type RenderArcade, type RenderCharacter, type RenderProjectile, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { LOGICAL_WIDTH } from '../boot/viewport';
import { mountClashView } from './clash-view';
import { ELEMENT_COLORS } from './element-colors';
import {
  AFTERIMAGE_ALPHA, AFTERIMAGE_GAP, BREAK_COLOR, DefenceFx, FLASH_TICKS, GUARD_COLOR, GUARD_LOW_PM,
  POP_TICKS, RING_TICKS, ROPE_COLOR, SPARK_TICKS, TICK_MS, ghostAlpha, guardFill, popAlpha, popRise, progress, ringRadius, type DefenceSink,
} from './defence-fx';

/**
 * Phaser side of the Arcade defence view (WP-arcade-defence-view): dash afterimages, projectile trails (VISUAL-QA V10),
 * the guard shield and guard bar, chip sparks, the parry flash, ping and reflection spark, the guard-break shatter and
 * the text pops. The round view (`hud/round-view.ts`, loaded by the Arena only in an Arcade match) mounts it and feeds
 * it each tick's events; it is its own chunk `defence-view` (vite.config.ts), so Classic never downloads it. Per match it makes two Graphics (trails under the fighters,
 * everything else over them), six afterimage Images and four pop Texts, on first use, and reuses them; the effects live
 * in typed-array pools redrawn into the Graphics each frame, so nothing allocates per frame. Effects run on the view
 * tick (smoothed by frame time between ticks), so they hold while the sim is paused. One Arena `postupdate` listener;
 * everything goes with the Arena (shutdown or destroy). It mounts the clash burst (`clash-view.ts`) and feeds it too.
 */

/** Trails under the fighters (0) and over the background (-1); afterimages just under the fighters. */
const TRAIL_DEPTH = -0.5;
const GHOST_DEPTH = -0.25;
/** Shields, bars, sparks and rings over the fighters (0), under the aim arrow (4) and the super dim (5). */
const OVER_DEPTH = 3;
/** Pops over the super dim (5), like the hit sparks (10). */
const POP_DEPTH = 9;
/** LOGICAL_HEIGHT (boot/viewport.ts), kept here so the phaser-config chunk need not export it. */
const ARENA_H = 720;
const POP_PX = 30;
const BAR_W = 64;
const BAR_H = 7;
/** Pool sizes: sparks in flight, rings and flashes, pops, dashes with afterimages at once. */
export const SPARK_POOL = 64;
const RING_POOL = 8;
const POP_POOL = 4;
const DASH_POOL = 2;
/**
 * Projectile entity slots (MAX_ENTITIES) and trail positions kept per projectile, one per tick (the newest is under the
 * sprite); the dots are drawn AFTERIMAGE_GAP ticks apart, so they clear the sprite and each other.
 */
const SLOTS = 64;
const TRAIL = AFTERIMAGE_ALPHA.length * AFTERIMAGE_GAP + 1;
const BENCHED_OR_DEAD = EntityFlag.benched | EntityFlag.dead;
/** Snag root loops: [lift, colour, line width], dark under-rims first. */
const ROPE_LOOPS: readonly (readonly [number, number, number])[] = [[0, 0x2a1a08, 6], [1, 0x2a1a08, 6], [0, ROPE_COLOR, 3], [1, ROPE_COLOR, 3]];
const HIDDEN = Number.NEGATIVE_INFINITY;

/** The Arena's character views by entity id (its `EntityViewPool`): each has the sprite drawn this frame. */
export interface Fighters {
  peek(id: number): { readonly image: Phaser.GameObjects.Image } | undefined;
}

export interface DefencePrefs {
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Read-out for the test probe. */
export interface DefenceState {
  /** Visible afterimages, trail dots, shields, Snag root rings and guard bars (their meters) drawn on the last frame. */
  readonly ghosts: number;
  readonly trails: number;
  readonly shields: number;
  readonly roots: number;
  readonly bars: readonly number[];
  /** Projectiles seen on the last tick (trailed unless motion is reduced). */
  readonly projectiles: number;
  /** Live sparks, rings (and flashes) and the words popped. */
  readonly sparks: number;
  readonly rings: number;
  readonly pops: readonly string[];
}

const states = new WeakMap<Phaser.Scene, () => DefenceState>();

/** The defence view's last frame in `arena` (test probe), or undefined before it mounts or after teardown. */
export function defenceState(arena: Phaser.Scene): DefenceState | undefined {
  return states.get(arena)?.();
}

/**
 * Mounts the defence view in the Arena `scene` for `view` and returns the event consumer the Arena feeds every tick.
 * `fighters` (the Arena's character view pool) gives a fighter's drawn sprite (interpolated, jittered), `say` is the
 * Arena's throttled live region and `prefs` the accessibility prefs (read on defence events and once a second).
 */
export function mountDefenceView(
  scene: Phaser.Scene,
  view: RenderView,
  say: (line: Announcement) => void,
  prefs: () => DefencePrefs,
  fighters: Fighters,
): (events: readonly SimEvent[]) => void {
  let reduced = prefs().reduceMotion;
  let highContrast = prefs().highContrast;
  const under = scene.add.graphics().setDepth(TRAIL_DEPTH);
  const over = scene.add.graphics().setDepth(OVER_DEPTH);
  const ghostImgs: Phaser.GameObjects.Image[] = [];
  const texts: Phaser.GameObjects.Text[] = [];

  // View time: the view tick plus the frame time since it changed (capped below one tick, so it holds while paused).
  let tick = view.tick;
  let drawnTick = tick;
  let sub = 0;
  const now = (): number => tick + sub / TICK_MS;

  // Sparks: x, y, dx, dy, from, ticks, color, shard (1) per slot; `live` slots first, swapped down when done.
  const SP = 8;
  const sparks = new Float64Array(SPARK_POOL * SP);
  let liveSparks = 0;
  // Rings and flashes: x, y, size, from, ticks, color, reduced, flash.
  const RG = 8;
  const rings = new Float64Array(RING_POOL * RG);
  let liveRings = 0;
  // Pops: x, y, from, reduced per text.
  const popData = new Float64Array(POP_POOL * 4).fill(HIDDEN);
  // Dashes: id, from, until, colour per slot, and three afterimages each (newest first).
  const DS = 4;
  const dashes = new Float64Array(DASH_POOL * DS).fill(-1);
  for (let i = 0; i < DASH_POOL; i++) dashes[i * DS + 2] = HIDDEN;
  // Trails: TRAIL centres per projectile slot (newest first), how many are valid and the tick of the newest.
  const trail = new Float32Array(SLOTS * TRAIL * 2);
  const trailN = new Uint8Array(SLOTS);
  const trailTick = new Int32Array(SLOTS).fill(-2);
  const teamColor = [GUARD_COLOR, GUARD_COLOR];
  const drawn = { ghosts: 0, trails: 0, shields: 0, roots: 0, bars: [0, 0], nBars: 0, projectiles: 0 };
  const pt = { x: 0, y: 0, size: 0 };

  /**
   * Centre and half size of entity `id` (a fighter in play or a live projectile) this tick into `pt`; false when gone.
   * The sim position, not the sprite's: the sprite is only placed on the next render (several ticks later when stepped).
   */
  let seek = -1;
  let found = 0;
  const findBox = (e: RenderCharacter | RenderProjectile): void => {
    if (e.id !== seek || ('flags' in e && (e.flags & BENCHED_OR_DEAD) !== 0)) return;
    found++;
    pt.x = e.x + e.w / 2;
    pt.y = e.y + e.h / 2;
    pt.size = Math.max(e.w, e.h) / 2;
  };
  const at = (id: number): boolean => {
    seek = id;
    found = 0;
    view.forEachCharacter(findBox);
    if (found === 0) view.forEachProjectile(findBox);
    return found > 0;
  };
  let teamSeek = -1;
  let teamFound = -1;
  const findTeam = (c: RenderCharacter): void => {
    if (c.id === teamSeek) teamFound = c.team;
  };
  const teamOf = (id: number): number => {
    teamSeek = id;
    teamFound = -1;
    view.forEachCharacter(findTeam);
    return teamFound;
  };

  const sink: DefenceSink = {
    ghosts(id, from, until): void {
      // The same fighter's slot, else a free one, else the one that ends first.
      let slot = 0;
      for (let i = 0; i < DASH_POOL; i++) {
        if (dashes[i * DS] === id) {
          slot = i;
          break;
        }
        if ((dashes[i * DS + 2] ?? 0) < (dashes[slot * DS + 2] ?? 0)) slot = i;
      }
      const o = slot * DS;
      dashes[o] = id;
      dashes[o + 1] = from;
      dashes[o + 2] = until;
      dashes[o + 3] = teamColor[teamOf(id)] ?? GUARD_COLOR;
      for (let k = 0; k < AFTERIMAGE_ALPHA.length; k++) ghost(slot, k).setVisible(false);
    },
    sparks(id, count, color, ticks, flat): void {
      if (!at(id)) return;
      const shard = ticks > SPARK_TICKS;
      const reach = pt.size * (shard ? 1.3 : 0.8);
      for (let i = 0; i < count && liveSparks < SPARK_POOL; i++) {
        const a = ((i + 0.5) / count) * 2 * Math.PI + (i % 2) * 0.35;
        const o = liveSparks++ * SP;
        sparks[o] = pt.x;
        sparks[o + 1] = pt.y;
        sparks[o + 2] = flat ? 0 : Math.cos(a) * reach;
        sparks[o + 3] = flat ? 0 : Math.sin(a) * reach;
        sparks[o + 4] = now();
        sparks[o + 5] = ticks;
        sparks[o + 6] = color;
        sparks[o + 7] = shard ? 1 : 0;
      }
    },
    ring(id, color, flat): void {
      addRing(id, color, flat, false);
    },
    flash(id): void {
      addRing(id, 0xffffff, true, true);
    },
    pop(id, word, color, flat): void {
      if (!at(id)) return;
      let slot = 0;
      for (let i = 1; i < POP_POOL; i++) if ((popData[i * 4 + 2] ?? 0) < (popData[slot * 4 + 2] ?? 0)) slot = i;
      const t = text(slot);
      t.setText(word).setColor(`#${color.toString(16).padStart(6, '0')}`).setVisible(true);
      popData[slot * 4] = pt.x;
      popData[slot * 4 + 1] = pt.y - pt.size - 4;
      popData[slot * 4 + 2] = now();
      popData[slot * 4 + 3] = flat ? 1 : 0;
    },
    say,
  };

  const addRing = (id: number, color: number, flat: boolean, flash: boolean): void => {
    if (!at(id)) return;
    let slot = liveRings;
    if (slot >= RING_POOL) {
      // Full: the oldest gives way.
      slot = 0;
      for (let i = 1; i < RING_POOL; i++) if ((rings[i * RG + 3] ?? 0) < (rings[slot * RG + 3] ?? 0)) slot = i;
    } else liveRings++;
    const o = slot * RG;
    rings[o] = pt.x;
    rings[o + 1] = pt.y;
    rings[o + 2] = pt.size;
    rings[o + 3] = now();
    rings[o + 4] = flash ? FLASH_TICKS : RING_TICKS;
    rings[o + 5] = color;
    rings[o + 6] = flat ? 1 : 0;
    rings[o + 7] = flash ? 1 : 0;
  };

  // The clash burst (WP-arcade-clash), its own chunk: projectile effects come with the defence view.
  const clash = mountClashView(scene, view, prefs);
  // Prefs are read on defence events (and once a second for the trails and the shield rim), never per frame.
  const fx = new DefenceFx(sink, { reducedMotion: () => prefs().reduceMotion, teamOf });

  function ghost(slot: number, k: number): Phaser.GameObjects.Image {
    const i = slot * AFTERIMAGE_ALPHA.length + k;
    let g = ghostImgs[i];
    if (!g) {
      g = scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(GHOST_DEPTH).setVisible(false);
      ghostImgs[i] = g;
    }
    return g;
  }

  function text(slot: number): Phaser.GameObjects.Text {
    let t = texts[slot];
    if (!t) {
      t = scene.add
        .text(0, 0, '', {
          fontSize: `${String(POP_PX)}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 6,
          resolution: scene.scale.width / LOGICAL_WIDTH,
        })
        .setOrigin(0.5, 1)
        .setDepth(POP_DEPTH)
        .setVisible(false);
      texts[slot] = t;
    }
    return t;
  }

  /**
   * On a sampling tick of a dash, the newest afterimage takes the dasher's pose (its sim position this tick, its sprite's
   * frame); the older ones move down a place and the oldest image is reused.
   */
  const sampleDasher = (c: RenderCharacter): void => {
    for (let slot = 0; slot < DASH_POOL; slot++) {
      const o = slot * DS;
      if (dashes[o] !== c.id || tick > (dashes[o + 2] ?? 0) || (tick - (dashes[o + 1] ?? 0)) % AFTERIMAGE_GAP !== 0) continue;
      const src = fighters.peek(c.id)?.image;
      if (!src?.visible) continue;
      const n = AFTERIMAGE_ALPHA.length;
      const oldest = ghost(slot, n - 1);
      for (let k = n - 1; k > 0; k--) ghostImgs[slot * n + k] = ghost(slot, k - 1);
      ghostImgs[slot * n] = oldest;
      oldest
        .setTexture(src.texture.key, src.frame.name)
        .setPosition(c.x, c.y)
        .setDisplaySize(c.w, c.h)
        .setFlipX(src.flipX)
        .setTint(dashes[o + 3] ?? GUARD_COLOR)
        .setVisible(true);
    }
  };

  const sampleProjectile = (p: RenderProjectile): void => {
    const id = p.id;
    if (id >= SLOTS) return;
    const o = id * TRAIL * 2;
    let n = trailN[id] ?? 0;
    if (trailTick[id] !== tick - 1) n = 0;
    trail.copyWithin(o + 2, o, o + (TRAIL - 1) * 2);
    trail[o] = p.x + p.w / 2;
    trail[o + 1] = p.y + p.h / 2;
    trailN[id] = Math.min(TRAIL, n + 1);
    trailTick[id] = tick;
    drawn.projectiles++;
  };

  const drawProjectile = (p: RenderProjectile): void => {
    const id = p.id;
    if (id >= SLOTS || trailTick[id] !== tick) return;
    const n = trailN[id] ?? 0;
    const o = id * TRAIL * 2;
    const r = Math.max(6, (p.w + p.h) / 4 + 2);
    const color = teamColor[p.team] ?? GUARD_COLOR;
    for (let j = 1; j * AFTERIMAGE_GAP < n; j++) {
      const k = j * AFTERIMAGE_GAP;
      const x = trail[o + k * 2] ?? 0;
      const y = trail[o + k * 2 + 1] ?? 0;
      const a = AFTERIMAGE_ALPHA[j - 1] ?? 0;
      // The team's element colour with a white core, so the dots read on light and dark arenas alike.
      under.fillStyle(color, a).fillCircle(x, y, r * (1 - 0.15 * j));
      under.fillStyle(0xffffff, a).fillCircle(x, y, r * (1 - 0.15 * j) * 0.45);
      drawn.trails++;
    }
  };

  let ar: RenderArcade | undefined;
  const drawFighter = (c: RenderCharacter): void => {
    if ((c.flags & BENCHED_OR_DEAD) !== 0) return;
    if (c.team < 2) teamColor[c.team] = ELEMENT_COLORS[c.element];
    const img = fighters.peek(c.id)?.image;
    if (!ar || !img?.visible) return;
    const w = img.displayWidth;
    const h = img.displayHeight;
    const cx = img.x + w / 2;
    if (ar.rooted(c.id)) {
      // Snag (FUN-DESIGN 2.20): two rope loops round the feet, a dark rim under the rope colour (a shape cue).
      const fy = img.y + h * 0.88;
      for (const [k, color, lw] of ROPE_LOOPS) {
        over.lineStyle(highContrast ? lw + 2 : lw, color, 1).strokeEllipse(cx, fy - k * h * 0.12, w * (0.9 - k * 0.15), h * 0.22);
      }
      drawn.roots++;
    }
    const guarding = ar.guarding(c.id);
    if (guarding) {
      // A bubble with a white rim: a shape cue, not only a colour.
      const r = Math.max(w, h) * 0.62;
      over.fillStyle(GUARD_COLOR, 0.22).fillCircle(cx, img.y + h / 2, r);
      over.lineStyle(highContrast ? 5 : 3, 0xffffff, highContrast ? 1 : 0.85).strokeCircle(cx, img.y + h / 2, r);
      drawn.shields++;
    }
    const meter = ar.guard(c.id);
    if (!guarding && meter >= GUARD_MAX) return;
    const x = cx - BAR_W / 2;
    const y = Math.min(img.y + h + 4, ARENA_H - BAR_H - 2);
    over.fillStyle(0x000000, 0.7).fillRect(x - 2, y - 2, BAR_W + 4, BAR_H + 4);
    over.fillStyle(meter <= (GUARD_MAX * GUARD_LOW_PM) / 1000 ? BREAK_COLOR : GUARD_COLOR, 1).fillRect(x, y, guardFill(meter, GUARD_MAX, BAR_W), BAR_H);
    // Quarter notches: the bar reads by its length and pattern, not only its colour.
    over.lineStyle(1, 0x000000, 0.9);
    for (let q = 1; q < 4; q++) over.lineBetween(x + (q * BAR_W) / 4, y, x + (q * BAR_W) / 4, y + BAR_H);
    if (drawn.nBars < 2) drawn.bars[drawn.nBars] = meter;
    drawn.nBars++;
  };

  /** Every sim tick (from the event feed, so manual steps sample too): trail and afterimage positions, and the prefs. */
  const onTick = (): void => {
    drawn.projectiles = 0;
    view.forEachProjectile(sampleProjectile);
    view.forEachCharacter(sampleDasher);
    if (tick % 50 === 0) {
      const p = prefs();
      reduced = p.reduceMotion;
      highContrast = p.highContrast;
    }
  };

  function draw(_time: number, delta: number): void {
    if (drawnTick !== tick) sub = 0;
    else sub = Math.min(TICK_MS - 1, sub + delta);
    drawnTick = tick;
    const clock = now();
    under.clear();
    over.clear();
    drawn.trails = 0;
    drawn.shields = 0;
    drawn.roots = 0;
    drawn.nBars = 0;
    ar = view.arcade();
    view.forEachCharacter(drawFighter);
    // Trails (FUN-DESIGN section 3, V10): motion only, so none with reduced motion (the projectile glow stays).
    if (!reduced) view.forEachProjectile(drawProjectile);
    drawn.ghosts = 0;
    for (let i = 0; i < DASH_POOL; i++) {
      const until = dashes[i * DS + 2] ?? HIDDEN;
      for (let k = 0; k < AFTERIMAGE_ALPHA.length; k++) {
        const g = ghostImgs[i * AFTERIMAGE_ALPHA.length + k];
        if (!g?.visible) continue;
        const a = ghostAlpha(k, clock, until);
        g.setAlpha(a);
        if (a <= 0) g.setVisible(false);
        else drawn.ghosts++;
      }
    }
    for (let i = liveSparks - 1; i >= 0; i--) {
      const o = i * SP;
      const p = progress(clock, sparks[o + 4] ?? 0, sparks[o + 5] ?? 1);
      if (p >= 1) {
        liveSparks--;
        sparks.copyWithin(o, liveSparks * SP, liveSparks * SP + SP);
        continue;
      }
      const dx = sparks[o + 2] ?? 0;
      const dy = sparks[o + 3] ?? 0;
      const still = dx === 0 && dy === 0;
      const k = 0.25 + 0.75 * p;
      const x = (sparks[o] ?? 0) + dx * k;
      const y = (sparks[o + 1] ?? 0) + dy * k;
      over.fillStyle(sparks[o + 6] ?? 0, still ? 1 : 1 - p);
      if (still) over.fillCircle(x, y, 8);
      else if (sparks[o + 7] === 1) over.fillTriangle(x, y - 6, x + 5, y + 4, x - 5, y + 4);
      else over.fillCircle(x, y, 3);
    }
    for (let i = liveRings - 1; i >= 0; i--) {
      const o = i * RG;
      const p = progress(clock, rings[o + 3] ?? 0, rings[o + 4] ?? 1);
      if (p >= 1) {
        liveRings--;
        rings.copyWithin(o, liveRings * RG, liveRings * RG + RG);
        continue;
      }
      const x = rings[o] ?? 0;
      const y = rings[o + 1] ?? 0;
      const size = rings[o + 2] ?? 0;
      const color = rings[o + 5] ?? 0;
      if (rings[o + 7] === 1) over.fillStyle(color, 0.8 * (1 - p)).fillCircle(x, y, size);
      else {
        const flat = rings[o + 6] === 1;
        over.lineStyle(flat ? 4 : 5, color, flat ? 1 : 1 - p).strokeCircle(x, y, ringRadius(p, size, flat));
      }
    }
    for (let i = 0; i < POP_POOL; i++) {
      const t0 = texts[i];
      if (!t0?.visible) continue;
      const p = progress(clock, popData[i * 4 + 2] ?? 0, POP_TICKS);
      if (p >= 1) {
        t0.setVisible(false);
        continue;
      }
      t0.setPosition(popData[i * 4] ?? 0, (popData[i * 4 + 1] ?? 0) - popRise(p, popData[i * 4 + 3] === 1)).setAlpha(popAlpha(p));
    }
  }

  const state = (): DefenceState => {
    const pops: string[] = [];
    for (const t of texts) if (t.visible) pops.push(t.text);
    return {
      ghosts: drawn.ghosts, trails: drawn.trails, shields: drawn.shields, roots: drawn.roots, bars: drawn.bars.slice(0, Math.min(2, drawn.nBars)),
      projectiles: drawn.projectiles,
      sparks: liveSparks, rings: liveRings, pops,
    };
  };

  const off = (): void => {
    scene.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(scene);
    for (const o of [under, over, ...ghostImgs, ...texts]) o.destroy();
    ghostImgs.length = 0;
    texts.length = 0;
  };
  scene.events.on('postupdate', draw);
  scene.events.once('shutdown', off).once('destroy', off);
  states.set(scene, state);
  return (events) => {
    tick = view.tick;
    sub = 0;
    fx.consume(events);
    clash(events);
    onTick();
  };
}
