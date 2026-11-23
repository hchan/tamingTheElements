import type Phaser from 'phaser';
import { TICK_MS } from './super-cinematic';
import { CUTIN_MS, CUTIN_SLIDE, cutinFrame, cutinKey, cutinUrl } from './cutin-gate';

/**
 * Phaser side of the roster24 super cut-in composite (cutin-gate.ts has the rules). Loaded on the first cut-in; the texture is
 * fetched on first use per hero (nothing is preloaded). One image per scene, reused, covering the visible window for CUTIN_MS
 * on the view tick (so it holds under manual stepping, like the super band). Dropped with the scene.
 */
const DEPTH = 20;
type Go = (hero: string, from: number, reduced: boolean, side: -1 | 1) => void;
const runners = new WeakMap<Phaser.Scene, Go>();

export function showCutin(scene: Phaser.Scene, hero: string, from: number, reduced: boolean, side: -1 | 1, tick: () => number, paused: () => boolean, base: string): void {
  let run = runners.get(scene);
  if (!run) {
    let img: Phaser.GameObjects.Image | undefined;
    const frame = { alpha: 0, dx: 0 };
    let t0 = 0;
    let lastTick = -1;
    let sub = 0;
    let rd = false;
    let sd: -1 | 1 = 1;
    const stop = (): void => {
      scene.events.off('update', update);
      img?.setVisible(false);
    };
    function update(_time: number, delta: number): void {
      const t = tick();
      if (t !== lastTick) sub = 0;
      else if (!paused()) sub = Math.min(TICK_MS - 1, sub + delta);
      lastTick = t;
      const ms = (t - t0) * TICK_MS + sub;
      if (!img || ms >= CUTIN_MS) {
        stop();
        return;
      }
      cutinFrame(ms, rd, sd, frame);
      const w = scene.cameras.main.worldView;
      // Cover the visible window (zoom-independent: the super punch-in may be running), CUTIN_SLIDE logical px wider per side so the slide shows no edge.
      const k = w.width / 1280;
      const cover = Math.max((1280 + 2 * CUTIN_SLIDE) / img.width, w.height / k / img.height) * k;
      img.setScale(cover).setPosition(w.x + w.width / 2 + frame.dx * k, w.y + w.height / 2).setAlpha(frame.alpha);
    }
    const go: Go = (h, f, r, s) => {
      const key = cutinKey(h);
      const begin = (): void => {
        t0 = f;
        rd = r;
        sd = s;
        lastTick = -1;
        if (tick() - f >= CUTIN_MS / TICK_MS) return; // the first load came too late to show
        img ??= scene.add.image(0, 0, key).setDepth(DEPTH);
        img.setTexture(key).setVisible(true).setAlpha(0);
        scene.events.off('update', update);
        scene.events.on('update', update);
        update(0, 0);
      };
      if (scene.textures.exists(key)) {
        begin();
        return;
      }
      scene.load.once(`filecomplete-image-${key}`, begin);
      scene.load.image(key, cutinUrl(base, h));
      if (!scene.load.isLoading()) scene.load.start();
    };
    const drop = (): void => {
      scene.events.off('update', update);
      runners.delete(scene);
      scene.events.off('shutdown', drop);
      scene.events.off('destroy', drop);
    };
    scene.events.once('shutdown', drop);
    scene.events.once('destroy', drop);
    run = go;
    runners.set(scene, run);
  }
  run(hero, from, reduced, side);
}
