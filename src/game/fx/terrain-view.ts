import type Phaser from 'phaser';
import { FIGHT_BANNER_TICKS } from '../hud/round-announcer';
import { EntityFlag, RoundPhase, SimEventKind, arcadePlayfield, type RenderCharacter, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { coreDisplayWidth, resolutionOf } from '../boot/viewport';
import { mountStageBackdrop, type StageBackdrop } from './terrain-stage';
import { mute } from './grim-fx';
import { drawPad } from './terrain-pad';
import { drawRock } from './terrain-props';
import { mountAmbient, type Ambient } from './terrain-ambient';
import { mountTileFloor, type TileFloor } from './terrain-floor';
import { mountEarthLight, type EarthLight } from './earth-light';
import { arcadeHeroScale, visualBox, type Box } from '../views/hero-scale';
import {
  CHIP_MARGIN, MAX_PARTICLES, MAX_PATCHES, SLOT_HOLD, MAX_SPARKS, PARTICLES_PER_PATCH, PATCH_COLORS, PATCH_WORDS, SPARK_TICKS, STAGE_ELEMENTS, TICK_MS, VOID_BACKDROP_TINT,
  TerrainFx, badgeText, chipCentreX, chipOwner, glowAlpha, nextBackdropAlpha, particle, patchAlpha, progress, type Particle,
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

/** Length of the tag call in view ticks (hud/tag-fx.ts CALL_TICKS; copied so this lazy chunk does not pull the tag HUD in). */
const TAG_CALL_TICKS = 60;

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
/** The buff badge sits in the playfield's top-left corner (it starts at y 200), below the HUD block, so it never meets the status chips that wrap under the bar (qa-r114 #5). */
const BADGE_X = 16;
const BADGE_Y = 206;
const BADGE_PX = 26;
const LABEL_PX = 13;
/** The playfield's vertical span (the HUD ends at 200, the action bar starts near 640): chips are pushed toward its edges, CHIP_GAP clear of their patch. */
const FIELD_TOP_Y = 222;
const FIELD_BOTTOM_Y = 628;
const FIELD_MID_Y = (FIELD_TOP_Y + FIELD_BOTTOM_Y) / 2;
const CHIP_GAP = 22;
const ICON = 26;
/** Ambient motes and mist: over the floor, under the fighters' flash effects. */
const AMBIENT_DEPTH = 0.5;
/**
 * Chip plates and their words sit above the floor patches (-0.7) but under every fighter layer (the lowest, a fighter's ground shadow, is at -0.6; fighters are at 0):
 * a chip can never paint over a character, only fade out of its way. The word is one step above its own plate.
 */
export const CHIP_DEPTH = FLOOR_DEPTH + 0.04;
export const LABEL_DEPTH = CHIP_DEPTH + 0.01;
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
  /** The depth of the chip plates and of their words (both under every fighter layer, which starts at -0.6). */
  readonly chipDepth: number;
  readonly labelDepth: number;
  /** Each chip's plate box in world px and the alpha it is drawn with now (0 when hidden; it eases down while a fighter stands near). */
  readonly chips: readonly { x: number; y: number; w: number; h: number; alpha: number; slot: number }[];
  /** The world rect of the camera's view the chips were kept inside this frame, and the drawn fighters' boxes (padded) they dodge. */
  readonly view: { x: number; y: number; w: number; h: number };
  readonly bodies: readonly { x: number; y: number; w: number; h: number }[];
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
/** Seconds the floor words show the first time a stage appears, and the fade at the end of it. */
const HINT_TICKS = Math.round(4000 / TICK_MS);
const HINT_FADE_TICKS = Math.round(160 / TICK_MS); // CHIP-FADE-1: opaque or gone, a short fade only to avoid a pop
export function labelHintAlpha(sinceFirstSeen: number): number {
  return Math.max(0, Math.min(1, (HINT_TICKS - sinceFirstSeen) / HINT_FADE_TICKS));
}

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
  let airShade: Phaser.GameObjects.Rectangle | undefined;
  const stageArt: StageBackdrop = mountStageBackdrop(arena, base);
  const earthLight: EarthLight = mountEarthLight(arena);
  /** True when the Void character is on the field (the Tour's last boss): its arena has no element scenery, only the void backdrop. */
  let voidFight = false;
  let voidChecked = false;
  let parts:
    | {
      bg: Phaser.GameObjects.Image | undefined; next: Phaser.GameObjects.Image | undefined;
      glow: Phaser.GameObjects.Graphics; floor: Phaser.GameObjects.Graphics; fx: Phaser.GameObjects.Graphics;
      labels: Phaser.GameObjects.Text[]; chips: Phaser.GameObjects.Graphics[]; plate: Phaser.GameObjects.Graphics; badge: Phaser.GameObjects.Text; ambient: Ambient;
    }
    | undefined;

  // View time: the view tick plus the frame time since it changed (capped below one tick, so it holds while paused).
  let tick = view.tick;
  /** The FIGHT! banner's last tick (the floor words stay hidden until then). */
  let fightBannerUntil = 0;
  /** The tag call's last tick (the floor chips hide under "TAG!" / "<NAME> IN!" so the words never overlap). */
  let tagCallUntil = 0;
  let drawnTick = tick;
  let sub = 0;
  const now = (): number => tick + sub / TICK_MS;

  let crowdTick = -1;
  let crowdSeq = -1;
  let landedAt = Number.NEGATIVE_INFINITY;
  let healAt = Number.NEGATIVE_INFINITY;
  /** The view time each stage's floor words first showed (stage index, 1 to 4). */
  const firstSeen: (number | undefined)[] = [];
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
  /** Each floor chip's box (x, y, w, h) and how many fighters stand over it now (the chip fades out of their way). */
  const chipBox = new Float64Array(MAX_PATCHES * 4);
  const chipNear = new Uint8Array(MAX_PATCHES);
  const near = (c: RenderCharacter): void => {
    if ((c.flags & (EntityFlag.benched | EntityFlag.dead)) !== 0) return;
    for (let i = 0; i < MAX_PATCHES; i++) {
      const x = chipBox[i * 4] ?? 0;
      const y = chipBox[i * 4 + 1] ?? 0;
      if (c.x < x + (chipBox[i * 4 + 2] ?? 0) + 72 && c.x + c.w > x - 72 && c.y < y + (chipBox[i * 4 + 3] ?? 0) + 24 && c.y + c.h > y - 24) chipNear[i] = 1;
    }
  };
  // FLOOR-TAGS-1: each chip has a base slot (today's rule) and an alternate on the patch's other side; per frame it is kept inside the
  // camera's view and out from under the drawn (2x) fighters. Preallocated, nothing per frame.
  const chipCx = new Float64Array(MAX_PATCHES);
  const chipPatchL = new Float64Array(MAX_PATCHES);
  const chipPatchR = new Float64Array(MAX_PATCHES);
  const chipYBase = new Float64Array(MAX_PATCHES);
  const chipYAlt = new Float64Array(MAX_PATCHES);
  const chipX = new Float64Array(MAX_PATCHES).fill(Number.NaN);
  const chipY = new Float64Array(MAX_PATCHES).fill(Number.NaN);
  const chipSlot = new Uint8Array(MAX_PATCHES);
  const chipClear = new Uint8Array(MAX_PATCHES);
  const BODY_PAD = 8;
  const MAX_BODIES = 16;
  const bodyBox = new Float64Array(MAX_BODIES * 4);
  let bodies = 0;
  const scratch: Box = { x: 0, y: 0, w: 0, h: 0 };
  const viewRect = { x: 0, y: 0, w: ARENA_W, h: ARENA_H };
  const collect = (c: RenderCharacter): void => {
    if ((c.flags & (EntityFlag.benched | EntityFlag.dead)) !== 0 || bodies >= MAX_BODIES) return;
    const b = visualBox(c.x, c.y, c.w, c.h, arcadeHeroScale(c.h), scratch, ARENA_W);
    bodyBox[bodies * 4] = b.x - BODY_PAD;
    bodyBox[bodies * 4 + 1] = b.y - BODY_PAD;
    bodyBox[bodies * 4 + 2] = b.w + BODY_PAD * 2;
    bodyBox[bodies * 4 + 3] = b.h + BODY_PAD * 2;
    bodies++;
  };
  /** True when the chip rect (left, top, w, h) meets any drawn fighter box. */
  const meetsBody = (l: number, t: number, w: number, h: number): boolean => {
    for (let b = 0; b < bodies; b++) {
      const bx = bodyBox[b * 4] ?? 0;
      const by = bodyBox[b * 4 + 1] ?? 0;
      if (l < bx + (bodyBox[b * 4 + 2] ?? 0) && l + w > bx && t < by + (bodyBox[b * 4 + 3] ?? 0) && t + h > by) return true;
    }
    return false;
  };
  /** The camera's view in world px, kept inside the arena; the whole arena when the camera reports no zoom (unit fakes). */
  const updateView = (): void => {
    const cam = arena.cameras.main as Partial<Phaser.Cameras.Scene2D.Camera> | undefined;
    const zoom = cam?.zoom ?? Number.NaN;
    const width = cam?.width ?? Number.NaN;
    const scroll = cam?.scrollX ?? Number.NaN;
    let l = 0;
    let r = ARENA_W;
    if (Number.isFinite(zoom) && zoom > 0 && Number.isFinite(width) && Number.isFinite(scroll)) {
      const w = width / zoom;
      l = Math.max(0, scroll + width / 2 - w / 2);
      r = Math.min(ARENA_W, scroll + width / 2 + w / 2);
    }
    viewRect.x = l;
    viewRect.w = r - l;
  };
  /** Per frame: the chip's slot (escape a head now, return after SLOT_HOLD clear frames), its x inside the view, and its plate box. */
  const placeChips = (p: NonNullable<typeof parts>, count: number): void => {
    for (let i = 0; i < count; i++) {
      const t = p.labels[i];
      if (!t) continue;
      const w = chipBox[i * 4 + 2] ?? 0;
      const h = chipBox[i * 4 + 3] ?? 0;
      const x = chipCentreX(chipCx[i] ?? 0, w, chipPatchL[i] ?? 0, chipPatchR[i] ?? 0, viewRect.x, viewRect.x + viewRect.w, CHIP_MARGIN);
      const yBase = chipYBase[i] ?? 0;
      const yAlt = chipYAlt[i] ?? 0;
      const hasAlt = yAlt !== yBase;
      let slot = chipSlot[i] ?? 0;
      const baseCovered = meetsBody(x - w / 2, yBase - h, w, h);
      if (slot === 0) {
        if (baseCovered && hasAlt && !meetsBody(x - w / 2, yAlt - h, w, h)) {
          slot = 1;
          chipClear[i] = 0;
          chipFade[i] = 1; // the new slot is clear of every body by construction: land opaque (CHIP-FADE-1)
        }
      } else if (baseCovered) {
        chipClear[i] = 0;
        // Both slots covered: stay (the fade handles it); only the alternate covered: escape now.
      } else {
        chipClear[i] = Math.min(255, (chipClear[i] ?? 0) + 1);
        if ((chipClear[i] ?? 0) >= SLOT_HOLD || meetsBody(x - w / 2, yAlt - h, w, h)) {
          slot = 0;
          chipFade[i] = 1;
        }
      }
      chipSlot[i] = slot;
      const y = slot === 0 ? yBase : yAlt;
      chipBox[i * 4] = x - w / 2;
      chipBox[i * 4 + 1] = y - h;
      if (Math.abs(x - (chipX[i] ?? Number.NaN)) > 0.25 || Math.abs(y - (chipY[i] ?? Number.NaN)) > 0.25 || Number.isNaN(chipX[i] ?? Number.NaN)) {
        chipX[i] = x;
        chipY[i] = y;
        t.setPosition(x, y);
        p.chips[i]?.setPosition(x, y);
      }
    }
  };
  /** The one patch whose chip shows (the others' chips stay laid out but hidden; see chipOwner). */
  let chipOwnerIdx = -1;
  const chipFade = new Float64Array(MAX_PATCHES).fill(1);
  const chipAlpha = new Float64Array(MAX_PATCHES);
  const chipShown = new Uint8Array(MAX_PATCHES);

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
        fontFamily: LABEL_FONT, fontSize: `${String(px)}px`, fontStyle: 'bold', color: LABEL_COLOR, stroke: '#0a0806', strokeThickness: Math.max(2, stroke - 2),
        resolution: resolutionOf(scene),
      })
      .setVisible(false);

  /** The objects, made on the first frame the Hud runs. */
  const made = (): NonNullable<typeof parts> => {
    // Up to 1.3x on a phone (the weather badge's boost), so the words stay near 8 CSS px.
    const boost = Math.min(1.3, Math.max(1, 900 / (coreDisplayWidth(hud) || 900)));
    parts ??= {
      bg: undefined,
      next: undefined,
      glow: arena.add.graphics().setDepth(GLOW_DEPTH),
      floor: arena.add.graphics().setDepth(FLOOR_DEPTH),
      fx: arena.add.graphics().setDepth(FX_DEPTH),
      labels: Array.from({ length: MAX_PATCHES }, () => text(arena, Math.round(LABEL_PX * boost), 5).setOrigin(0.5, 1).setPadding(8, 2, 8, 3).setDepth(LABEL_DEPTH)),
      chips: Array.from({ length: MAX_PATCHES }, () => arena.add.graphics().setDepth(CHIP_DEPTH).setVisible(false)),
      plate: hud.add.graphics().setDepth(HUD_DEPTH),
      badge: text(hud, Math.round(BADGE_PX * boost), 5).setOrigin(0, 0).setDepth(HUD_DEPTH),
      ambient: mountAmbient(arena, hud, AMBIENT_DEPTH),
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
    // The Void boss's fight keeps one arena of its own: the void swirl whatever element the stage swaps to (the patches still follow the sim).
    const key = `bg:${voidFight ? 'void' : (STAGE_ELEMENTS[stage - 1] ?? '')}`;
    if (!arena.textures.exists(key)) return cur;
    const img = cur ?? arena.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(ARENA_W, ARENA_H).setDepth(depth);
    if (img.texture.key !== key) img.setTexture(key).setDisplaySize(ARENA_W, ARENA_H);
    if (voidFight) img.setTint(VOID_BACKDROP_TINT);
    return img;
  };

  /** The static art of the layout: glow rings, then each patch's fill, pattern and border. */
  const drawFloor = (p: NonNullable<typeof parts>, stage: number, count: number, rects: readonly number[]): void => {
    const color = highContrast ? (PATCH_COLORS[stage - 1] ?? 0xffffff) : m(PATCH_COLORS[stage - 1] ?? 0xffffff);
    const g = p.floor.clear();
    const glow = p.glow.clear();
    for (let i = 0; i < count; i++) {
      const x = rects[i * 4] ?? 0;
      const y = rects[i * 4 + 1] ?? 0;
      const w = rects[i * 4 + 2] ?? 0;
      const h = rects[i * 4 + 3] ?? 0;
      for (let k = GLOW_RINGS; k >= 1; k--) glow.fillStyle(color, stage === 3 ? 0.07 : stage === 1 ? 0.05 : 0.03).fillRoundedRect(x - k * 6, y - k * 6, w + k * 12, h + k * 12, 10 + k * 4);
      if (stage === 3) drawRock(g, x, y, w, h, i, highContrast);
      else drawPad(g, stage, x, y, w, h, i, highContrast);
    }
  };

  const drawLabels = (p: NonNullable<typeof parts>, stage: number, count: number, rects: readonly number[]): void => {
    labels.length = 0;
    chipOwnerIdx = chipOwner(rects, count, ARENA_W / 2);
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
      const cx = (rects[i * 4] ?? 0) + (rects[i * 4 + 2] ?? 0) / 2;
      // Chips sit out toward the nearer horizontal edge of the field (above the patch in the top half, below it in the bottom half), clear of the fighters' row.
      const top = rects[i * 4 + 1] ?? 0;
      const rh = rects[i * 4 + 3] ?? 0;
      const lower = top + rh / 2 > FIELD_MID_Y;
      const above = Math.max(FIELD_TOP_Y, Math.min(FIELD_BOTTOM_Y, top - CHIP_GAP));
      const below = Math.max(FIELD_TOP_Y, Math.min(FIELD_BOTTOM_Y, top + rh + t.height + CHIP_GAP));
      const cy = lower ? below : above;
      chipCx[i] = cx;
      chipPatchL[i] = rects[i * 4] ?? 0;
      chipPatchR[i] = (rects[i * 4] ?? 0) + (rects[i * 4 + 2] ?? 0);
      chipYBase[i] = cy;
      chipYAlt[i] = lower ? above : below;
      chipSlot[i] = 0;
      chipClear[i] = 0;
      chipX[i] = Number.NaN;
      t.setColor(highContrast ? hex(0xffffff) : LABEL_COLOR).setPosition(cx, cy);
      // A small chip: dark plate with a rim in the stage's colour, so the word reads over any floor and never looks like loose type.
      const w = t.width;
      const h = t.height;
      const rim = PATCH_COLORS[stage - 1] ?? 0xffffff;
      p.chips[i]?.clear().fillStyle(0x0e0b14, CHIP_PLATE_ALPHA).fillRoundedRect(-w / 2, -h, w, h, h / 2)
        .lineStyle(highContrast ? 2 : 1.5, rim, 0.9).strokeRoundedRect(-w / 2, -h, w, h, h / 2)
        // qa-r38: a thin dark halo outside the rim keeps the pill's edge crisp over pale floors (water, air).
        .lineStyle(1.5, 0x0e0b14, 0.85).strokeRoundedRect(-w / 2 - 1.5, -h - 1.5, w + 3, h + 3, h / 2 + 1.5).setPosition(cx, cy);
      chipBox[i * 4] = cx - w / 2;
      chipBox[i * 4 + 1] = cy - h;
      chipBox[i * 4 + 2] = w;
      chipBox[i * 4 + 3] = h;
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
    if (!voidChecked) {
      voidChecked = true;
      view.forEachCharacter((c) => { if (c.element === 'void') voidFight = true; });
    }
    /** The element scenery's stage: 0 (none) in the Void's arena. */
    const scenery = voidFight ? 0 : stage;
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
    drawn.backdrop = p.bg && stage > 0 ? (voidFight ? 'void' : (STAGE_ELEMENTS[stage - 1] ?? '')) : '';
    drawn.nextBackdrop = voidFight ? 0 : nextBackdropAlpha(ar.swapLeft, reduced);
    if (drawn.nextBackdrop > 0) p.next = backdrop(p.next, ar.swapTo, BG_DEPTH + 0.01)?.setAlpha(drawn.nextBackdrop).setVisible(true);
    else p.next?.setVisible(false);
    // Fades are object alpha; the glow pulses on its own.
    drawn.alpha = patchAlpha(ar.swapLeft, clock - landedAt, reduced);
    drawn.glow = glowAlpha(clock, drawn.alpha, reduced);
    p.floor.setAlpha(drawn.alpha);
    tiles.update(scenery, drawn.alpha);
    // r30: the Air floor is near white, so pale fighters (Echo, Wispera) vanish on it: a soft indigo wash above the floor, below the fighters.
    if (scenery === 4 && !airShade) airShade = arena.add.rectangle(0, 0, ARENA_W, ARENA_H, 0x2a3a66, 0.2).setOrigin(0, 0).setDepth(TILES_DEPTH + 0.05);
    airShade?.setVisible(scenery === 4).setAlpha(drawn.alpha);
    earthLight.update(scenery, drawn.alpha, clock * TICK_MS, reduced, highContrast);
    stageArt.update(scenery, arena.cameras.main.midPoint.x, clock * TICK_MS, reduced);
    p.ambient.update(scenery, (clock * TICK_MS) / 1000, reduced, drawn.alpha);
    p.glow.setAlpha(drawn.glow);
    // The words on the floor are a first-encounter hint (the badge and Help keep naming the buff): shown for a few seconds the first
    // time each stage appears, then the glow ring and the pad art carry it alone.
    // The hint clock starts when the words first show, not under the intro banners (CHIP-FADE-1).
    const bannerUp = ar.phase === RoundPhase.intro || tick < fightBannerUntil || tick < tagCallUntil;
    if (stage > 0 && !bannerUp && firstSeen[stage] === undefined) firstSeen[stage] = clock;
    const hint = stage > 0 ? labelHintAlpha(clock - (firstSeen[stage] ?? clock)) : 0;
    const ease = Math.min(Math.max(delta, 0), 50);
    updateView();
    bodies = 0;
    view.forEachCharacter(collect);
    placeChips(p, count);
    chipNear.fill(0);
    view.forEachCharacter(near);
    for (let i = 0; i < count; i++) if (meetsBody(chipBox[i * 4] ?? 0, chipBox[i * 4 + 1] ?? 0, chipBox[i * 4 + 2] ?? 0, chipBox[i * 4 + 3] ?? 0)) chipNear[i] = 1;
    p.labels.forEach((t, i) => {
      // Ease toward faint while a fighter stands on or beside the chip, back up when it leaves.
      // Hidden under the ROUND / FIGHT! banners so the chip words never bleed through their letters.
      const on = hint > 0 && stage !== 3 && i < count && i === chipOwnerIdx && !bannerUp && hud.registry.get('tte.cut') !== true; // not under the super cut-in band (qa-r98)
      // A chip that appears (round start, after a banner) with a fighter already on it starts faint instead of fading down in plain view.
      if (on && !chipShown[i] && chipNear[i]) chipFade[i] = 0.15;
      chipShown[i] = on ? 1 : 0;
      chipFade[i] = Math.max(0.15, Math.min(1, (chipFade[i] ?? 1) + (chipNear[i] ? -ease / 64 : ease / 100)));
      const a = drawn.alpha * hint * (chipFade[i] ?? 1);
      chipAlpha[i] = on ? a : 0;
      t.setVisible(on).setAlpha(a);
      p.chips[i]?.setVisible(on).setAlpha(a);
    });
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
        f.lineStyle(1, highContrast ? 0xffffff : 0x9aa09a, a * (highContrast ? 1 : 0.55)).lineBetween(pt.x, pt.y, pt.x + pt.len, pt.y);
      } else {
        f.fillStyle(0x000000, a * 0.5).fillCircle(pt.x, pt.y, pt.r + 1.5);
        f.fillStyle(stage === 3 ? 0xe8d2a0 : stage === 1 && pt.r < 2.2 ? (highContrast ? 0xffd23f : m(0xffd23f)) : (highContrast ? color : m(color)), highContrast ? a : a * 0.7).fillCircle(pt.x, pt.y, pt.r);
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
    airShade?.destroy();
    stageArt.destroy();
    earthLight.destroy();
    if (parts) {
      parts.ambient.destroy();
      for (const o of [parts.bg, parts.next, parts.glow, parts.floor, parts.fx, parts.plate, parts.badge, ...parts.labels, ...parts.chips]) o?.destroy();
    }
    parts = undefined;
  };
  arena.events.on('postupdate', draw);
  for (const s of [arena, hud]) s.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => ({
    stage: Math.max(0, drawn.stage), patches: Math.max(0, drawn.count), rects: drawn.rects.slice(0, Math.max(0, drawn.count) * 4),
    labels: [...labels], alpha: drawn.alpha, glow: drawn.glow, particles: drawn.particles, sparks, backdrop: drawn.backdrop,
    nextBackdrop: drawn.nextBackdrop, badge: drawn.badge, chipDepth: CHIP_DEPTH, labelDepth: LABEL_DEPTH,
    chips: Array.from({ length: Math.max(0, drawn.count) }, (_, i) => ({ x: chipBox[i * 4] ?? 0, y: chipBox[i * 4 + 1] ?? 0, w: chipBox[i * 4 + 2] ?? 0, h: chipBox[i * 4 + 3] ?? 0, alpha: chipAlpha[i] ?? 0, slot: chipSlot[i] ?? 0 })),
    view: { x: viewRect.x, y: 0, w: viewRect.w, h: ARENA_H },
    bodies: Array.from({ length: bodies }, (_, b) => ({ x: bodyBox[b * 4] ?? 0, y: bodyBox[b * 4 + 1] ?? 0, w: bodyBox[b * 4 + 2] ?? 0, h: bodyBox[b * 4 + 3] ?? 0 })),
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
    for (const e of events) if (e.kind === SimEventKind.fight) fightBannerUntil = view.tick + FIGHT_BANNER_TICKS;
    for (const e of events) if (e.kind === SimEventKind.tagIn) tagCallUntil = view.tick + TAG_CALL_TICKS;
    for (const e of events) {
      if (e.tick < crowdTick || (e.tick === crowdTick && e.seq <= crowdSeq)) continue;
      const kind = e.kind === SimEventKind.hitConfirmed ? 'hit' : e.kind === SimEventKind.superStarted ? 'super' : e.kind === SimEventKind.ko ? 'ko' : undefined;
      if (kind === undefined) continue;
      crowdTick = e.tick;
      crowdSeq = e.seq;
      stageArt.rouse(kind, now() * TICK_MS);
    }
  };
}

/** Grim grade for the patch art (owner: too cartoony): the same grey-pulled, darkened colour as the baked sprites. */
const m = (c: number): number => mute(c, 0.5, 0.8);
/** Words on patches and the badge: bone, not white, under a thin dark stroke. */
const LABEL_FONT = 'Georgia, "Times New Roman", serif';
const LABEL_COLOR = '#f2e8d2';
/** Chip plate opacity: over even a white floor the plate blends to about L 0.03, so the word keeps >= 4.5:1 on every stage. */
const CHIP_PLATE_ALPHA = 0.96;

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
