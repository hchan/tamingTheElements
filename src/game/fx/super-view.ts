import type Phaser from 'phaser';
import { SUPER_NAMES, type Element } from '@core/index';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../boot/viewport';
import { ELEMENT_COLORS } from './element-colors';
import { TICK_MS, superFrame, type SuperFrame } from './super-cinematic';

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
/** 72 and 52 logical px stay about 17 and 12 CSS px on the 390x844 phone's letterboxed canvas (about 304 px wide). */
const NAME_PX = 72;
const SUB_PX = 52;
const PORTRAIT_PX = 140;
const PORTRAIT_X = 120;
/** Over the characters (0), under the caster (lifted to DIM_DEPTH + 1), the band and the hit sparks (10). */
const DIM_DEPTH = 5;

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
      .text(0, 0, '', { fontSize: `${String(size)}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 8, resolution: res() })
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

  /** Zooms the camera by `z` about (px, py), which keeps its place on screen; z = 1 is viewport.ts `fitScene`. */
  const aim = (z: number): void => {
    scene.cameras.main.setZoom(res() * z).centerOn(px + (LOGICAL_WIDTH / 2 - px) / z, py + (LOGICAL_HEIGHT / 2 - py) / z);
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
    parts.dim.setAlpha(frame.dim);
    parts.band.setPosition(dx, bandY).setAlpha(frame.bandAlpha * 0.9);
    parts.portrait.setPosition(dx + (side < 0 ? PORTRAIT_X : LOGICAL_WIDTH - PORTRAIT_X), bandY).setAlpha(frame.bandAlpha);
    parts.name.setPosition(dx + LOGICAL_WIDTH / 2, bandY - 26).setAlpha(frame.bandAlpha);
    parts.sub.setPosition(dx + LOGICAL_WIDTH / 2, bandY + 44).setAlpha(frame.bandAlpha);
    aim(frame.zoom);
  }
  const drop = (): void => {
    stop(false);
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
      px = img.x + img.displayWidth / 2;
      py = img.y + img.displayHeight / 2;
      // The band slides in from the caster's half of the arena, with the portrait (as the caster faces) on that side.
      side = px < LOGICAL_WIDTH / 2 ? -1 : 1;
      bandY = img.y + img.displayHeight <= BAND_LOW_Y - BAND_H / 2 ? BAND_LOW_Y : BAND_HIGH_Y;
      parts.band.setFillStyle(ELEMENT_COLORS[caster.element]);
      parts.portrait.setTexture(img.texture.key, img.frame.name).setDisplaySize(PORTRAIT_PX, PORTRAIT_PX).setFlipX(img.flipX);
      parts.name.setText(superName(superId));
      // The element as a word too: the band colour is not the only cue.
      parts.sub.setText(caster.element.toUpperCase());
      for (const o of all) o.setVisible(true);
      scene.registry.set('tte.band', bandY === BAND_HIGH_Y);
      lifted = img.setDepth(DIM_DEPTH + 1);
      running = true;
      scene.events.on('update', update);
      update(0, 0);
    },
    state() {
      if (!running) return undefined;
      return { ...frame, name: parts.name.text, sub: parts.sub.text, camZoom: scene.cameras.main.zoom / res() };
    },
  };
}
