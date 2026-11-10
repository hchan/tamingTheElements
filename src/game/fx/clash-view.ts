import type Phaser from 'phaser';
import type { RenderView, SimEvent } from '@core/index';
import { BURST_TICKS, ClashFx, burstAlpha, burstRadius } from './clash-fx';

/**
 * Phaser side of the Arcade clash burst (WP-arcade-clash): the defence view (`defence-view.ts`, itself mounted by the
 * round view in every Arcade match) mounts it and hands it each tick's events; it is its own chunk `clash-view`
 * (vite.config.ts), so Classic never downloads it. One Graphics, made on the first clash, redrawn each frame from a
 * typed-array pool of BURST_POOL bursts (the oldest gives way), so nothing allocates per frame. Effects run on the view
 * tick (smoothed by frame time between ticks), so they hold while the sim is paused. One Arena `postupdate` listener;
 * everything goes with the Arena (shutdown or destroy).
 */

/** Over the fighters (0) and the defence effects (3), under the aim arrow (4) and the super dim (5). */
const DEPTH = 3.5;
const TICK_MS = 20;
export const BURST_POOL = 8;
/** Per burst: x, y, from (view time), under colour, over colour, cancel, flat. */
const BS = 7;

export interface ClashPrefs {
  readonly reduceMotion: boolean;
}

/** Mounts the clash burst in the Arena `scene` for `view`; returns the event consumer. `prefs` is read on each clash. */
export function mountClashView(
  scene: Phaser.Scene,
  view: RenderView,
  prefs: () => ClashPrefs,
): (events: readonly SimEvent[]) => void {
  let g: Phaser.GameObjects.Graphics | undefined;
  const bursts = new Float64Array(BURST_POOL * BS);
  let live = 0;
  let tick = view.tick;
  let drawnTick = tick;
  let sub = 0;
  const now = (): number => tick + sub / TICK_MS;

  const fx = new ClashFx(
    {
      burst(x, y, under, over, cancel, flat): void {
        g ??= scene.add.graphics().setDepth(DEPTH);
        let slot = live;
        if (slot >= BURST_POOL) {
          slot = 0;
          for (let i = 1; i < BURST_POOL; i++) if ((bursts[i * BS + 2] ?? 0) < (bursts[slot * BS + 2] ?? 0)) slot = i;
        } else live++;
        bursts.set([x, y, now(), under, over, cancel ? 1 : 0, flat ? 1 : 0], slot * BS);
      },
    },
    () => prefs().reduceMotion,
  );

  function draw(_time: number, delta: number): void {
    if (!g) return;
    if (drawnTick !== tick) sub = 0;
    else sub = Math.min(TICK_MS - 1, sub + delta);
    drawnTick = tick;
    const t = now();
    g.clear();
    for (let i = live - 1; i >= 0; i--) {
      const o = i * BS;
      const p = Math.min(1, Math.max(0, (t - (bursts[o + 2] ?? 0)) / BURST_TICKS));
      if (p >= 1) {
        live--;
        bursts.copyWithin(o, live * BS, live * BS + BS);
        continue;
      }
      const x = bursts[o] ?? 0;
      const y = bursts[o + 1] ?? 0;
      const r = burstRadius(p, bursts[o + 6] === 1);
      const a = burstAlpha(p);
      // A dark rim reads on light and dark arenas; then the loser (outer) and the winner on top (inner, thicker).
      g.lineStyle(14, 0x000000, 0.35 * a).strokeCircle(x, y, r);
      g.lineStyle(6, bursts[o + 3] ?? 0, a).strokeCircle(x, y, r + 3);
      g.lineStyle(bursts[o + 5] === 1 ? 6 : 8, bursts[o + 4] ?? 0, a).strokeCircle(x, y, r - 4);
      if (bursts[o + 5] === 1) g.fillStyle(0xffffff, 0.8 * a).fillCircle(x, y, r * 0.35);
    }
  }

  const off = (): void => {
    scene.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    g?.destroy();
    g = undefined;
    live = 0;
  };
  scene.events.on('postupdate', draw);
  scene.events.once('shutdown', off).once('destroy', off);
  return (events) => {
    tick = view.tick;
    sub = 0;
    fx.consume(events);
  };
}
