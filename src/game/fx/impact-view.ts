import type Phaser from 'phaser';
import type { Element } from '@core/index';

/**
 * Element hit impacts: a 12-frame painted strip (128 px frames, tools/assets/fx-gen/batch-i-loops-impacts.py) played once at the
 * victim on a hit. View-only and cosmetic; pooled images, advanced by one scene update listener that only exists while any play.
 */
export const IMPACT_FRAME = 128;
export const IMPACT_MS = 360;
export const IMPACT_POOL = 12;
/** Drawn size of a frame in logical px (the art leaves a margin, so this reads about as wide as a character). */
export const IMPACT_SIZE = 72;
/** Peak opacity of an impact: translucent so the victim's torso stays readable under the burst (QA r117 item 5). */
export const IMPACT_ALPHA = 0.8;

/** Opacity of an impact `age` ms in: the peak, easing to 0 over the last half so the mark does not sit on the body. */
export function impactAlphaAt(age: number, ms = IMPACT_MS): number {
  if (age < 0 || age >= ms) return 0;
  const t = age / ms;
  return IMPACT_ALPHA * (t < 0.5 ? 1 : 2 * (1 - t));
}

const KEY: Readonly<Record<Element, string>> = {
  fire: 'sprite:impactFire',
  air: 'sprite:impactAir',
  earth: 'sprite:impactEarth',
  water: 'sprite:impactWater',
  void: 'sprite:impactVoid',
};

/** Frame index (0-based) of an impact `age` ms in, or -1 once it has finished. */
export function impactFrameAt(age: number, frames: number, ms = IMPACT_MS): number {
  if (age < 0 || age >= ms) return -1;
  return Math.min(frames - 1, Math.floor((age / ms) * frames));
}

export interface ImpactLayer {
  spawn(x: number, y: number, element: Element): void;
}

export function createImpactLayer(scene: Phaser.Scene, paused: () => boolean): ImpactLayer {
  interface Slot {
    image: Phaser.GameObjects.Image;
    age: number;
    frames: number;
    key: string;
  }
  const slots: Slot[] = [];
  let live = 0;
  let attached = false;
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    scene.events.off('update', tick);
    scene.events.off('shutdown', drop);
    scene.events.off('destroy', drop);
  };
  const drop = (): void => {
    slots.length = 0;
    live = 0;
    detach();
  };
  function tick(_time: number, delta: number): void {
    if (paused()) return;
    for (let i = live - 1; i >= 0; i--) {
      const s = slots[i];
      if (!s) continue;
      s.age += delta;
      const f = impactFrameAt(s.age, s.frames);
      if (f < 0) {
        s.image.setVisible(false);
        live--;
        slots[i] = slots[live] ?? s;
        slots[live] = s;
        continue;
      }
      s.image.setFrame(`i${String(f)}`).setAlpha(impactAlphaAt(s.age));
    }
    if (live === 0) detach();
  }
  return {
    spawn(x, y, element): void {
      if (live >= IMPACT_POOL) return;
      const key = KEY[element];
      if (!scene.textures.exists(key)) return;
      const tex = scene.textures.get(key);
      const src = tex.getSourceImage();
      const frames = Math.max(1, Math.floor(src.width / IMPACT_FRAME));
      for (let i = 0; i < frames; i++) if (!tex.has(`i${String(i)}`)) tex.add(`i${String(i)}`, 0, i * IMPACT_FRAME, 0, IMPACT_FRAME, IMPACT_FRAME);
      let s = slots[live];
      if (!s) {
        s = { image: scene.add.image(0, 0, key, 'i0').setDepth(11), age: 0, frames, key };
        slots.push(s);
      }
      s.image.setTexture(key, 'i0').setPosition(x, y).setDisplaySize(IMPACT_SIZE, IMPACT_SIZE).setVisible(true).setAlpha(IMPACT_ALPHA);
      s.age = 0;
      s.frames = frames;
      s.key = key;
      live++;
      if (!attached) {
        attached = true;
        scene.events.on('update', tick);
        scene.events.once('shutdown', drop);
        scene.events.once('destroy', drop);
      }
    },
  };
}
