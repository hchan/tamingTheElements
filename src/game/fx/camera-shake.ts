import type Phaser from 'phaser';

/**
 * Camera shake without Phaser's matrix offset. `Camera.shake` translates the camera matrix after the view is built, and in
 * Phaser 4.2 a character drawn while that offset is live comes out clipped to jagged rectangles and wedges (QA r16: Pax's
 * hurt frame on the water stage). The effect still runs (timing, progress, `isRunning`, our decay), but its matrix hook is
 * a no-op and the same offset is applied to the camera scroll for the render only, then taken back.
 */
export function mountShakeScroll(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  const fx = cam.shakeEffect as unknown as { isRunning: boolean; _offsetX: number; _offsetY: number; preRender: () => void };
  fx.preRender = (): void => undefined;
  let dx = 0;
  let dy = 0;
  const before = (): void => {
    if (!fx.isRunning) return;
    dx = Math.round(fx._offsetX / cam.zoom);
    dy = Math.round(fx._offsetY / cam.zoom);
    cam.scrollX -= dx;
    cam.scrollY -= dy;
  };
  const after = (): void => {
    cam.scrollX += dx;
    cam.scrollY += dy;
    dx = 0;
    dy = 0;
  };
  scene.events.on('prerender', before);
  scene.events.on('postrender', after);
  scene.events.once('shutdown', () => {
    scene.events.off('prerender', before);
    scene.events.off('postrender', after);
  });
}
