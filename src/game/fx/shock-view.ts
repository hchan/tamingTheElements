import type Phaser from 'phaser';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, resolutionOf } from '../boot/viewport';
import { POP_RECTS_KEY } from '../hud/arcade-hud';
import type { ChromaticSplit } from './chromatic-filter-impl';
import { KO_SPLIT_MS, KO_WASH_MS, POP_MS, POP_POOL, RING_POOL, popMerges, SUPER_FLASH_MS, SUPER_NUMBER_COLOR, SUPER_NUMBER_POOL, koSplitAmount, koWashStrength, popFrame, ringFrame, superFlashAlpha, superNumberFrame, superNumberSize } from './hit-feel';

/** A gold number landing within this many ms and px of a live one merges into it (one number per spot, r19). */
const SUPER_NUMBER_MERGE_MS = 600;
const SUPER_NUMBER_MERGE_PX = 140;

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
  /** Plain-hit damage pop: `amount` punched in large at (x, y) at `size` px, settling and fading in a quarter second (reduced motion: callers skip it). */
  pop(x: number, y: number, amount: number, size: number): void;
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
    amount: number;
    fraction: number;
    age: number;
    reduced: boolean;
    live: boolean;
  }
  const nums: Num[] = [];
  interface Pop {
    text: Phaser.GameObjects.Text;
    x: number;
    y: number;
    amount: number;
    size: number;
    age: number;
    live: boolean;
  }
  const pops: Pop[] = [];
  let nextPop = 0;
  /** Rings and super numbers that landed while the super cut-in ('tte.cut') was up: shown the moment it clears, so the band never hides the first impact. */
  const held: (() => void)[] = [];
  const cutUp = (): boolean => scene.registry.get('tte.cut') === true;
  let nextNum = 0;
  let flashRect: Phaser.GameObjects.Rectangle | undefined;
  let flashAge = -1;
  let washAge = -1;
  let filter: ColorMatrixFilter | undefined;
  let split: ChromaticSplit | undefined;
  let splitAge = -1;
  let gfx: Phaser.GameObjects.Graphics | undefined;
  let attached = false;

  /** Publishes every visible pop and gold number as a WORLD rect (one reused array), so the HUD's grey numbers move clear of them. */
  let popRects: { x: number; y: number; w: number; h: number }[] | undefined;
  const publish = (): void => {
    const registry = (scene as { registry?: Phaser.Data.DataManager }).registry;
    if (!registry) return;
    if (!popRects) registry.set(POP_RECTS_KEY, (popRects = []));
    let k = 0;
    const add = (t: Phaser.GameObjects.Text): void => {
      if (!t.visible || t.alpha <= 0.05) return;
      const r = (popRects ??= [])[k] ?? { x: 0, y: 0, w: 0, h: 0 };
      popRects[k++] = r;
      r.x = t.x - t.displayWidth * t.originX;
      r.y = t.y - t.displayHeight * t.originY;
      r.w = t.displayWidth;
      r.h = t.displayHeight;
    };
    for (const p of pops) if (p.live) add(p.text);
    for (const n of nums) if (n.live) add(n.text);
    popRects.length = k;
  };
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    scene.events.off('update', tick);
    scene.events.off('shutdown', shutdown);
    scene.events.off('destroy', shutdown);
  };
  const drop = (): void => {
    rings.length = 0;
    nums.length = 0;
    pops.length = 0;
    held.length = 0;
    flashRect = undefined;
    flashAge = -1;
    washAge = -1;
    splitAge = -1;
    filter = undefined;
    split = undefined;
    gfx = undefined;
    if (popRects) popRects.length = 0;
    detach();
  };
  const shutdown = (): void => {
    drop();
    if (popRects) scene.registry.remove(POP_RECTS_KEY);
    popRects = undefined;
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
    if (splitAge >= 0 && split) {
      splitAge += delta;
      const a = splitAge >= KO_SPLIT_MS ? 0 : koSplitAmount(splitAge, false);
      split.amount = a;
      if (a <= 0) {
        splitAge = -1;
        split.active = false;
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
        gfx.lineStyle(f.width * 1.4, 0xe8dcc4, f.alpha * 0.45).strokeCircle(r.x, r.y, f.radius);
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
    for (const p of pops) {
      if (!p.live) continue;
      p.age += delta;
      const f = popFrame(p.age);
      if (!f) {
        p.live = false;
        p.text.setVisible(false);
        continue;
      }
      numsLive = true;
      p.text.setPosition(p.x, p.y - 14 * Math.min(1, p.age / 120) - 26 * (p.age / POP_MS)).setScale(f.scale).setAlpha(f.alpha);
    }
    publish();
    if (washAge < 0 && splitAge < 0 && rings.length === 0 && flashAge < 0 && !numsLive && held.length === 0) detach();
  }
  const attach = (): void => {
    if (attached) return;
    attached = true;
    scene.events.on('update', tick);
    scene.events.once('shutdown', shutdown);
    scene.events.once('destroy', shutdown);
  };
  const layer: ShockLayer = {
    wash(): void {
      filter ??= scene.cameras.main.filters.external.addColorMatrix() as unknown as ColorMatrixFilter;
      filter.active = true;
      washAge = 0;
      const startSplit = (): void => {
        if (split) {
          split.active = true;
          splitAge = 0;
          attach();
        }
      };
      if (split) startSplit();
      else {
        // Lazy: the filter module pulls in Phaser itself, which unit tests must not evaluate.
        void import('./chromatic-filter-impl').then((m) => {
          if (washAge < 0 || !attached) return;
          split ??= m.addChromaticSplit(scene);
          startSplit();
        }, () => undefined);
      }
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
      // One number per spot (r19): a multi-hit super or a KO landing on top of a young number merges into it (amounts add) instead of stacking a ghost.
      const young = nums.find((m) => m.live && m.age < SUPER_NUMBER_MERGE_MS && Math.abs(m.x - x) < SUPER_NUMBER_MERGE_PX && Math.abs(m.y - y) < SUPER_NUMBER_MERGE_PX);
      if (young) {
        young.amount += amount;
        young.fraction += fraction;
        young.size = superNumberSize(young.fraction);
        young.text.setText(String(Math.round(young.amount))).setFontSize(young.size);
        publish();
        return;
      }
      let n = nums[nextNum];
      if (!n && nums.length < SUPER_NUMBER_POOL) {
        const text = scene.add
          .text(0, 0, '', { fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'bold', color: SUPER_NUMBER_COLOR, stroke: '#0a0806', strokeThickness: 8, resolution: resolutionOf(scene) })
          .setOrigin(0.5)
          .setDepth(13);
        n = { text, x: 0, y: 0, size: 0, amount: 0, fraction: 0, age: 0, reduced, live: false };
        nums.push(n);
      }
      n ??= nums[nextNum % Math.max(1, nums.length)];
      nextNum = (nextNum + 1) % SUPER_NUMBER_POOL;
      if (!n) return;
      n.amount = amount;
      n.fraction = fraction;
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
    pop(x, y, amount, size): void {
      // A second hit on the same spot a beat later grows the one number instead of printing over it (QA r39).
      const young = pops.find((m) => m.live && popMerges(m.age, m.x - x, m.y - y));
      if (young) {
        young.amount += amount;
        young.size = Math.min(76, Math.max(young.size, size) + 4);
        young.age = Math.min(young.age, 40);
        young.text.setText(String(Math.max(1, Math.round(young.amount)))).setFontSize(young.size);
        step(0);
        return;
      }
      let p = pops[nextPop];
      if (!p && pops.length < POP_POOL) {
        const text = scene.add
          .text(0, 0, '', { fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: 'bold', color: '#ffffff', stroke: '#0a0806', strokeThickness: 7, resolution: resolutionOf(scene) })
          .setOrigin(0.5)
          .setDepth(13);
        p = { text, x: 0, y: 0, amount: 0, size: 0, age: 0, live: false };
        pops.push(p);
      }
      p ??= pops[nextPop % Math.max(1, pops.length)];
      nextPop = (nextPop + 1) % POP_POOL;
      if (!p) return;
      p.x = x;
      p.y = y;
      p.amount = amount;
      p.size = size;
      p.age = 0;
      p.live = true;
      p.text.setText(String(Math.max(1, Math.round(amount)))).setFontSize(size).setVisible(true);
      attach();
      step(0);
    },
    seek(ms): void {
      if (washAge >= 0) washAge = ms;
      if (splitAge >= 0) splitAge = ms;
      if (flashAge >= 0) flashAge = Math.min(ms, SUPER_FLASH_MS - 1);
      for (const n of nums) if (n.live) n.age = ms;
      for (const p of pops) if (p.live) p.age = ms;
      for (const r of rings) r.age = ms;
      step(0);
    },
    state(): ShockState {
      return { washAge, split: split?.amount ?? 0, wash: washAge >= 0 ? koWashStrength(washAge, false) : 0, rings: rings.length, superNumbers: nums.filter((n) => n.live).length, pops: pops.filter((p) => p.live).length, held: held.length, superNumberSize: nums.find((n) => n.live)?.size ?? 0, superNumberTexts: nums.filter((n) => n.live).map((n) => n.text.text) };
    },
  };
  layers.set(scene, layer);
  return layer;
}

/** Test probe: the running wash and rings of `scene`. */
export interface ShockState {
  readonly washAge: number;
  /** Chromatic split offset now, 0..KO_SPLIT_PEAK. */
  readonly split: number;
  /** Desaturation now, 0..KO_WASH_PEAK. */
  readonly wash: number;
  readonly rings: number;
  /** Gold super numbers in flight and the font size of the first. */
  readonly superNumbers: number;
  /** Plain-hit damage pops in flight. */
  readonly pops: number;
  /** Rings and numbers waiting for the super cut-in to clear. */
  readonly held: number;
  readonly superNumberSize: number;
  /** The text of each live gold number (one per hit; the r19 ghost was two stacked at one spot). */
  readonly superNumberTexts: readonly string[];
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
