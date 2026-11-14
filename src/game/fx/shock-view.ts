import type Phaser from 'phaser';
import { KO_WASH_MS, RING_POOL, koWashStrength, ringFrame } from './hit-feel';

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
    washAge = -1;
    filter = undefined;
    gfx = undefined;
    detach();
  };
  function tick(_time: number, delta: number): void {
    if (!paused()) step(delta);
  }
  function step(delta: number): void {
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
    if (washAge < 0 && rings.length === 0) detach();
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
      gfx ??= scene.add.graphics().setDepth(11);
      if (rings.length >= RING_POOL) rings.shift();
      rings.push({ x, y, color, weight, age: 0 });
      attach();
    },
    seek(ms): void {
      if (washAge >= 0) washAge = ms;
      for (const r of rings) r.age = ms;
      step(0);
    },
    state(): ShockState {
      return { washAge, wash: washAge >= 0 ? koWashStrength(washAge, false) : 0, rings: rings.length };
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
