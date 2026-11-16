import type Phaser from 'phaser';
import { SUPER_NAMES, type Element } from '@core/index';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, coreDisplayWidth, resolutionOf } from '../boot/viewport';
import { HERO_IMAGE_NAME, drawnBox } from '../views/hero-scale';
import { DOLLY_MAX, DROP_K } from '../views/pose-depth';
import { applyCamera, holdCamera, viewBox } from './arena-pan';
import { punchAnchor } from './arena-camera';
import { ELEMENT_COLORS } from './element-colors';
import { PUNCH_ZOOM, TICK_MS, superFrame, type SuperFrame } from './super-cinematic';
import { BURST_COLOR, BURST_REACH, BURST_SHAPE, burstRadius, superBurst } from './super-burst';
import { embers, glowPair, mute, paintEmbers, softFill, softStroke, toPts } from './grim-fx';

/**
 * Phaser side of the super cinematic. The Phaser fx sink imports this module on the first super (Arcade only), so
 * Classic never downloads it; it imports nothing from the entry chunk, so loading it costs the Arena chunk only the
 * import call. Per scene, one dim overlay, one band, one portrait and two texts are made on the first super and reused;
 * a scene update listener exists only while a cinematic runs, and everything is dropped with the scene.
 */

/** The name of super `superId` (WP-arcade-supers: the race supers; 0 and unknown ids are the generic burst). */
export const superName = (superId: number): string => SUPER_NAMES[superId] ?? SUPER_NAMES[0] ?? 'ELEMENTAL BURST';
/** Preferred band centre (under the meters) when nothing forces it elsewhere; the band is 160 tall plus 6 px rules. */
const BAND_HIGH_Y = 200;
const BAND_H = 160;
/** The band stays between these rows (today's high and low slots): it never covers HUD it did not cover before. */
const BAND_TOP = 117;
const BAND_BOTTOM = 603;
/** Band scale steps, tried largest first: a smaller band fits between two fighters. */
const BAND_K = [1, 0.85, 0.7, 0.6] as const;
const HEAD_PAD = 12;
const FEET_PAD = 24;
/** The caster counts this much against the foe when the band cannot clear both (it then crosses the foe). */
const CASTER_WEIGHT = 3;
const AVOID_PAD = 8;
/** The weather badge row's lower edge: a band reaching above it hides the badge (`tte.band`). */
const WEATHER_LINE_Y = 240;
/** See-through, so a foe standing behind the band stays visible (qa-r3-super-cinematic-hides-action). */
const BAND_OPACITY = 0.5;
/** 72 and 52 logical px stay about 17 and 12 CSS px on the 390x844 phone's letterboxed canvas (about 304 px wide). */
const NAME_PX = 72;
const SUB_PX = 52;
const PORTRAIT_PX = 140;
/** The cut-in portrait is a cut-out of the caster (no box behind it) with a soft element-colour glow, so it reads as a luminous close-up, not a framed card (qa-r27). */
const GLOW_RINGS = 7;
/** The probe's `dim` stays the plan's value; the overlay is drawn this many times darker (a hard darken, SF/MvC style). */
const DIM_GAIN = 1.75;
const LINES = 26;
const PORTRAIT_X = 120;
const GLOW_R0 = 70;
/** The free width between the two portrait cards (1280 box): the title never reaches past it, so it is not clipped at a phone's edge (QA r21). */
export const NAME_SAFE_W = LOGICAL_WIDTH - 2 * (PORTRAIT_X + (PORTRAIT_PX + 16) / 2 + 12);

/** Font size that fits a title `width` px wide at `base` px into `safe` px: shrinks, never grows, never below 40% of `base`. */
export function fitTitlePx(base: number, width: number, safe: number): number {
  if (width <= safe || width <= 0) return base;
  return Math.max(Math.round(base * 0.4), Math.floor((base * safe) / width));
}
/** Over the characters (0), under the caster (lifted to DIM_DEPTH + 1), the band and the hit sparks (10). */
const DIM_DEPTH = 5;
/** Logical px the dim and band reach past each side of the 1280 box, so they cover the wide view (viewport.ts `enableWideView`, at most the 1920 world). */
const WIDE_SIDE = 320;
const SPAN = LOGICAL_WIDTH + 2 * WIDE_SIDE;
/** The element burst: over the dim, under the lifted caster. */
const BURST_DEPTH = DIM_DEPTH + 0.5;

/** A rectangle in core (1280x720) units. */
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}
/** A fighter's vertical extent the band must clear, with its weight. */
export interface Span {
  readonly top: number;
  readonly bottom: number;
  readonly w: number;
}
export interface BandSlot {
  readonly y: number;
  readonly k: number;
  readonly ext: number;
  readonly cost: number;
  readonly side: -1 | 0 | 1;
}

/** Half the band plus half a rule at scale `k`. */
export const bandExt = (k: number): number => (BAND_H / 2) * k + 3;

/**
 * The rows a fighter can reach during the cut: `top`/`bottom` is its box (core units, with the caster's dip already applied),
 * `spy` the punch-in anchor row and `zPeak` the peak zoom. A row `r` moves to `spy + (r - spy) z`, linear in z, so z = 1 and z = zPeak bound every frame.
 */
export function sweptSpan(top: number, bottom: number, spy: number, zPeak: number, w: number): Span {
  return {
    top: Math.floor(Math.min(top, spy + (top - spy) * zPeak) - HEAD_PAD),
    bottom: Math.ceil(Math.max(bottom, spy + (bottom - spy) * zPeak) + FEET_PAD),
    w,
  };
}

const meets = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The portrait's glow square (side -1 left, 1 right), centred on the band. */
export function portraitRect(side: number, y: number, k: number): Rect {
  const cx = side < 0 ? PORTRAIT_X : LOGICAL_WIDTH - PORTRAIT_X;
  const r = Math.min(133 * k, bandExt(k) + 8);
  return { x0: cx - r, y0: y - r, x1: cx + r, y1: y + r };
}

/** The caster's side if its portrait clears every `avoid` rect, else the other side if that clears, else 0 (no portrait). */
export function portraitSide(casterSide: -1 | 1, y: number, k: number, avoid: readonly Rect[]): -1 | 0 | 1 {
  const clear = (s: number): boolean => avoid.every((a) => !meets(portraitRect(s, y, k), a));
  if (clear(casterSide)) return casterSide;
  return clear(-casterSide) ? (-casterSide as -1 | 1) : 0;
}

/** Half the width the title may use at band row `y`: the safe width, narrowed to keep 12 px off an avoid rect the band reaches. */
export function nameHalfWidth(y: number, ext: number, avoid: readonly Rect[]): number {
  let d = Infinity;
  for (const a of avoid) {
    if (a.y1 <= y - ext || a.y0 >= y + ext) continue;
    d = Math.min(d, a.x0 > LOGICAL_WIDTH / 2 ? a.x0 - LOGICAL_WIDTH / 2 : a.x1 < LOGICAL_WIDTH / 2 ? LOGICAL_WIDTH / 2 - a.x1 : 0);
  }
  return Math.max(0, Math.min(NAME_SAFE_W / 2, d - 12));
}

/** True when a band at (`y`, `k`) reaches above the weather badge row (the badge, chip and call hide then). */
export const bandHidesWeather = (y: number, k: number): boolean => y - bandExt(k) < WEATHER_LINE_Y;

function better(a: BandSlot, b: BandSlot): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if ((a.side !== 0) !== (b.side !== 0)) return a.side !== 0;
  if (a.k !== b.k) return a.k > b.k;
  const da = Math.abs(a.y - BAND_HIGH_Y);
  const db = Math.abs(b.y - BAND_HIGH_Y);
  return da !== db ? da < db : a.y < b.y;
}

/**
 * Chooses the band row and scale: the least weighted overlap with the fighters' swept spans (0 = every fighter clear), then a
 * portrait that fits (not hidden), then the biggest band, then the row nearest the preferred one.
 */
export function superBandSlot(spans: readonly Span[], avoid: readonly Rect[], casterSide: -1 | 1): BandSlot {
  let best: BandSlot | undefined;
  for (const k of BAND_K) {
    const ext = bandExt(k);
    for (let y = BAND_TOP + Math.ceil(ext); y + ext <= BAND_BOTTOM; y++) {
      let cost = 0;
      for (const s of spans) cost += s.w * Math.max(0, Math.min(y + ext, s.bottom) - Math.max(y - ext, s.top));
      if (best && cost > best.cost) continue;
      const cand: BandSlot = { y, k, ext, cost, side: portraitSide(casterSide, y, k, avoid) };
      if (!best || better(cand, best)) best = cand;
    }
  }
  return best ?? { y: BAND_HIGH_Y, k: 1, ext: bandExt(1), cost: 0, side: casterSide };
}

const DOM_AVOID = ['touchStrike1', 'touchStrike2', 'pauseButton', 'touchStick'];
/** The touch controls over the canvas as core-unit rects (mapped like Hud.pauseLeft), padded; none off a touch screen. */
function domAvoid(scene: Phaser.Scene): Rect[] {
  const out: Rect[] = [];
  const doc = scene.game.canvas.ownerDocument;
  const canvas = scene.game.canvas.getBoundingClientRect();
  const k = coreDisplayWidth(scene) / LOGICAL_WIDTH;
  if (!(k > 0)) return out;
  const left = canvas.left + (canvas.width - LOGICAL_WIDTH * k) / 2;
  for (const id of DOM_AVOID) {
    const el = doc.getElementById(id);
    if (!el || el.getClientRects().length === 0) continue;
    const c = el.getBoundingClientRect();
    if (c.right <= canvas.left || c.left >= canvas.right || c.bottom <= canvas.top || c.top >= canvas.bottom) continue;
    out.push({
      x0: (c.left - left) / k - AVOID_PAD,
      y0: (c.top - canvas.top) / k - AVOID_PAD,
      x1: (c.right - left) / k + AVOID_PAD,
      y1: (c.bottom - canvas.top) / k + AVOID_PAD,
    });
  }
  return out;
}

/** A hero body image on the display list: structural check of the fields `drawnBox` reads. */
function isHeroImage(o: Phaser.GameObjects.GameObject): o is Phaser.GameObjects.Image {
  const i = o as Partial<Phaser.GameObjects.Image>;
  return i.frame !== undefined && typeof i.displayWidth === 'number' && typeof i.displayHeight === 'number' && typeof i.x === 'number' && typeof i.y === 'number';
}

/** The caster's pooled character view (`FxTarget` in event-fx.ts): portrait texture and frame, lifted over the dim. */
export interface SuperCaster {
  readonly image: Phaser.GameObjects.Image;
  readonly element: Element;
}

/** Read-out for the test probe: the frame, the texts shown and the camera zoom over the fit zoom. */
export type SuperState = SuperFrame & {
  readonly name: string;
  readonly sub: string;
  readonly camZoom: number;
  /** The band slot chosen at the start (core units; the name and portrait rects are at rest). */
  readonly band: BandSlot & { readonly portrait: Rect | null; readonly name: Rect; readonly avoid: readonly Rect[]; readonly spans: readonly Span[] };
  /** Every fighter's live drawn box in core units, through the cut's camera. */
  readonly fighters: readonly { x0: number; x1: number; top: number; bottom: number; caster: boolean }[];
};

interface Runner {
  start(caster: SuperCaster, from: number, until: number, reduced: boolean, superId: number): void;
  state(): SuperState | undefined;
}

const runners = new WeakMap<Phaser.Scene, Runner>();
const bursts = new WeakMap<Phaser.Scene, () => SuperBurstState | undefined>();

/** Read-out for the test probe: the element burst's shape, age (view ticks) and path count while it is drawn. */
export interface SuperBurstState {
  readonly element: Element;
  readonly shape: string;
  readonly age: number;
  readonly paths: number;
}

/** The element burst drawn on the last frame in `scene` (test probe), or undefined when none. */
export function superBurstState(scene: Phaser.Scene): SuperBurstState | undefined {
  return bursts.get(scene)?.();
}

/** Starts (or restarts) the cinematic in `scene`; `tick` is the view tick and `paused` holds the sub-tick motion. */
export function superCut(scene: Phaser.Scene, caster: SuperCaster, from: number, until: number, reduced: boolean, tick: () => number, paused: () => boolean, superId = 0): void {
  let r = runners.get(scene);
  if (!r) {
    r = createRunner(scene, tick, paused);
    runners.set(scene, r);
  }
  r.start(caster, from, until, reduced, superId);
}

/** The running cinematic's frame in `scene` (test probe), or undefined. */
export function superState(scene: Phaser.Scene): SuperState | undefined {
  return runners.get(scene)?.state();
}

function createRunner(scene: Phaser.Scene, tick: () => number, paused: () => boolean): Runner {
  const res = (): number => resolutionOf(scene);
  const text = (size: number): Phaser.GameObjects.Text =>
    scene.add
      .text(0, 0, '', { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(size)}px`, fontStyle: 'bold', color: '#d8d2c4', stroke: '#0a0806', strokeThickness: 5, resolution: res() })
      .setOrigin(0.5)
      .setDepth(DIM_DEPTH + 3);
  const parts = {
    dim: scene.add.rectangle(0, 0, SPAN, LOGICAL_HEIGHT, 0).setOrigin(0).setDepth(DIM_DEPTH),
    band: scene.add.rectangle(0, 0, SPAN, BAND_H, 0).setOrigin(0, 0.5).setDepth(DIM_DEPTH + 2),
    // Element-colour rules along the band edges and the speed lines through it, in band-relative coordinates (placed like the band).
    edges: scene.add.graphics().setDepth(DIM_DEPTH + 2.5),
    glow: scene.add.graphics().setDepth(DIM_DEPTH + 2.8).setBlendMode('ADD'),
    portrait: scene.add.image(0, 0, '__DEFAULT').setDepth(DIM_DEPTH + 3),
    name: text(NAME_PX),
    sub: text(SUB_PX),
  };
  const all = Object.values(parts);
  // The element burst outlives the cinematic: one Graphics redrawn on `postupdate` until its clock runs out.
  let burstG: Phaser.GameObjects.Graphics | undefined;
  let burstGlow: Phaser.GameObjects.Graphics | undefined;
  let burst: { element: Element; x: number; y: number; from: number; reduced: boolean } | undefined;
  let burstShown: SuperBurstState | undefined;
  const drawBurst = (): void => {
    burstG?.clear();
    burstGlow?.clear();
    burstShown = undefined;
    if (!burst) return;
    const age = tick() - burst.from;
    const b = superBurst(burst.element, burst.x, burst.y, age, burst.reduced);
    if (!b) {
      burst = undefined;
      scene.events.off('postupdate', drawBurst);
      return;
    }
    const g = (burstG ??= scene.add.graphics().setDepth(BURST_DEPTH));
    const glow = (burstGlow ??= scene.add.graphics().setDepth(BURST_DEPTH + 0.1));
    const pair = glowPair(g, glow);
    const color = mute(BURST_COLOR[burst.element], 0.75, 0.85);
    for (const p of b.paths) {
      // Grim look (grim-fx.ts): a faint layered fill, a smoky underlay and soft additive glow strokes, no bold outline or white line.
      if (p.fill) softFill(g, p.pts, color, b.alpha);
      softStroke(pair, toPts(p.pts), p.closed, color, b.alpha);
    }
    paintEmbers(glow, embers(burst.x, burst.y, BURST_REACH * burstRadius(age, burst.reduced), age, burst.reduced, 36, 11), color, b.alpha);
    burstShown = { element: burst.element, shape: BURST_SHAPE[burst.element], age, paths: b.paths.length };
  };
  bursts.set(scene, () => burstShown);
  for (const o of all) o.setVisible(false);
  const frame: SuperFrame = { dim: 0, bandAlpha: 0, slide: 0, zoom: 1 };
  let from = 0;
  let until = 0;
  let reduced = false;
  let side = 1;
  let px = 0;
  let py = 0;
  let bandY = BAND_HIGH_Y;
  let bandK = 1;
  let portraitOn = true;
  let bandInfo: SuperState['band'] | undefined;
  let tracked: { img: Phaser.GameObjects.Image; caster: boolean }[] = [];
  const scratch = { x: 0, y: 0, w: 0, h: 0 };
  let lastTick = -1;
  let sub = 0;
  let lifted: Phaser.GameObjects.Image | undefined;
  let running = false;

  /** Zooms the camera by `z` about (px, py) over the pan framing (arena-pan.ts; pinned it is viewport.ts `fitScene`). */
  const aim = (z: number): void => {
    applyCamera(scene, z, px, py);
  };
  /** Ends the cinematic; `live` is false when the scene is going away (Phaser then destroys the objects itself). */
  const stop = (live: boolean): void => {
    if (!running) return;
    running = false;
    scene.events.off('update', update);
    if (scene.registry.get('tte.band') === true) scene.registry.set('tte.band', false);
    // Releases the rings and numbers the shock layer held back while the band was up (shock-view.ts).
    scene.registry.set('tte.cut', false);
    if (live) {
      lifted?.setDepth(0);
      for (const o of all) o.setVisible(false);
      holdCamera(scene, false);
      aim(1);
    }
    lifted = undefined;
  };
  function update(_time: number, delta: number): void {
    const t = tick();
    if (t >= until) {
      stop(true);
      return;
    }
    // Driven by the view tick (so it holds while paused and steps with e2e), smoothed between ticks by frame time.
    if (t !== lastTick) sub = 0;
    else if (!paused()) sub = Math.min(TICK_MS - 1, sub + delta);
    lastTick = t;
    superFrame((t - from) * TICK_MS + sub, (until - from) * TICK_MS, reduced, frame);
    const dx = frame.slide * LOGICAL_WIDTH * side;
    // Screen-space layout in 1280x720 units, mapped onto the visible window (identity while the camera is pinned).
    const v = viewBox(scene, frame.zoom, px, py);
    const put = (o: Phaser.GameObjects.Components.Transform & { setAlpha(a: number): unknown }, sx: number, sy: number, a: number): void => {
      o.setPosition(v.x + sx * v.scale, v.y + sy * v.scale);
      o.setAlpha(a);
    };
    for (const o of [parts.dim, parts.band, parts.edges, parts.name, parts.sub]) o.setScale(v.scale);
    parts.glow.setScale(v.scale);
    parts.portrait.setDisplaySize(PORTRAIT_PX * bandK * v.scale, PORTRAIT_PX * bandK * v.scale);
    put(parts.dim, -WIDE_SIDE, 0, Math.min(1, frame.dim * DIM_GAIN));
    put(parts.band, dx - WIDE_SIDE, bandY, frame.bandAlpha * BAND_OPACITY);
    put(parts.edges, dx, bandY, frame.bandAlpha);
    put(parts.glow, dx + (side < 0 ? PORTRAIT_X : LOGICAL_WIDTH - PORTRAIT_X), bandY, frame.bandAlpha);
    put(parts.portrait, dx + (side < 0 ? PORTRAIT_X : LOGICAL_WIDTH - PORTRAIT_X), bandY, frame.bandAlpha);
    put(parts.name, dx + LOGICAL_WIDTH / 2, bandY - 26 * bandK, frame.bandAlpha);
    put(parts.sub, dx + LOGICAL_WIDTH / 2, bandY + 44 * bandK, frame.bandAlpha);
    aim(frame.zoom);
  }
  const drop = (): void => {
    stop(false);
    scene.events.off('postupdate', drawBurst);
    bursts.delete(scene);
    burstG?.destroy();
    burstG = undefined;
    burstGlow?.destroy();
    burstGlow = undefined;
    burst = undefined;
    runners.delete(scene);
    scene.events.off('shutdown', drop);
    scene.events.off('destroy', drop);
  };
  scene.events.once('shutdown', drop);
  scene.events.once('destroy', drop);

  return {
    start(caster, fromTick, untilTick, reducedMotion, superId): void {
      stop(true);
      from = fromTick;
      until = untilTick;
      reduced = reducedMotion;
      lastTick = -1;
      const img = caster.image;
      const b = drawnBox(img, { x: 0, y: 0, w: 0, h: 0 });
      // The drawn box in screen px (the pan moves the world under the 1280 screen the band is laid out in).
      const vb = viewBox(scene, 1);
      const sx0 = (b.x - vb.x) / vb.scale;
      const sx1 = (b.x + b.w - vb.x) / vb.scale;
      // Zoom about a point that keeps the whole caster on screen (the box centre alone pushes a caster at the edge out of it).
      px = vb.x + punchAnchor(sx0, sx1, 1 + PUNCH_ZOOM, LOGICAL_WIDTH, 40, 40) * vb.scale;
      py = b.y + b.h / 2;
      // The band slides in from the caster's half of the screen, with the portrait (as the caster faces) on that side.
      const casterSide = (sx0 + sx1) / 2 < LOGICAL_WIDTH / 2 ? -1 : 1;
      // The band row: clear of every fighter's reach over the whole cut (zoom about the caster, the caster's depth dip).
      const zPeak = reducedMotion ? 1 : 1 + PUNCH_ZOOM;
      const spy = (py - vb.y) / vb.scale;
      const spans: Span[] = [];
      tracked = [];
      const track = (im: Phaser.GameObjects.Image, isCaster: boolean): void => {
        const d = drawnBox(im, scratch);
        let top = (d.y - vb.y) / vb.scale;
        let bottom = (d.y + d.h - vb.y) / vb.scale;
        if (isCaster && !reducedMotion) {
          const h = bottom - top;
          top -= DOLLY_MAX * h;
          bottom += DROP_K * h;
        }
        spans.push(sweptSpan(top, bottom, spy, zPeak, isCaster ? CASTER_WEIGHT : 1));
        tracked.push({ img: im, caster: isCaster });
      };
      track(img, true);
      for (const o of scene.children.getAll('name', HERO_IMAGE_NAME)) {
        if (o === img || !isHeroImage(o) || !o.visible || o.alpha <= 0) continue;
        const d = drawnBox(o, scratch);
        const x0 = (d.x - vb.x) / vb.scale;
        if (x0 + d.w / vb.scale < -WIDE_SIDE || x0 > LOGICAL_WIDTH + WIDE_SIDE) continue;
        track(o, false);
      }
      const avoid = domAvoid(scene);
      const slot = superBandSlot(spans, avoid, casterSide);
      bandY = slot.y;
      bandK = slot.k;
      portraitOn = slot.side !== 0;
      side = slot.side === 0 ? casterSide : slot.side;
      const k = bandK;
      const ext = slot.ext;
      // Grim grade: the band is a dark, desaturated wash of the element colour (the element word below is the main cue).
      parts.band.setFillStyle(mute(ELEMENT_COLORS[caster.element], 0.45, 0.5)).setSize(SPAN, BAND_H * k);
      const tint = mute(ELEMENT_COLORS[caster.element], 0.95, 1.05);
      parts.name.setColor(`#${tint.toString(16).padStart(6, '0')}`);
      // A soft pool of the element colour behind the cut-out: stacked translucent discs from wide and faint to tight and bright.
      parts.glow.clear();
      const step = Math.min(9 * k, (ext + 8 - GLOW_R0 * k) / GLOW_RINGS);
      for (let i = 0; i < GLOW_RINGS; i++) parts.glow.fillStyle(tint, 0.05 + i * 0.012).fillCircle(0, 0, GLOW_R0 * k + (GLOW_RINGS - i) * step);
      parts.edges.clear();
      parts.edges.fillStyle(tint, 0.9).fillRect(-WIDE_SIDE, -ext, SPAN, 6).fillRect(-WIDE_SIDE, ext - 6, SPAN, 6);
      // Speed lines: thin streaks of the element colour at fixed (hash-spaced) heights and lengths, no randomness.
      for (let i = 0; i < LINES; i++) {
        const h = (i * 2654435761) >>> 0;
        const y = (-BAND_H * k) / 2 + 8 + (h % Math.max(1, Math.round(BAND_H * k) - 16));
        const len = 160 + ((h >>> 8) % 340);
        const x = ((h >>> 16) % (LOGICAL_WIDTH - len));
        parts.edges.fillStyle(tint, 0.22).fillRect(x, y, len, 2);
      }
      parts.portrait.setTexture(img.texture.key, img.frame.name).setDisplaySize(PORTRAIT_PX * k, PORTRAIT_PX * k).setFlipX(img.flipX);
      const safe = Math.min(NAME_SAFE_W, 2 * nameHalfWidth(bandY, ext, avoid));
      const namePx = Math.round(NAME_PX * k);
      parts.name.setFontSize(namePx).setText(superName(superId));
      parts.name.setFontSize(fitTitlePx(namePx, parts.name.width, safe));
      // The element as a word too: the band colour is not the only cue.
      const subPx = Math.round(SUB_PX * k);
      parts.sub.setFontSize(subPx).setText(caster.element.toUpperCase());
      parts.sub.setFontSize(fitTitlePx(subPx, parts.sub.width, safe));
      const cs = spans[0];
      const crosses = cs !== undefined && slot.y + ext > cs.top && slot.y - ext < cs.bottom;
      bandInfo = {
        ...slot,
        portrait: portraitOn ? portraitRect(side, bandY, k) : null,
        name: { x0: LOGICAL_WIDTH / 2 - parts.name.width / 2, y0: bandY - 26 * k - parts.name.height / 2, x1: LOGICAL_WIDTH / 2 + parts.name.width / 2, y1: bandY - 26 * k + parts.name.height / 2 },
        avoid,
        spans,
      };
      scene.events.off('postupdate', drawBurst);
      burst = { element: caster.element, x: px, y: py, from: fromTick, reduced: reducedMotion };
      scene.events.on('postupdate', drawBurst);
      for (const o of all) o.setVisible(true);
      if (!portraitOn) {
        parts.portrait.setVisible(false);
        parts.glow.setVisible(false);
      }
      scene.registry.set('tte.band', bandHidesWeather(bandY, bandK));
      scene.registry.set('tte.cut', true);
      // Over the band, rules and glow (under the text) when the band must cross the caster; else just over the dim.
      lifted = img.setDepth(crosses ? DIM_DEPTH + 2.9 : DIM_DEPTH + 1);
      running = true;
      holdCamera(scene, true);
      scene.events.on('update', update);
      update(0, 0);
    },
    state() {
      if (!running || !bandInfo) return undefined;
      const v = viewBox(scene, frame.zoom, px, py);
      const r1 = (n: number): number => Math.round(n * 10) / 10;
      const fighters = tracked.map(({ img, caster }) => {
        const d = drawnBox(img, { x: 0, y: 0, w: 0, h: 0 });
        return { x0: r1((d.x - v.x) / v.scale), x1: r1((d.x + d.w - v.x) / v.scale), top: r1((d.y - v.y) / v.scale), bottom: r1((d.y + d.h - v.y) / v.scale), caster };
      });
      return { ...frame, name: parts.name.text, sub: parts.sub.text, camZoom: scene.cameras.main.zoom / res(), band: bandInfo, fighters };
    },
  };
}
