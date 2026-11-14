import type Phaser from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../boot/viewport';
import { KO_WASH_MS, RING_POOL, SUPER_FLASH_MS, SUPER_NUMBER_COLOR, SUPER_NUMBER_POOL, koWashStrength, ringFrame, superFlashAlpha, superNumberFrame, superNumberSize } from './hit-feel';

/**
 * Renderer-only KO desaturation wash (a camera colour-matrix filter) and hit shockwave rings (one pooled Graphics: a pale
 * halo, a warm core and a bright element line). Both run on one scene update listener that exists only while something
 * plays; paused holds them. Callers skip both under reduced motion.
 */

interface ColorMatrixFilter {
  active: boolean;
  colorMatrix: { reset(): unknown; saturate(value: number, multiply?: boolean): unknown };
}

export interface ShockLayer {
  /** Starts the KO wash. */
  wash(): void;
  /** Plays a ring at (x, y) in `color`; `weight` 2 heavy, 3 super, 4 KO. */
  ring(x: number, y: number, color: number, weight: number): void;
  /** Super hit: a gold number at (x, y) sized by `fraction` of the victim's life, and (when `flash`) one pale screen pulse. Reduced motion: still number, no pulse. */
  superHit(x: number, y: number, amount: number, fraction: number, flash: boolean, reduced: boolean): void;
  seek(ms: number): void;
  state(): ShockState;
}

export function createShockLayer(scene: Phaser.Scene, paused: () => boolean): ShockLayer {
  interface Ring {
    x: number;
    y: number;
    color: number;
    weight: number;
    age: number;
  }
  const rings: Ring[] = [];
  interface Num {
    text: Phaser.GameObjects.Text;
    x: number;
    y: number;
    size: number;
    age: number;
    reduced: boolean;
    live: boolean;
  }
  const nums: Num[] = [];
  /** Rings and super numbers that landed while the super cut-in ('tte.cut') was up: shown the moment it clears, so the band never hides the first impact. */
  const held: (() => void)[] = [];
  const cutUp = (): boolean => scene.registry.get('tte.cut') === true;
  let nextNum = 0;
  let flashRect: Phaser.GameObjects.Rectangle | undefined;
  let flashAge = -1;
  let washAge = -1;
  let filter: ColorMatrixFilter | undefined;
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
    rings.length = 0;
    nums.length = 0;
    held.length = 0;
    flashRect = undefined;
    flashAge = -1;
    washAge = -1;
    filter = undefined;
    gfx = undefined;
    detach();
  };
  function tick(_time: number, delta: number): void {
    if (!paused()) step(delta);
  }
  function step(delta: number): void {
    if (held.length > 0 && !cutUp()) for (const f of held.splice(0)) f();
    if (washAge >= 0 && filter) {
      washAge += delta;
      const s = washAge >= KO_WASH_MS ? 0 : koWashStrength(washAge, false);
      if (s <= 0) {
        washAge = -1;
        filter.active = false;
      } else {
        filter.colorMatrix.reset();
        filter.colorMatrix.saturate(-s);
      }
    }
    if (gfx) {
      gfx.clear();
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        if (!r) continue;
        r.age += delta;
        const f = ringFrame(r.age, r.weight);
        if (!f) {
          rings.splice(i, 1);
          continue;
        }
        gfx.lineStyle(f.width * 3, r.color, f.alpha * 0.3).strokeCircle(r.x, r.y, f.radius);
        gfx.lineStyle(f.width * 1.4, 0xfff4dc, f.alpha * 0.45).strokeCircle(r.x, r.y, f.radius);
        gfx.lineStyle(Math.max(1, f.width * 0.7), r.color, f.alpha).strokeCircle(r.x, r.y, f.radius);
      }
    }
    if (flashAge >= 0) {
      flashAge += delta;
      const a = superFlashAlpha(flashAge);
      flashRect?.setAlpha(a).setVisible(a > 0);
      if (a <= 0) flashAge = -1;
    }
    let numsLive = false;
    for (const n of nums) {
      if (!n.live) continue;
      n.age += delta;
      const f = superNumberFrame(n.age, n.reduced);
      if (!f) {
        n.live = false;
        n.text.setVisible(false);
        continue;
      }
      numsLive = true;
      n.text.setPosition(n.x, n.y - f.rise).setScale(f.scale).setAlpha(f.alpha);
    }
    if (washAge < 0 && rings.length === 0 && flashAge < 0 && !numsLive && held.length === 0) detach();
  }
  const attach = (): void => {
    if (attached) return;
    attached = true;
    scene.events.on('update', tick);
    scene.events.once('shutdown', drop);
    scene.events.once('destroy', drop);
  };
  const layer: ShockLayer = {
    wash(): void {
      filter ??= scene.cameras.main.filters.external.addColorMatrix() as unknown as ColorMatrixFilter;
      filter.active = true;
      washAge = 0;
      attach();
    },
    ring(x, y, color, weight): void {
      if (cutUp()) {
        held.push(() => { layer.ring(x, y, color, weight); });
        attach();
        return;
      }
      gfx ??= scene.add.graphics().setDepth(11);
      if (rings.length >= RING_POOL) rings.shift();
      rings.push({ x, y, color, weight, age: 0 });
      attach();
    },
    superHit(x, y, amount, fraction, flash, reduced): void {
      if (cutUp()) {
        held.push(() => { layer.superHit(x, y, amount, fraction, flash, reduced); });
        attach();
        return;
      }
      if (flash && !reduced) {
        flashRect ??= scene.add.rectangle(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, 8000, 8000, 0xfff0d0).setScrollFactor(0).setDepth(12);
        flashRect.setAlpha(superFlashAlpha(0)).setVisible(true);
        flashAge = 0;
      }
      let n = nums[nextNum];
      if (!n && nums.length < SUPER_NUMBER_POOL) {
        const text = scene.add
          .text(0, 0, '', { fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'bold', color: SUPER_NUMBER_COLOR, stroke: '#0a0806', strokeThickness: 8, resolution: scene.scale.width / LOGICAL_WIDTH })
          .setOrigin(0.5)
          .setDepth(13);
        n = { text, x: 0, y: 0, size: 0, age: 0, reduced, live: false };
        nums.push(n);
      }
      n ??= nums[nextNum % Math.max(1, nums.length)];
      nextNum = (nextNum + 1) % SUPER_NUMBER_POOL;
      if (!n) return;
      n.size = superNumberSize(fraction);
      n.x = x;
      n.y = y;
      n.age = 0;
      n.reduced = reduced;
      n.live = true;
      n.text.setText(String(Math.round(amount))).setFontSize(n.size).setVisible(true);
      attach();
      step(0);
    },
    seek(ms): void {
      if (washAge >= 0) washAge = ms;
      if (flashAge >= 0) flashAge = Math.min(ms, SUPER_FLASH_MS - 1);
      for (const n of nums) if (n.live) n.age = ms;
      for (const r of rings) r.age = ms;
      step(0);
    },
    state(): ShockState {
      return { washAge, wash: washAge >= 0 ? koWashStrength(washAge, false) : 0, rings: rings.length, superNumbers: nums.filter((n) => n.live).length, held: held.length, superNumberSize: nums.find((n) => n.live)?.size ?? 0 };
    },
  };
  layers.set(scene, layer);
  return layer;
}

/** Test probe: the running wash and rings of `scene`. */
export interface ShockState {
  readonly washAge: number;
  /** Desaturation now, 0..KO_WASH_PEAK. */
  readonly wash: number;
  readonly rings: number;
  /** Gold super numbers in flight and the font size of the first. */
  readonly superNumbers: number;
  /** Rings and numbers waiting for the super cut-in to clear. */
  readonly held: number;
  readonly superNumberSize: number;
}

const layers = new WeakMap<Phaser.Scene, ShockLayer>();

/** Test probe: the shock layer's state, or undefined before any KO or heavy hit. */
export function shockState(scene: Phaser.Scene): ShockState | undefined {
  return layers.get(scene)?.state();
}

/** Test probe: jumps a running wash and its rings to `ms` in and draws that frame (the sim may stay paused). */
export function shockSeek(scene: Phaser.Scene, ms: number): void {
  layers.get(scene)?.seek(ms);
}
