import type Phaser from 'phaser';
import { SUPER_NAMES, type Element } from '@core/index';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../boot/viewport';
import { drawnBox } from '../views/hero-scale';
import { applyCamera, holdCamera, viewBox } from './arena-pan';
import { ELEMENT_COLORS } from './element-colors';
import { TICK_MS, superFrame, type SuperFrame } from './super-cinematic';
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
/**
 * Band centre: under the fighters (clear of the HUD and the action bar) unless the caster reaches that strip, then high,
 * under the meters. Either way the caster stays in view.
 */
const BAND_HIGH_Y = 200;
const BAND_LOW_Y = 520;
const BAND_H = 160;
/** See-through, so a foe standing behind the band stays visible (qa-r3-super-cinematic-hides-action). */
const BAND_OPACITY = 0.5;
/** 72 and 52 logical px stay about 17 and 12 CSS px on the 390x844 phone's letterboxed canvas (about 304 px wide). */
const NAME_PX = 72;
const SUB_PX = 52;
const PORTRAIT_PX = 140;
const PORTRAIT_X = 120;
/** Over the characters (0), under the caster (lifted to DIM_DEPTH + 1), the band and the hit sparks (10). */
const DIM_DEPTH = 5;
/** The element burst: over the dim, under the lifted caster. */
const BURST_DEPTH = DIM_DEPTH + 0.5;

/** The caster's pooled character view (`FxTarget` in event-fx.ts): portrait texture and frame, lifted over the dim. */
export interface SuperCaster {
  readonly image: Phaser.GameObjects.Image;
  readonly element: Element;
}

/** Read-out for the test probe: the frame, the texts shown and the camera zoom over the fit zoom. */
export type SuperState = SuperFrame & { readonly name: string; readonly sub: string; readonly camZoom: number };

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
  const res = (): number => scene.scale.width / LOGICAL_WIDTH;
  const text = (size: number): Phaser.GameObjects.Text =>
    scene.add
      .text(0, 0, '', { fontSize: `${String(size)}px`, fontStyle: 'bold', color: '#d8d2c4', stroke: '#0a0806', strokeThickness: 8, resolution: res() })
      .setOrigin(0.5)
      .setDepth(DIM_DEPTH + 3);
  const parts = {
    dim: scene.add.rectangle(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, 0).setOrigin(0).setDepth(DIM_DEPTH),
    band: scene.add.rectangle(0, 0, LOGICAL_WIDTH, BAND_H, 0).setOrigin(0, 0.5).setDepth(DIM_DEPTH + 2),
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
    for (const o of [parts.dim, parts.band, parts.name, parts.sub]) o.setScale(v.scale);
    parts.portrait.setDisplaySize(PORTRAIT_PX * v.scale, PORTRAIT_PX * v.scale);
    put(parts.dim, 0, 0, frame.dim);
    put(parts.band, dx, bandY, frame.bandAlpha * BAND_OPACITY);
    put(parts.portrait, dx + (side < 0 ? PORTRAIT_X : LOGICAL_WIDTH - PORTRAIT_X), bandY, frame.bandAlpha);
    put(parts.name, dx + LOGICAL_WIDTH / 2, bandY - 26, frame.bandAlpha);
    put(parts.sub, dx + LOGICAL_WIDTH / 2, bandY + 44, frame.bandAlpha);
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
      px = b.x + b.w / 2;
      py = b.y + b.h / 2;
      // The band slides in from the caster's half of the arena, with the portrait (as the caster faces) on that side.
      side = px < LOGICAL_WIDTH / 2 ? -1 : 1;
      bandY = b.y + b.h <= BAND_LOW_Y - BAND_H / 2 ? BAND_LOW_Y : BAND_HIGH_Y;
      // Grim grade: the band is a dark, desaturated wash of the element colour (the element word below is the main cue).
      parts.band.setFillStyle(mute(ELEMENT_COLORS[caster.element], 0.45, 0.5));
      parts.portrait.setTexture(img.texture.key, img.frame.name).setDisplaySize(PORTRAIT_PX, PORTRAIT_PX).setFlipX(img.flipX);
      parts.name.setText(superName(superId));
      // The element as a word too: the band colour is not the only cue.
      parts.sub.setText(caster.element.toUpperCase());
      scene.events.off('postupdate', drawBurst);
      burst = { element: caster.element, x: px, y: py, from: fromTick, reduced: reducedMotion };
      scene.events.on('postupdate', drawBurst);
      for (const o of all) o.setVisible(true);
      scene.registry.set('tte.band', bandY === BAND_HIGH_Y);
      lifted = img.setDepth(DIM_DEPTH + 1);
      running = true;
      holdCamera(scene, true);
      scene.events.on('update', update);
      update(0, 0);
    },
    state() {
      if (!running) return undefined;
      return { ...frame, name: parts.name.text, sub: parts.sub.text, camZoom: scene.cameras.main.zoom / res() };
    },
  };
}
