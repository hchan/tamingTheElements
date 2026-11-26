import type Phaser from 'phaser';
import { opaqueColumns, setFrameOpaque } from './opaque-span';

/**
 * Measures the opaque columns of every listed frame of texture `key` and stores them on the frames (see opaque-span.ts).
 * Needs a readable source image; with none (tests, odd sources) or on any error the frames stay unmeasured and keep the box.
 */
export function scanFrameOpaque(scene: Phaser.Scene, key: string, frames: readonly { readonly name: string; readonly rect: { x: number; y: number; w: number; h: number } }[]): void {
  try {
    if (typeof document === 'undefined') return;
    const tex = scene.textures.get(key);
    const src = tex.getSourceImage() as CanvasImageSource & { width: number; height: number };
    if (!(src.width > 0)) return;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    for (const { name, rect } of frames) {
      c.width = rect.w;
      c.height = rect.h;
      ctx.clearRect(0, 0, rect.w, rect.h);
      ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
      const cols = opaqueColumns(ctx.getImageData(0, 0, rect.w, rect.h).data, rect.w, rect.h);
      if (cols !== undefined) setFrameOpaque(tex.get(name), cols);
    }
  } catch {
    /* unmeasured frames keep the box */
  }
}
