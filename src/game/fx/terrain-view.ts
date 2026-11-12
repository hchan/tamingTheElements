import type Phaser from 'phaser';
import { EntityFlag, arcadePlayfield, type RenderCharacter, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { LOGICAL_WIDTH } from '../boot/viewport';
import { mountTileFloor, type TileFloor } from './terrain-floor';
import {
  MAX_PARTICLES, MAX_PATCHES, MAX_SPARKS, PARTICLES_PER_PATCH, PATCH_COLORS, PATCH_DARK, PATCH_WORDS, SPARK_TICKS, STAGE_ELEMENTS, TICK_MS,
  TerrainFx, badgeText, glowAlpha, nextBackdropAlpha, particle, patchAlpha, progress, type Particle,
} from './terrain-fx';

/**
 * Phaser side of the Arcade terrain view (WP-arcade-terrain-view, FUN-DESIGN 2.15 and section 3). The Arena mounts it in
 * every Arcade match (its own lazy chunk `terrain-view`, vite.config.ts, so Classic never downloads it) and feeds it each
 * tick's events. In the Arena, from `RenderArcade.stage` and its patches: a randomised tile floor (`terrain-floor.ts`, one
 * tilemap layer, seeded per match, rebuilt only when the stage swaps) over the hero's backdrop, then the backdrop of the stage's element, each patch as a rectangle with its own PATTERN (flames, waves, bricks, swirls), a word label above it and a soft glow;
 * earth patches are drawn raised and solid with a shadow so they read as walls; a few ambient particles (embers,
 * droplets, dust, wind streaks) and a spark where a rock stops a shot. A pending stage swap fades the old patches (and
 * crossfades the backdrop) over its 30-tick telegraph, and the new layout fades in. In the Hud scene (so the camera's
 * shake never moves it): a small buff badge ("FIRE x2", "HEAL", "AIR x2") while the player's hero stands in a patch of its
 * own element. Reduced motion drops the particles, the glow pulse and the fades and keeps the patterns, words, badge and
 * spark. Per match: two Arena Images, three Arena Graphics, five Arena Texts, one Hud Graphics and one Hud Text, made on
 * the first frame and reused; the static art is redrawn only when the layout changes (fades are object alpha); particles
 * and sparks come from pooled records, so nothing allocates per frame. One Arena `postupdate` listener; everything goes
 * with the Arena or the Hud (shutdown or destroy).
 */

/** Over the hero's backdrop (-1), under the weather tint (-0.75), the trails (-0.5) and the fighters (0). */
const BG_DEPTH = -0.95;
/** The tiled floor: over the backdrops, under the glow and the patches (WP-tile-floor). */
const TILES_DEPTH = -0.8;
const GLOW_DEPTH = -0.72;
const FLOOR_DEPTH = -0.7;
/** Particles and sparks over the fighters (0), under the shields (3). */
const FX_DEPTH = 2.5;
/** Over the HUD (100-102), like the weather badge. */
const HUD_DEPTH = 110;
/** The world width: the Arcade playfield (1280 today; WP 38d widens it). */
const ARENA_W = arcadePlayfield().w;
const ARENA_H = 720;
/** Left of the weather badge, on its row: under the player's hyper meter (the playfield starts at y 200). */
const BADGE_X = 16;
const BADGE_Y = 146;
const BADGE_PX = 26;
const LABEL_PX = 22;
const ICON = 26;
/** Height of a rock's dark front face, inside its footprint. */
const ROCK_FACE = 18;
const GLOW_RINGS = 4;

export interface TerrainPrefs {
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Read-out for the test probe. */
export interface TerrainState {
  /** The stage drawn (1 fire .. 4 air, 0 none), the patches drawn and their flat rectangles (x, y, w, h each). */
  readonly stage: number;
  readonly patches: number;
  readonly rects: readonly number[];
  /** The word on each patch, the patches' alpha, the glow alpha and the ambient particles and live sparks drawn. */
  readonly labels: readonly string[];
  readonly alpha: number;
  readonly glow: number;
  readonly particles: number;
  readonly sparks: number;
  /** The backdrop's element, the next one's alpha during a swap, and the buff badge text ('' when none). */
  readonly backdrop: string;
  readonly nextBackdrop: number;
  readonly badge: string;
}

const states = new WeakMap<Phaser.Scene, () => TerrainState>();

/** The terrain view's last frame in `arena` (test probe), or undefined before it mounts or after teardown. */
export function terrainState(arena: Phaser.Scene): TerrainState | undefined {
  return states.get(arena)?.();
}

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Mounts the terrain view (Arena `arena`, HUD `hud`) for `view` and returns the event consumer the Arena feeds every
 * tick. `say` is the Arena's throttled live region; `prefs` the accessibility prefs (read on events and once a second).
 */
export function mountTerrainView(
  arena: Phaser.Scene,
  hud: Phaser.Scene,
  view: RenderView,
  say: (line: Announcement) => void,
  prefs: () => TerrainPrefs,
  /** The match seed (the tile floor's random stream) and Vite's BASE_URL (its atlas URL). */
  seed = 1,
  base = '/',
): (events: readonly SimEvent[]) => void {
  let reduced = prefs().reduceMotion;
  let highContrast = prefs().highContrast;
  const tiles: TileFloor = mountTileFloor(arena, base, seed, TILES_DEPTH);
  let parts:
    | {
      bg: Phaser.GameObjects.Image | undefined; next: Phaser.GameObjects.Image | undefined;
      glow: Phaser.GameObjects.Graphics; floor: Phaser.GameObjects.Graphics; fx: Phaser.GameObjects.Graphics;
      labels: Phaser.GameObjects.Text[]; plate: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Text;
    }
    | undefined;

  // View time: the view tick plus the frame time since it changed (capped below one tick, so it holds while paused).
  let tick = view.tick;
  let drawnTick = tick;
  let sub = 0;
  const now = (): number => tick + sub / TICK_MS;

  let landedAt = Number.NEGATIVE_INFINITY;
  let healAt = Number.NEGATIVE_INFINITY;
  /** The layout drawn: stage, count and the 20 ints. */
  const drawn = { stage: -1, count: -1, rects: new Array<number>(MAX_PATCHES * 4).fill(-1), alpha: 1, glow: 0, particles: 0, badge: '', backdrop: '', nextBackdrop: 0 };
  const labels: string[] = [];
  const pt: Particle = { x: 0, y: 0, len: 0, r: 0, a: 0 };
  // Pooled sparks: a ring of MAX_SPARKS slots, the oldest overwritten.
  const sparkX = new Float64Array(MAX_SPARKS);
  const sparkY = new Float64Array(MAX_SPARKS);
  const sparkAt = new Float64Array(MAX_SPARKS).fill(Number.NEGATIVE_INFINITY);
  let sparkNext = 0;
  let sparks = 0;
  const hero = { stage: 0, x: 0, y: 0, found: false };

  const visit = (c: RenderCharacter): void => {
    if (hero.found || c.team !== 0 || (c.flags & (EntityFlag.benched | EntityFlag.dead)) !== 0) return;
    hero.found = true;
    hero.stage = STAGE_ELEMENTS.indexOf(c.element as (typeof STAGE_ELEMENTS)[number]) + 1;
    hero.x = c.x + c.w / 2;
    hero.y = c.y + c.h / 2;
  };

  const text = (scene: Phaser.Scene, px: number, stroke: number): Phaser.GameObjects.Text =>
    scene.add
      .text(0, 0, '', {
        fontSize: `${String(px)}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: stroke,
        resolution: scene.scale.width / LOGICAL_WIDTH,
      })
      .setVisible(false);

  /** The objects, made on the first frame the Hud runs. */
  const made = (): NonNullable<typeof parts> => {
    // Up to 1.3x on a phone (the weather badge's boost), so the words stay near 8 CSS px.
    const boost = Math.min(1.3, Math.max(1, 900 / (hud.scale.displaySize.width || 900)));
    parts ??= {
      bg: undefined,
      next: undefined,
      glow: arena.add.graphics().setDepth(GLOW_DEPTH),
      floor: arena.add.graphics().setDepth(FLOOR_DEPTH),
      fx: arena.add.graphics().setDepth(FX_DEPTH),
      labels: Array.from({ length: MAX_PATCHES }, () => text(arena, Math.round(LABEL_PX * boost), 5).setOrigin(0.5, 1).setDepth(FLOOR_DEPTH + 0.05)),
      plate: hud.add.graphics().setDepth(HUD_DEPTH),
      badge: text(hud, Math.round(BADGE_PX * boost), 5).setOrigin(0, 0).setDepth(HUD_DEPTH),
    };
    return parts;
  };

  const fx = new TerrainFx({
    swap(): void {
      made();
    },
    changed(stage, _count, from): void {
      made();
      if (from !== 0 && stage !== from) landedAt = now();
    },
    blocked(x, y): void {
      sparkX[sparkNext] = x + 20;
      sparkY[sparkNext] = y + 20;
      sparkAt[sparkNext] = now();
      sparkNext = (sparkNext + 1) % MAX_SPARKS;
    },
    stood(): void {
      // The badge follows the hero's position each frame (the sim's rule); the event only wakes the view.
      made();
    },
    healed(): void {
      healAt = now();
    },
    say,
  });
  fx.start(view.arcade()?.stage ?? 0);

  /** A backdrop image of `stage`'s element: made on first use, then re-textured (the Arena's own backdrop is under it). */
  const backdrop = (cur: Phaser.GameObjects.Image | undefined, stage: number, depth: number): Phaser.GameObjects.Image | undefined => {
    const key = `bg:${STAGE_ELEMENTS[stage - 1] ?? ''}`;
    if (!arena.textures.exists(key)) return cur;
    if (!cur) return arena.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(ARENA_W, ARENA_H).setDepth(depth);
    if (cur.texture.key !== key) cur.setTexture(key).setDisplaySize(ARENA_W, ARENA_H);
    return cur;
  };

  /** The static art of the layout: glow rings, then each patch's fill, pattern and border. */
  const drawFloor = (p: NonNullable<typeof parts>, stage: number, count: number, rects: readonly number[]): void => {
    const color = PATCH_COLORS[stage - 1] ?? 0xffffff;
    const dark = PATCH_DARK[stage - 1] ?? 0;
    const g = p.floor.clear();
    const glow = p.glow.clear();
    for (let i = 0; i < count; i++) {
      const x = rects[i * 4] ?? 0;
      const y = rects[i * 4 + 1] ?? 0;
      const w = rects[i * 4 + 2] ?? 0;
      const h = rects[i * 4 + 3] ?? 0;
      for (let k = GLOW_RINGS; k >= 1; k--) glow.fillStyle(color, 0.07).fillRoundedRect(x - k * 6, y - k * 6, w + k * 12, h + k * 12, 10 + k * 4);
      if (stage === 3) rock(g, x, y, w, h);
      else {
        g.fillStyle(0x000000, 0.18).fillRect(x + 4, y + 4, w, h);
        g.fillStyle(color, stage === 4 ? 0.3 : 0.38).fillRect(x, y, w, h);
        if (stage === 1) flames(g, x, y, w, h);
        else if (stage === 2) waves(g, x, y, w, h);
        else swirls(g, x, y, w, h);
        // A dashed-looking inner frame in the element's dark colour plus a bright outer line: visible on any backdrop.
        g.lineStyle(highContrast ? 5 : 3, dark, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
        g.lineStyle(2, highContrast ? 0xffffff : color, 1).strokeRect(x - 1, y - 1, w + 2, h + 2);
      }
    }
  };

  const drawLabels = (p: NonNullable<typeof parts>, stage: number, count: number, rects: readonly number[]): void => {
    labels.length = 0;
    const word = PATCH_WORDS[stage - 1] ?? '';
    for (let i = 0; i < MAX_PATCHES; i++) {
      const t = p.labels[i];
      if (!t) continue;
      if (i >= count) {
        t.setVisible(false);
        continue;
      }
      labels.push(word);
      if (t.text !== word) t.setText(word);
      t.setColor(hex(0xffffff)).setPosition((rects[i * 4] ?? 0) + (rects[i * 4 + 2] ?? 0) / 2, (rects[i * 4 + 1] ?? 0) - 3).setVisible(true);
    }
  };

  /** The buff badge: a dark plate, the element's icon and the word. */
  const drawBadge = (p: NonNullable<typeof parts>, stage: number, label: string): void => {
    const g = p.plate.clear();
    if (label === '') {
      p.badge.setVisible(false);
      return;
    }
    p.badge.setText(label).setPosition(BADGE_X + ICON + 14, BADGE_Y).setVisible(true);
    const h = p.badge.height;
    const w = ICON + 8 + p.badge.width;
    g.fillStyle(0x000000, highContrast ? 0.85 : 0.6).fillRoundedRect(BADGE_X - 8, BADGE_Y - 4, w + 20, h + 8, 6);
    g.lineStyle(highContrast ? 3 : 2, PATCH_COLORS[stage - 1] ?? 0xffffff, 1).strokeRoundedRect(BADGE_X - 8, BADGE_Y - 4, w + 20, h + 8, 6);
    icon(g, stage, BADGE_X + ICON / 2, BADGE_Y + h / 2);
  };

  const found = (): boolean => hero.found;

  function draw(_time: number, delta: number): void {
    if (drawnTick !== tick) sub = 0;
    else sub = Math.min(TICK_MS - 1, sub + delta);
    drawnTick = tick;
    const ar = view.arcade();
    const p = parts ?? (hud.sys.isActive() && ar ? made() : undefined);
    if (!p || !ar) return;
    const clock = now();
    const stage = ar.stage;
    const count = Math.min(MAX_PATCHES, ar.patchCount);
    // The static art, only when the layout changed.
    let changed = stage !== drawn.stage || count !== drawn.count;
    for (let i = 0; i < count * 4 && !changed; i++) changed = ar.patches[i] !== drawn.rects[i];
    if (changed) {
      drawn.stage = stage;
      drawn.count = count;
      for (let i = 0; i < MAX_PATCHES * 4; i++) drawn.rects[i] = ar.patches[i] ?? 0;
      drawFloor(p, stage, count, ar.patches);
      drawLabels(p, stage, count, ar.patches);
    }
    // Backdrop of the stage, the next one fading in over a swap's telegraph.
    p.bg = stage > 0 ? backdrop(p.bg, stage, BG_DEPTH) : p.bg;
    drawn.backdrop = p.bg && stage > 0 ? (STAGE_ELEMENTS[stage - 1] ?? '') : '';
    drawn.nextBackdrop = nextBackdropAlpha(ar.swapLeft, reduced);
    if (drawn.nextBackdrop > 0) p.next = backdrop(p.next, ar.swapTo, BG_DEPTH + 0.01)?.setAlpha(drawn.nextBackdrop).setVisible(true);
    else p.next?.setVisible(false);
    // Fades are object alpha; the glow pulses on its own.
    drawn.alpha = patchAlpha(ar.swapLeft, clock - landedAt, reduced);
    drawn.glow = glowAlpha(clock, drawn.alpha, reduced);
    p.floor.setAlpha(drawn.alpha);
    tiles.update(stage, drawn.alpha);
    p.glow.setAlpha(drawn.glow);
    for (const t of p.labels) t.setAlpha(drawn.alpha);
    // Particles (motion only) and sparks.
    const f = p.fx.clear();
    const n = reduced || stage === 0 ? 0 : Math.min(MAX_PARTICLES, count * PARTICLES_PER_PATCH);
    const color = PATCH_COLORS[stage - 1] ?? 0xffffff;
    for (let j = 0; j < n; j++) {
      const k = Math.floor(j / PARTICLES_PER_PATCH);
      particle(stage, k, j % PARTICLES_PER_PATCH, clock, ar.patches[k * 4] ?? 0, ar.patches[k * 4 + 1] ?? 0, ar.patches[k * 4 + 2] ?? 0, ar.patches[k * 4 + 3] ?? 0, pt);
      const a = pt.a * drawn.alpha;
      if (pt.len > 0) {
        f.lineStyle(4, 0x000000, a * 0.3).lineBetween(pt.x, pt.y, pt.x + pt.len, pt.y);
        f.lineStyle(2, 0xffffff, a).lineBetween(pt.x, pt.y, pt.x + pt.len, pt.y);
      } else {
        f.fillStyle(0x000000, a * 0.5).fillCircle(pt.x, pt.y, pt.r + 1.5);
        f.fillStyle(stage === 3 ? 0xe8d2a0 : stage === 1 && pt.r < 2.2 ? 0xffd23f : color, a).fillCircle(pt.x, pt.y, pt.r);
      }
    }
    drawn.particles = n;
    sparks = 0;
    for (let s = 0; s < MAX_SPARKS; s++) {
      const age = clock - (sparkAt[s] ?? 0);
      if (age < 0 || age >= SPARK_TICKS) continue;
      sparks++;
      const r = reduced ? 16 : 8 + age * 1.4;
      const a = reduced ? 1 : 1 - progress(age, 0, SPARK_TICKS);
      for (let ray = 0; ray < 8; ray++) {
        const ang = (ray * Math.PI) / 4;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        f.lineStyle(5, 0x000000, a * 0.5).lineBetween((sparkX[s] ?? 0) + dx * r * 0.4, (sparkY[s] ?? 0) + dy * r * 0.4, (sparkX[s] ?? 0) + dx * r, (sparkY[s] ?? 0) + dy * r);
        f.lineStyle(3, ray % 2 === 0 ? 0xfff2b0 : 0xffffff, a).lineBetween((sparkX[s] ?? 0) + dx * r * 0.4, (sparkY[s] ?? 0) + dy * r * 0.4, (sparkX[s] ?? 0) + dx * r, (sparkY[s] ?? 0) + dy * r);
      }
    }
    // The buff badge: the player's hero standing in a patch of its own element.
    hero.found = false;
    view.forEachCharacter(visit);
    const label = found() ? badgeText(stage, hero.stage, ar.patches, count, hero.x, hero.y) : '';
    if (label !== drawn.badge) {
      drawn.badge = label;
      drawBadge(p, stage, label);
    }
    if (label !== '') p.badge.setScale(reduced ? 1 : 1 + 0.15 * (1 - progress(clock, healAt, 12)));
  }

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    hud.events.off('shutdown', off).off('destroy', off);
    states.delete(arena);
    tiles.destroy();
    if (parts) {
      for (const o of [parts.bg, parts.next, parts.glow, parts.floor, parts.fx, parts.plate, parts.badge, ...parts.labels]) o?.destroy();
    }
    parts = undefined;
  };
  arena.events.on('postupdate', draw);
  for (const s of [arena, hud]) s.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => ({
    stage: Math.max(0, drawn.stage), patches: Math.max(0, drawn.count), rects: drawn.rects.slice(0, Math.max(0, drawn.count) * 4),
    labels: [...labels], alpha: drawn.alpha, glow: drawn.glow, particles: drawn.particles, sparks, backdrop: drawn.backdrop,
    nextBackdrop: drawn.nextBackdrop, badge: drawn.badge,
  }));
  return (events) => {
    tick = view.tick;
    sub = 0;
    if (tick % 50 === 0) {
      const pr = prefs();
      reduced = pr.reduceMotion;
      highContrast = pr.highContrast;
    }
    fx.consume(events);
  };
}

/** Fire: rows of flame tongues (an orange body, a yellow core, a dark outline), every other row offset. */
function flames(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const cell = 32;
  for (let row = 0, cy = y + 20; cy + 14 <= y + h; row++, cy += cell) {
    for (let cx = x + 16 + (row % 2) * 16; cx + 12 <= x + w; cx += cell) {
      g.fillStyle(0xff7a1a, 1).fillTriangle(cx - 10, cy + 12, cx + 10, cy + 12, cx, cy - 14);
      g.fillStyle(0xffd23f, 1).fillTriangle(cx - 5, cy + 12, cx + 5, cy + 12, cx, cy - 2);
      g.lineStyle(2, 0x8f2a00, 1).strokeTriangle(cx - 10, cy + 12, cx + 10, cy + 12, cx, cy - 14);
    }
  }
}

/** Water: rows of wavy lines (a dark underline, then a light crest). */
function waves(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  for (let ly = y + 24; ly < y + h - 6; ly += 22) {
    for (const [width, color, off] of [[5, 0x0b3f7a, 2], [3, 0xdff2ff, 0]] as const) {
      g.lineStyle(width, color, 1).beginPath().moveTo(x + 6, ly + off);
      for (let px = x + 12; px <= x + w - 6; px += 6) g.lineTo(px, ly + off + Math.sin((px - x) * 0.32) * 5);
      g.strokePath();
    }
  }
}

/** Air: spiral swirls, one per 80 px cell (a dark underline, then a light stroke). */
function swirls(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  for (let cy = y + 40; cy <= y + h - 30; cy += 80) {
    for (let cx = x + 40; cx <= x + w - 30; cx += 80) {
      for (const [width, color] of [[6, 0x4a7f95], [3, 0xffffff]] as const) {
        g.lineStyle(width, color, 1).beginPath().moveTo(cx, cy);
        for (let a = 0; a <= 13; a += 0.5) g.lineTo(cx + Math.cos(a) * (2 + a * 2.1), cy + Math.sin(a) * (2 + a * 2.1));
        g.strokePath();
      }
    }
  }
}

/**
 * Earth: a raised, solid block. A shadow beyond its footprint, a lit top face of staggered bricks and a dark front face
 * along the bottom, so it reads as a wall; the footprint is the sim's collision box.
 */
function rock(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  g.fillStyle(0x000000, 0.4).fillRect(x + 10, y + 12, w, h);
  const top = h - ROCK_FACE;
  g.fillStyle(0xc89650, 1).fillRect(x, y, w, top);
  g.fillStyle(0x6b4a24, 1).fillRect(x, y + top, w, ROCK_FACE);
  g.lineStyle(2, 0x4a3016, 1);
  for (let row = 0, ry = y + 20; ry < y + top; row++, ry += 20) {
    g.lineBetween(x, ry, x + w, ry);
    for (let bx = x + 26 + (row % 2) * 26; bx < x + w - 6; bx += 52) g.lineBetween(bx, ry - 20, bx, Math.min(ry, y + top));
  }
  g.lineStyle(2, 0x3a2410, 1);
  for (let bx = x + 26; bx < x + w - 6; bx += 52) g.lineBetween(bx, y + top, bx, y + h);
  g.lineStyle(3, 0xfff0c8, 0.8).lineBetween(x + 2, y + 2, x + w - 2, y + 2);
  g.lineStyle(4, 0x1a0e04, 1).strokeRect(x, y, w, h);
}

/** The small element icon of the badge in an ICON box centred on (x, y): a flame, a drop, a block, a swirl. */
function icon(g: Phaser.GameObjects.Graphics, stage: number, x: number, y: number): void {
  const r = ICON / 2;
  const color = PATCH_COLORS[stage - 1] ?? 0xffffff;
  g.fillStyle(color, 1).lineStyle(3, color, 1);
  if (stage === 1) g.fillTriangle(x - r * 0.7, y + r, x + r * 0.7, y + r, x, y - r);
  else if (stage === 2) g.fillTriangle(x, y - r, x - r * 0.6, y + r * 0.2, x + r * 0.6, y + r * 0.2).fillCircle(x, y + r * 0.3, r * 0.6);
  else if (stage === 3) g.fillRect(x - r, y - r * 0.6, r * 2, r * 1.4).lineStyle(2, 0x000000, 1).strokeRect(x - r, y - r * 0.6, r * 2, r * 1.4);
  else {
    g.beginPath().moveTo(x, y);
    for (let a = 0; a <= 11; a += 0.5) g.lineTo(x + Math.cos(a) * (1 + a * 1.0), y + Math.sin(a) * (1 + a * 1.0));
    g.strokePath();
  }
}
